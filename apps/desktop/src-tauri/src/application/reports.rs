use std::sync::Arc;

use chrono::Datelike;
use serde::{Deserialize, Serialize};

use crate::domain::trade::{Trade, TradeRepository, TradeSide};
use crate::domain::trade_stats::{self, DailyPnl, EquityPoint, GroupBreakdown, TradeStats};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct AccountReport {
    pub stats: TradeStats,
    pub equity_curve: Vec<EquityPoint>,
    pub calendar: Vec<DailyPnl>,
    pub by_strategy: Vec<GroupBreakdown>,
    pub by_instrument: Vec<GroupBreakdown>,
}

/// Filtr wspólny dla wszystkich podraportów zakładki "Raporty" (sekcja "Wspólny lepki pasek
/// filtrów"). `account_id` jest wymagane - każdy raport (poza "Porównaniem kont", które ma
/// osobną komendę operującą na wielu kontach naraz) dotyczy jednego konta. Pozostałe pola
/// zawężają dalej: `None` = brak zawężenia po tym wymiarze.
#[derive(Debug, Clone, Deserialize)]
pub struct ReportFilter {
    pub account_id: String,
    pub instrument_id: Option<String>,
    pub strategy_id: Option<String>,
    pub interval_id: Option<String>,
    pub side: Option<TradeSide>,
    /// Rok zamknięcia (`closed_at`) - transakcje bez `closed_at` (szkice/otwarte) są wykluczone,
    /// gdy ten filtr jest ustawiony, bo z definicji nie należą do żadnego zamknietego okresu.
    pub year: Option<i32>,
    /// Miesiąc zamknięcia (1-12) - brany pod uwagę tylko razem z `year`.
    pub month: Option<u32>,
}

fn matches_filter(trade: &Trade, filter: &ReportFilter) -> bool {
    if let Some(instrument_id) = &filter.instrument_id {
        if trade.instrument_id.as_deref() != Some(instrument_id.as_str()) {
            return false;
        }
    }
    if let Some(strategy_id) = &filter.strategy_id {
        if trade.strategy_id.as_deref() != Some(strategy_id.as_str()) {
            return false;
        }
    }
    if let Some(interval_id) = &filter.interval_id {
        if trade.interval_id.as_deref() != Some(interval_id.as_str()) {
            return false;
        }
    }
    if let Some(side) = filter.side {
        if trade.side != side {
            return false;
        }
    }
    if let Some(year) = filter.year {
        let Some(closed_at) = trade.closed_at else {
            return false;
        };
        if closed_at.year() != year {
            return false;
        }
        if let Some(month) = filter.month {
            if closed_at.month() != month {
                return false;
            }
        }
    }
    true
}

/// Rozszerzony raport dla zakładki "Raporty" (Faza 9) - jeden silnik metryk (`domain::
/// trade_stats`) użyty przez wszystkie podraporty (Miesięczny/Roczny/Instrument/Strategia), żeby
/// liczby nigdy się nie rozjechały między KPI/wykresami/tabelami.
#[derive(Debug, Clone, Serialize)]
pub struct FilteredReport {
    pub stats: TradeStats,
    pub equity_curve: Vec<EquityPoint>,
    pub calendar: Vec<DailyPnl>,
    pub by_strategy: Vec<GroupBreakdown>,
    pub by_instrument: Vec<GroupBreakdown>,
    pub monthly: Vec<GroupBreakdown>,
    pub yearly: Vec<GroupBreakdown>,
    pub by_day_of_week: Vec<GroupBreakdown>,
}

/// Jeden wiersz podraportu "Porównanie kont" - statystyki policzone niezależnie dla każdego
/// konta (frontend już ma listę kont z nazwą/walutą, dołącza je po `account_id`).
#[derive(Debug, Clone, Serialize)]
pub struct AccountComparisonRow {
    pub account_id: String,
    pub stats: TradeStats,
}

/// Warstwa aplikacyjna raportów: pobiera transakcje konta RAZ i liczy z nich wszystkie
/// widoki naraz (dashboard, kalendarz, rozbicia) - unika wielokrotnych zapytań do bazy dla
/// jednego ekranu. Same przeliczenia są czystymi funkcjami w `domain::trade_stats`.
pub struct ReportsService {
    trades: Arc<dyn TradeRepository + Send + Sync>,
}

impl ReportsService {
    pub fn new(trades: Arc<dyn TradeRepository + Send + Sync>) -> Self {
        Self { trades }
    }

    pub fn get_account_report(&self, account_id: &str) -> Result<AccountReport, AppError> {
        let trades = self.trades.list(account_id, false)?;
        Ok(AccountReport {
            stats: trade_stats::compute_stats(&trades),
            equity_curve: trade_stats::compute_equity_curve(&trades),
            calendar: trade_stats::compute_calendar(&trades),
            by_strategy: trade_stats::compute_strategy_breakdown(&trades),
            by_instrument: trade_stats::compute_instrument_breakdown(&trades),
        })
    }

