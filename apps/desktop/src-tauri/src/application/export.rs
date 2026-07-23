use std::sync::Arc;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use rust_xlsxwriter::{Format, Workbook};

use crate::application::accounts::AccountsService;
use crate::domain::export_filter::{self, ExportFilter};
use crate::domain::trade::{Trade, TradeRepository, TradeSide, TradeStatus};
use crate::domain::trade_stats;
use crate::error::AppError;
use crate::infrastructure::pdf_report::{self, PdfReportInput};

const CSV_HEADERS: [&str; 19] = [
    "#",
    "Instrument",
    "Strategia",
    "Kierunek",
    "Status",
    "Data otwarcia",
    "Data zamknięcia",
    "Lot",
    "Cena wejścia",
    "Cena wyjścia",
    "Stop Loss",
    "Take Profit",
    "Prowizja",
    "Swap",
    "Inne opłaty",
    "Wynik brutto",
    "Wynik netto",
    "R",
    "Tagi",
];

const PDF_HEADERS: [&str; 6] = [
    "#",
    "Instrument",
    "Kierunek",
    "Otwarcie",
    "Zamknięcie",
    "Wynik netto",
];

fn side_label(side: TradeSide) -> &'static str {
    match side {
        TradeSide::Buy => "BUY",
        TradeSide::Sell => "SELL",
    }
}

fn status_label(status: TradeStatus) -> &'static str {
    match status {
        TradeStatus::Draft => "Szkic",
        TradeStatus::Open => "Otwarta",
        TradeStatus::Closed => "Zamknięta",
    }
}

fn opt_decimal_str(value: Option<Decimal>) -> String {
    value.map(|d| d.to_string()).unwrap_or_default()
}

fn opt_date_str(value: Option<DateTime<Utc>>) -> String {
    value
        .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_default()
}

fn decimal_to_f64(value: Decimal) -> f64 {
    value.to_string().parse().unwrap_or(0.0)
}

fn csv_row(trade: &Trade) -> Vec<String> {
    vec![
        trade.display_number.to_string(),
        trade
            .instrument_spec_snapshot
            .as_ref()
            .map(|s| s.display_symbol.clone())
            .unwrap_or_default(),
        trade
            .strategy_snapshot
            .as_ref()
            .map(|s| s.name.clone())
            .unwrap_or_default(),
        side_label(trade.side).to_string(),
        status_label(trade.status).to_string(),
        opt_date_str(trade.opened_at),
        opt_date_str(trade.closed_at),
        opt_decimal_str(trade.volume),
        opt_decimal_str(trade.entry_price),
        opt_decimal_str(trade.exit_price),
        opt_decimal_str(trade.stop_loss),
        opt_decimal_str(trade.take_profit),
        trade.commission.to_string(),
        trade.swap.to_string(),
        trade.other_fees.to_string(),
        opt_decimal_str(trade.gross_pnl),
        opt_decimal_str(trade.net_pnl),
        opt_decimal_str(trade.pnl_r),
        trade.tags.join("; "),
    ]
}

/// Warstwa aplikacyjna eksportu: CSV/XLSX zawierają pełne dane transakcji (do dalszej analizy
/// poza aplikacją), PDF to zwięzły raport (podsumowanie + kompaktowa tabela) - inny odbiorca,
/// inny zakres, więc celowo różne zestawy kolumn zamiast jednego uniwersalnego eksportu.
pub struct ExportService {
    trades: Arc<dyn TradeRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
}

impl ExportService {
    pub fn new(
        trades: Arc<dyn TradeRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
    ) -> Self {
        Self { trades, accounts }
    }

    pub fn export_csv(
        &self,
        account_id: &str,
        destination: &str,
        filter: Option<&ExportFilter>,
    ) -> Result<(), AppError> {
        let trades = export_filter::apply(self.trades.list(account_id, false)?, filter);
        let mut writer = csv::WriterBuilder::new()
            .from_path(destination)
            .map_err(|e| AppError::Io(e.to_string()))?;
        writer
            .write_record(CSV_HEADERS)
            .map_err(|e| AppError::Io(e.to_string()))?;
        for trade in &trades {
            writer
                .write_record(csv_row(trade))
                .map_err(|e| AppError::Io(e.to_string()))?;
        }
        writer.flush()?;
        Ok(())
    }