    pub fn get_filtered_report(&self, filter: ReportFilter) -> Result<FilteredReport, AppError> {
        let all_trades = self.trades.list(&filter.account_id, false)?;
        let trades: Vec<Trade> = all_trades
            .into_iter()
            .filter(|t| matches_filter(t, &filter))
            .collect();
        Ok(FilteredReport {
            stats: trade_stats::compute_stats(&trades),
            equity_curve: trade_stats::compute_equity_curve(&trades),
            calendar: trade_stats::compute_calendar(&trades),
            by_strategy: trade_stats::compute_strategy_breakdown(&trades),
            by_instrument: trade_stats::compute_instrument_breakdown(&trades),
            monthly: trade_stats::compute_monthly_breakdown(&trades),
            yearly: trade_stats::compute_yearly_breakdown(&trades),
            by_day_of_week: trade_stats::compute_day_of_week_breakdown(&trades),
        })
    }

    pub fn compare_accounts(
        &self,
        account_ids: Vec<String>,
    ) -> Result<Vec<AccountComparisonRow>, AppError> {
        account_ids
            .into_iter()
            .map(|account_id| {
                let trades = self.trades.list(&account_id, false)?;
                Ok(AccountComparisonRow {
                    account_id,
                    stats: trade_stats::compute_stats(&trades),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::trade::{TradeInput, TradeWrite};
    use crate::domain::trade_calculations::TradeCalculation;
    use crate::infrastructure::sqlite_trade_repository::SqliteTradeRepository;
    use rust_decimal_macros::dec;
    use std::sync::Mutex;

    fn service_with_fresh_db() -> (ReportsService, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
             VALUES ('acc-1', 'Konto 1', 'USD', '1000', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("insert account");
        let instrument_id: String = conn
            .query_row(
                "SELECT id FROM instruments WHERE display_symbol = 'EURUSD'",
                [],
                |row| row.get(0),
            )
            .expect("EURUSD musi istnieć w fabrycznym katalogu");
        let conn = Arc::new(Mutex::new(conn));
        let repo = SqliteTradeRepository::new(conn.clone());

        let write = |net_pnl_override: rust_decimal::Decimal, closed_at: &str, side: TradeSide| {
            TradeWrite {
                input: TradeInput {
                    account_id: "acc-1".to_string(),
                    instrument_id: Some(instrument_id.clone()),
                    strategy_id: None,
                    side,
                    opened_at: Some(closed_at.parse().unwrap()),
                    closed_at: Some(closed_at.parse().unwrap()),
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
                    pnl_override: Some(crate::domain::trade::ManualPnlOverride {
                        net_pnl: net_pnl_override,
                        reason: "test".to_string(),
                    }),
                    emotions: None,
                    checklist: None,
                },
                calculation: TradeCalculation::default(),
                instrument_snapshot: None,
                strategy_snapshot: None,
                interval_snapshot: None,
            }
        };

        repo.create(&write(dec!(100), "2026-01-05T10:00:00Z", TradeSide::Buy))
            .expect("create buy");
        repo.create(&write(dec!(-40), "2026-02-10T10:00:00Z", TradeSide::Sell))
            .expect("create sell");

        (
            ReportsService::new(Arc::new(SqliteTradeRepository::new(conn))),
            dir,
        )
    }

    #[test]
    fn filtered_report_with_no_filters_matches_full_account_report() {
        let (service, _dir) = service_with_fresh_db();
        let full = service.get_account_report("acc-1").expect("account report");
        let filtered = service
            .get_filtered_report(ReportFilter {
                account_id: "acc-1".to_string(),
                instrument_id: None,
                strategy_id: None,
                interval_id: None,
                side: None,
                year: None,
                month: None,
            })
            .expect("filtered report");
        assert_eq!(filtered.stats.closed_trades, full.stats.closed_trades);
        assert_eq!(filtered.stats.net_pnl, full.stats.net_pnl);
        assert_eq!(filtered.monthly.len(), 2);
        assert_eq!(filtered.yearly.len(), 1);
        assert_eq!(filtered.by_day_of_week.len(), 7);
    }

    #[test]
    fn filtered_report_narrows_by_side() {
        let (service, _dir) = service_with_fresh_db();
        let filtered = service
            .get_filtered_report(ReportFilter {
                account_id: "acc-1".to_string(),
                instrument_id: None,
                strategy_id: None,
                interval_id: None,
                side: Some(TradeSide::Buy),
                year: None,
                month: None,
            })
            .expect("filtered report");
        assert_eq!(filtered.stats.closed_trades, 1);
        assert_eq!(filtered.stats.net_pnl, dec!(100));
    }

    #[test]
    fn filtered_report_narrows_by_year_and_month() {
        let (service, _dir) = service_with_fresh_db();
        let filtered = service
            .get_filtered_report(ReportFilter {
                account_id: "acc-1".to_string(),
                instrument_id: None,
                strategy_id: None,
                interval_id: None,
                side: None,
                year: Some(2026),
                month: Some(2),
            })
            .expect("filtered report");
        assert_eq!(filtered.stats.closed_trades, 1);
        assert_eq!(filtered.stats.net_pnl, dec!(-40));
    }

    #[test]
    fn compare_accounts_returns_one_row_per_account() {
        let (service, _dir) = service_with_fresh_db();
        let rows = service
            .compare_accounts(vec!["acc-1".to_string()])
            .expect("compare accounts");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].account_id, "acc-1");
        assert_eq!(rows[0].stats.net_pnl, dec!(60));
    }
}