    pub fn export_xlsx(
        &self,
        account_id: &str,
        destination: &str,
        filter: Option<&ExportFilter>,
    ) -> Result<(), AppError> {
        let trades = export_filter::apply(self.trades.list(account_id, false)?, filter);
        let mut workbook = Workbook::new();
        let bold = Format::new().set_bold();
        let worksheet = workbook.add_worksheet();

        for (col, header) in CSV_HEADERS.iter().enumerate() {
            worksheet
                .write_with_format(0, col as u16, *header, &bold)
                .map_err(|e| AppError::Io(e.to_string()))?;
            worksheet
                .set_column_width(col as u16, 14)
                .map_err(|e| AppError::Io(e.to_string()))?;
        }

        for (row_index, trade) in trades.iter().enumerate() {
            let row = (row_index + 1) as u32;
            worksheet
                .write_number(row, 0, trade.display_number as f64)
                .map_err(|e| AppError::Io(e.to_string()))?;
            let strings = [
                trade
                    .instrument_spec_snapshot
                    .as_ref()
                    .map(|s| s.display_symbol.clone())
                    .unwrap_or_default(),
                trade
                    .strategy_snapshot
                    .as_ref()
                    .map(|s| s.name.clone())
                    .unwrap_or_default(),
                side_label(trade.side).to_string(),
                status_label(trade.status).to_string(),
                opt_date_str(trade.opened_at),
                opt_date_str(trade.closed_at),
            ];
            for (offset, value) in strings.iter().enumerate() {
                worksheet
                    .write_string(row, (1 + offset) as u16, value)
                    .map_err(|e| AppError::Io(e.to_string()))?;
            }
            let numbers: [(u16, Option<Decimal>); 8] = [
                (7, trade.volume),
                (8, trade.entry_price),
                (9, trade.exit_price),
                (10, trade.stop_loss),
                (11, trade.take_profit),
                (15, trade.gross_pnl),
                (16, trade.net_pnl),
                (17, trade.pnl_r),
            ];
            for (col, value) in numbers {
                if let Some(value) = value {
                    worksheet
                        .write_number(row, col, decimal_to_f64(value))
                        .map_err(|e| AppError::Io(e.to_string()))?;
                }
            }
            worksheet
                .write_number(row, 12, decimal_to_f64(trade.commission))
                .map_err(|e| AppError::Io(e.to_string()))?;
            worksheet
                .write_number(row, 13, decimal_to_f64(trade.swap))
                .map_err(|e| AppError::Io(e.to_string()))?;
            worksheet
                .write_number(row, 14, decimal_to_f64(trade.other_fees))
                .map_err(|e| AppError::Io(e.to_string()))?;
            worksheet
                .write_string(row, 18, trade.tags.join("; "))
                .map_err(|e| AppError::Io(e.to_string()))?;
        }

        workbook
            .save(destination)
            .map_err(|e| AppError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn export_pdf(
        &self,
        account_id: &str,
        destination: &str,
        filter: Option<&ExportFilter>,
    ) -> Result<(), AppError> {
        let account = self.accounts.get(account_id)?;
        let trades = export_filter::apply(self.trades.list(account_id, false)?, filter);
        let stats = trade_stats::compute_stats(&trades);

        let title = format!(
            "Raport konta: {} ({})",
            account.account.name, account.account.currency
        );
        let subtitle = format!("Wygenerowano: {}", Utc::now().format("%Y-%m-%d %H:%M"));
        let summary_lines = vec![
            format!(
                "Wynik netto: {} {}",
                stats.net_pnl, account.account.currency
            ),
            format!(
                "Win rate: {}",
                stats
                    .win_rate
                    .map(|r| format!("{r:.2}%"))
                    .unwrap_or_else(|| "—".to_string())
            ),
            format!(
                "Profit factor: {}",
                stats
                    .profit_factor
                    .map(|r| format!("{r:.2}"))
                    .unwrap_or_else(|| "—".to_string())
            ),
            format!(
                "Transakcje zamknięte: {} (otwarte: {})",
                stats.closed_trades, stats.open_trades
            ),
        ];

        let table_rows = trades
            .iter()
            .filter(|t| t.deleted_at.is_none())
            .map(|t| {
                vec![
                    t.display_number.to_string(),
                    t.instrument_spec_snapshot
                        .as_ref()
                        .map(|s| s.display_symbol.clone())
                        .unwrap_or_default(),
                    side_label(t.side).to_string(),
                    opt_date_str(t.opened_at),
                    opt_date_str(t.closed_at),
                    opt_decimal_str(t.net_pnl),
                ]
            })
            .collect();

        pdf_report::generate(
            &PdfReportInput {
                title,
                subtitle,
                summary_lines,
                table_headers: PDF_HEADERS.iter().map(|h| h.to_string()).collect(),
                table_rows,
            },
            std::path::Path::new(destination),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::accounts::AccountsService;
    use crate::db::{connection, migrations};
    use crate::domain::account::NewAccount;
    use crate::domain::trade::{ManualPnlOverride, TradeInput, TradeRepository, TradeWrite};
    use crate::domain::trade_calculations::TradeCalculation;
    use crate::infrastructure::sqlite_account_repository::SqliteAccountRepository;
    use crate::infrastructure::sqlite_cash_operation_repository::SqliteCashOperationRepository;
    use crate::infrastructure::sqlite_trade_repository::SqliteTradeRepository;
    use rust_decimal_macros::dec;
    use std::sync::Mutex;

    fn setup() -> (ExportService, String, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));

        let accounts = Arc::new(AccountsService::new(
            Arc::new(SqliteAccountRepository::new(conn.clone())),
            Arc::new(SqliteCashOperationRepository::new(conn.clone())),
            Arc::new(SqliteTradeRepository::new(conn.clone())),
        ));
        let account = accounts
            .create(NewAccount {
                name: "Konto testowe".to_string(),
                description: None,
                account_type: None,
                currency: "USD".to_string(),
                initial_balance: dec!(10000),
            })
            .expect("create account");

        let trade_repo = SqliteTradeRepository::new(conn.clone());
        let instrument_id: String = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT id FROM instruments WHERE display_symbol = 'EURUSD'",
                [],
                |row| row.get(0),
            )
            .expect("EURUSD musi istnieć w fabrycznym katalogu");
        let base_input = |net_pnl_override: Option<Decimal>| TradeInput {
            account_id: account.account.id.clone(),
            instrument_id: Some(instrument_id.clone()),
            strategy_id: None,
            side: TradeSide::Buy,
            opened_at: Some(Utc::now()),
            closed_at: Some(Utc::now()),
            interval_id: None,
            session: None,
            volume: Some(dec!(1)),
            entry_price: Some(dec!(1.1)),
            stop_loss: None,
            take_profit: None,
            exit_price: Some(dec!(1.11)),
            commission: dec!(0),
            swap: dec!(0),
            other_fees: dec!(0),
            conversion_rate: None,
            plan_before: None,
            management_notes: None,
            post_trade_summary: None,
            conclusion: None,
            plan_adherence_rating: None,
            pnl_override: net_pnl_override.map(|net_pnl| ManualPnlOverride {
                net_pnl,
                reason: "test".to_string(),
            }),
            emotions: None,
            checklist: None,
            partial_closes: vec![],
        };
        for override_value in [None, Some(dec!(42))] {
            trade_repo
                .create(&TradeWrite {
                    input: base_input(override_value),
                    calculation: TradeCalculation {
                        gross_pnl: Some(dec!(100)),
                        net_pnl: Some(dec!(100)),
                        ..TradeCalculation::default()
                    },
                    instrument_snapshot: None,
                    strategy_snapshot: None,
                    interval_snapshot: None,
                })
                .expect("create trade");
        }

        let export = ExportService::new(Arc::new(trade_repo), accounts);
        (export, account.account.id, dir)
    }

    #[test]
    fn export_csv_writes_a_header_and_one_row_per_trade() {
        let (export, account_id, dir) = setup();
        let destination = dir.path().join("export.csv");
        export
            .export_csv(&account_id, destination.to_str().unwrap(), None)
            .expect("export csv");

        let contents = std::fs::read_to_string(&destination).expect("read csv");
        let lines: Vec<&str> = contents.lines().filter(|l| !l.is_empty()).collect();
        assert_eq!(lines.len(), 3, "nagłówek + 2 transakcje");
        assert!(lines[0].contains("Instrument"));
    }

    /// Eksport z zakładki Raporty musi zwrócić DOKŁADNIE ten wycinek, który widać na ekranie.
    /// Test pilnuje, że filtr faktycznie dociera do zapisu pliku, a nie jest przyjmowany i
    /// po cichu ignorowany - to najgroźniejszy możliwy błąd tej funkcji.
    #[test]
    fn export_csv_respects_the_report_filter() {
        use chrono::Datelike;
        let (export, account_id, dir) = setup();

        // Obie transakcje w fabryce są BUY - zawężenie do SELL musi zostawić sam nagłówek.
        let tylko_sell = ExportFilter {
            side: Some(TradeSide::Sell),
            ..Default::default()
        };
        let sell_path = dir.path().join("sell.csv");
        export
            .export_csv(&account_id, sell_path.to_str().unwrap(), Some(&tylko_sell))
            .expect("export csv");
        let sell = std::fs::read_to_string(&sell_path).expect("read csv");
        assert_eq!(sell.lines().filter(|l| !l.is_empty()).count(), 1);

        // Ten sam eksport zawężony do roku otwarcia musi zawierać obie transakcje.
        let biezacy_rok = ExportFilter {
            year: Some(Utc::now().year()),
            ..Default::default()
        };
        let rok_path = dir.path().join("rok.csv");
        export
            .export_csv(&account_id, rok_path.to_str().unwrap(), Some(&biezacy_rok))
            .expect("export csv");
        let rok = std::fs::read_to_string(&rok_path).expect("read csv");
        assert_eq!(rok.lines().filter(|l| !l.is_empty()).count(), 3);
    }

    #[test]
    fn export_xlsx_produces_a_valid_zip_container() {
        let (export, account_id, dir) = setup();
        let destination = dir.path().join("export.xlsx");
        export
            .export_xlsx(&account_id, destination.to_str().unwrap(), None)
            .expect("export xlsx");

        let bytes = std::fs::read(&destination).expect("read xlsx");
        assert!(bytes.len() > 100);
        assert_eq!(&bytes[0..2], b"PK", "plik xlsx to archiwum ZIP");
    }

    #[test]
    fn export_pdf_produces_a_valid_pdf_file() {
        let (export, account_id, dir) = setup();
        let destination = dir.path().join("export.pdf");
        export
            .export_pdf(&account_id, destination.to_str().unwrap(), None)
            .expect("export pdf");

        let bytes = std::fs::read(&destination).expect("read pdf");
        assert!(
            bytes.starts_with(b"%PDF"),
            "plik powinien zaczynać się od magicznych bajtów %PDF"
        );
    }
}
