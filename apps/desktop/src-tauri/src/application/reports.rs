use std::sync::Arc;

use chrono::{DateTime, Datelike, Local, TimeZone, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::application::accounts::AccountsService;
use crate::domain::balance::{compute_period_balance, PeriodBalanceSummary};
use crate::domain::trade::{Trade, TradeRepository, TradeSide};
use crate::domain::trade_stats::{
    self, DailyPnl, EquityPoint, GroupBreakdown, PnlDistributionBucket, TopTradeRow, TradeStats,
};
use crate::error::AppError;

const TOP_TRADES_COUNT: usize = 5;

#[derive(Debug, Clone, Serialize)]
pub struct AccountReport {
    pub stats: TradeStats,
    pub equity_curve: Vec<EquityPoint>,
    pub calendar: Vec<DailyPnl>,
    pub by_strategy: Vec<GroupBreakdown>,
    pub by_instrument: Vec<GroupBreakdown>,
}

/// Chwila W LOKALNEJ STREFIE CZASOWEJ - transakcja zamknięta tuż po lokalnej północy jest
/// w UTC wciąż poprzednim dniem, więc porównanie roku/miesiąca wprost na `DateTime<Utc>` mogło
/// przypisać ją do złego okresu (ta sama poprawka co w `domain::trade_stats::zamkniecie_lokalnie`
/// i `domain::export_filter`).
fn lokalnie(at: DateTime<Utc>) -> DateTime<Local> {
    at.with_timezone(&Local)
}

/// `pub(crate)` (a nie prywatne) tylko po to, żeby `domain::export_filter` mogło w testach
/// wprost porównać się z tą funkcją i udowodnić, że oba filtry (Raporty i eksport) zawężają
/// po tym samym wymiarze czasu - patrz `export_filter::tests::zgodnosc_z_filtrem_raportow_*`.
pub(crate) fn matches_dimensions(
    trade: &Trade,
    instrument_id: Option<&str>,
    strategy_id: Option<&str>,
    interval_id: Option<&str>,
    side: Option<TradeSide>,
    year: Option<i32>,
    month: Option<u32>,
) -> bool {
    if let Some(instrument_id) = instrument_id {
        if trade.instrument_id.as_deref() != Some(instrument_id) {
            return false;
        }
    }
    if let Some(strategy_id) = strategy_id {
        if trade.strategy_id.as_deref() != Some(strategy_id) {
            return false;
        }
    }
    if let Some(interval_id) = interval_id {
        if trade.interval_id.as_deref() != Some(interval_id) {
            return false;
        }
    }
    if let Some(side) = side {
        if trade.side != side {
            return false;
        }
    }
    if let Some(year) = year {
        let Some(closed_at) = trade.closed_at else {
            return false;
        };
        let closed_at = lokalnie(closed_at);
        if closed_at.year() != year {
            return false;
        }
        if let Some(month) = month {
            if closed_at.month() != month {
                return false;
            }
        }
    }
    true
}

/// Początek dnia (00:00) w LOKALNEJ strefie czasowej, zwrócony jako `DateTime<Utc>` - inaczej
/// granica okresu byłaby przesunięta o offset strefy (np. "1 marca" wypadałoby o 23:00/22:00
/// poprzedniego dnia UTC), więc pierwsza godzina lub dwie lokalnego 1 marca trafiałyby jeszcze
/// do lutego. `LocalResult::Ambiguous` (cofnięcie zegara) bierze wcześniejszy wariant,
/// `None` (przeskoczenie zegara, praktycznie nieosiągalne o północy) spada na samo UTC.
fn poczatek_dnia_lokalnie(year: i32, month: u32, day: u32) -> DateTime<Utc> {
    match Local.with_ymd_and_hms(year, month, day, 0, 0, 0) {
        chrono::LocalResult::Single(dt) => dt.with_timezone(&Utc),
        chrono::LocalResult::Ambiguous(dt, _) => dt.with_timezone(&Utc),
        chrono::LocalResult::None => Utc.with_ymd_and_hms(year, month, day, 0, 0, 0).unwrap(),
    }
}

/// `[start, end)` wyznaczony przez rok/miesiąc filtru - używany do zawężania transakcji ORAZ do
/// wyznaczenia okresu dla `compute_period_balance`. `(None, None)` = brak zawężenia okresu
/// (cały czas). Granice liczone w LOKALNEJ strefie czasowej (patrz `poczatek_dnia_lokalnie`).
fn period_bounds(
    year: Option<i32>,
    month: Option<u32>,
) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
    match (year, month) {
        (Some(year), Some(month)) => {
            let start = poczatek_dnia_lokalnie(year, month, 1);
            let end = if month == 12 {
                poczatek_dnia_lokalnie(year + 1, 1, 1)
            } else {
                poczatek_dnia_lokalnie(year, month + 1, 1)
            };
            (Some(start), Some(end))
        }
        (Some(year), None) => {
            let start = poczatek_dnia_lokalnie(year, 1, 1);
            let end = poczatek_dnia_lokalnie(year + 1, 1, 1);
            (Some(start), Some(end))
        }
        _ => (None, None),
    }
}

/// Filtr wspólny dla wszystkich podraportów zakładki "Raporty" (sekcja "Wspólny lepki pasek
/// filtrów"). `account_id` jest wymagane - każdy raport (poza "Porównaniem kont", które ma
/// osobny filtr bez konta) dotyczy jednego konta. Pozostałe pola zawężają dalej: `None` = brak
/// zawężenia po tym wymiarze.
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

/// Ten sam zestaw wymiarów co `ReportFilter`, ale bez konta - podraport "Porównanie kont"
/// zawęża wszystkie konta na raz tym samym filtrem, licząc dla każdego z nich osobny wiersz.
#[derive(Debug, Clone, Deserialize)]
pub struct AccountComparisonFilter {
    pub instrument_id: Option<String>,
    pub strategy_id: Option<String>,
    pub interval_id: Option<String>,
    pub side: Option<TradeSide>,
    pub year: Option<i32>,
    pub month: Option<u32>,
}

/// Rozszerzony raport dla zakładki "Raporty" - jeden silnik metryk (`domain::trade_stats`/
/// `domain::balance`) użyty przez wszystkie podraporty, żeby liczby nigdy się nie rozjechały
/// między KPI/wykresami/tabelami. `month_calendar` jest pusta, jeśli filtr nie ma ustawionych
/// jednocześnie `year` i `month` (kalendarz ma sens tylko dla jednego konkretnego miesiąca).
#[derive(Debug, Clone, Serialize)]
pub struct FilteredReport {
    pub stats: TradeStats,
    pub equity_curve: Vec<EquityPoint>,
    pub calendar: Vec<DailyPnl>,
    pub by_strategy: Vec<GroupBreakdown>,
    pub by_instrument: Vec<GroupBreakdown>,
    pub by_interval: Vec<GroupBreakdown>,
    pub monthly: Vec<GroupBreakdown>,
    pub yearly: Vec<GroupBreakdown>,
    pub quarterly: Vec<GroupBreakdown>,
    pub calendar_months: Vec<GroupBreakdown>,
    pub by_day_of_week: Vec<GroupBreakdown>,
    pub by_four_hour: Vec<GroupBreakdown>,
    pub by_side: Vec<GroupBreakdown>,
    pub top_best_trades: Vec<TopTradeRow>,
    pub top_worst_trades: Vec<TopTradeRow>,
    pub pnl_distribution: Vec<PnlDistributionBucket>,
    pub month_calendar: Vec<DailyPnl>,
    pub period_balance: PeriodBalanceSummaryDto,
}

/// Kopia `domain::balance::PeriodBalanceSummary` z `Serialize` - `PeriodBalanceSummary` samo
/// nie serializuje się, żeby domena nie musiała znać serde (podobnie jak reszta `domain::balance`).
#[derive(Debug, Clone, Serialize)]
pub struct PeriodBalanceSummaryDto {
    pub starting_balance: Decimal,
    pub ending_balance: Decimal,
    pub net_cash_flow: Decimal,
    pub return_percent: Option<Decimal>,
    pub max_drawdown: Decimal,
    pub max_drawdown_percent: Option<Decimal>,
}

impl From<PeriodBalanceSummary> for PeriodBalanceSummaryDto {
    fn from(value: PeriodBalanceSummary) -> Self {
        Self {
            starting_balance: value.starting_balance,
            ending_balance: value.ending_balance,
            net_cash_flow: value.net_cash_flow,
            return_percent: value.return_percent,
            max_drawdown: value.max_drawdown,
            max_drawdown_percent: value.max_drawdown_percent,
        }
    }
}

/// Jeden wiersz podraportu "Porównanie kont" - statystyki i saldo policzone niezależnie dla
/// każdego konta (frontend już ma listę kont z nazwą/walutą, dołącza je po `account_id`).
#[derive(Debug, Clone, Serialize)]
pub struct AccountComparisonRow {
    pub account_id: String,
    pub stats: TradeStats,
    pub period_balance: PeriodBalanceSummaryDto,
}

/// Warstwa aplikacyjna raportów: pobiera transakcje konta RAZ i liczy z nich wszystkie
/// widoki naraz (dashboard, kalendarz, rozbicia) - unika wielokrotnych zapytań do bazy dla
/// jednego ekranu. Same przeliczenia są czystymi funkcjami w `domain::trade_stats`/
/// `domain::balance`. `accounts` daje dostęp do salda początkowego konta i operacji
/// gotówkowych (potrzebne do salda/zwrotu/wpłat-wypłat w okresie) - bez tego serwis miałby
/// tylko transakcje, a saldo to więcej niż tylko wynik transakcji.
pub struct ReportsService {
    trades: Arc<dyn TradeRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
}

impl ReportsService {
    pub fn new(
        trades: Arc<dyn TradeRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
    ) -> Self {
        Self { trades, accounts }
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

    fn period_balance_for_account(
        &self,
        account_id: &str,
        year: Option<i32>,
        month: Option<u32>,
        all_trades: &[Trade],
    ) -> Result<PeriodBalanceSummaryDto, AppError> {
        let account = self.accounts.get(account_id)?;
        let operations = self.accounts.list_cash_operations(account_id)?;
        let (period_start, period_end) = period_bounds(year, month);
        Ok(compute_period_balance(
            account.account.initial_balance,
            &operations,
            all_trades,
            period_start,
            period_end,
        )
        .into())
    }

    pub fn get_filtered_report(&self, filter: ReportFilter) -> Result<FilteredReport, AppError> {
        let all_trades = self.trades.list(&filter.account_id, false)?;
        let trades: Vec<Trade> = all_trades
            .iter()
            .filter(|t| {
                matches_dimensions(
                    t,
                    filter.instrument_id.as_deref(),
                    filter.strategy_id.as_deref(),
                    filter.interval_id.as_deref(),
                    filter.side,
                    filter.year,
                    filter.month,
                )
            })
            .cloned()
            .collect();

        let month_calendar = match (filter.year, filter.month) {
            (Some(year), Some(month)) => trade_stats::compute_month_calendar(&trades, year, month),
            _ => Vec::new(),
        };
        let period_balance = self.period_balance_for_account(
            &filter.account_id,
            filter.year,
            filter.month,
            &all_trades,
        )?;

        Ok(FilteredReport {
            stats: trade_stats::compute_stats(&trades),
            equity_curve: trade_stats::compute_equity_curve(&trades),
            calendar: trade_stats::compute_calendar(&trades),
            by_strategy: trade_stats::compute_strategy_breakdown(&trades),
            by_instrument: trade_stats::compute_instrument_breakdown(&trades),
            by_interval: trade_stats::compute_interval_breakdown(&trades),
            monthly: trade_stats::compute_monthly_breakdown(&trades),
            yearly: trade_stats::compute_yearly_breakdown(&trades),
            quarterly: trade_stats::compute_quarterly_breakdown(&trades),
            calendar_months: trade_stats::compute_calendar_month_breakdown(&trades),
            by_day_of_week: trade_stats::compute_day_of_week_breakdown(&trades),
            by_four_hour: trade_stats::compute_four_hour_breakdown(&trades),
            by_side: trade_stats::compute_side_breakdown(&trades),
            top_best_trades: trade_stats::compute_top_trades(&trades, TOP_TRADES_COUNT, true),
            top_worst_trades: trade_stats::compute_top_trades(&trades, TOP_TRADES_COUNT, false),
            pnl_distribution: trade_stats::compute_pnl_distribution(&trades),
            month_calendar,
            period_balance,
        })
    }

    pub fn compare_accounts(
        &self,
        account_ids: Vec<String>,
        filter: AccountComparisonFilter,
    ) -> Result<Vec<AccountComparisonRow>, AppError> {
        account_ids
            .into_iter()
            .map(|account_id| {
                let all_trades = self.trades.list(&account_id, false)?;
                let trades: Vec<Trade> = all_trades
                    .iter()
                    .filter(|t| {
                        matches_dimensions(
                            t,
                            filter.instrument_id.as_deref(),
                            filter.strategy_id.as_deref(),
                            filter.interval_id.as_deref(),
                            filter.side,
                            filter.year,
                            filter.month,
                        )
                    })
                    .cloned()
                    .collect();
                let period_balance = self.period_balance_for_account(
                    &account_id,
                    filter.year,
                    filter.month,
                    &all_trades,
                )?;
                Ok(AccountComparisonRow {
                    account_id,
                    stats: trade_stats::compute_stats(&trades),
                    period_balance,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::accounts::AccountsService;
    use crate::db::{connection, migrations};
    use crate::domain::account::NewAccount;
    use crate::domain::trade::{TradeInput, TradeWrite};
    use crate::domain::trade_calculations::TradeCalculation;
    use crate::infrastructure::sqlite_account_repository::SqliteAccountRepository;
    use crate::infrastructure::sqlite_cash_operation_repository::SqliteCashOperationRepository;
    use crate::infrastructure::sqlite_trade_repository::SqliteTradeRepository;
    use rust_decimal_macros::dec;
    use std::sync::Mutex;

    fn service_with_fresh_db() -> (ReportsService, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let instrument_id: String = conn
            .query_row(
                "SELECT id FROM instruments WHERE display_symbol = 'EURUSD'",
                [],
                |row| row.get(0),
            )
            .expect("EURUSD musi istnieć w fabrycznym katalogu");
        let conn = Arc::new(Mutex::new(conn));

        let accounts_service = Arc::new(AccountsService::new(
            Arc::new(SqliteAccountRepository::new(conn.clone())),
            Arc::new(SqliteCashOperationRepository::new(conn.clone())),
            Arc::new(SqliteTradeRepository::new(conn.clone())),
        ));
        accounts_service
            .create(NewAccount {
                name: "Konto 1".to_string(),
                description: None,
                account_type: None,
                currency: "USD".to_string(),
                initial_balance: dec!(1000),
            })
            .expect("create account");
        // Konto testowe zawsze dostaje id "acc-1" z inicjalizacji wyżej? Nie - id jest
        // generowane przez repozytorium, więc pobieramy je z listy kont.
        let account_id = accounts_service.list(false).expect("list accounts")[0]
            .account
            .id
            .clone();

        let repo = SqliteTradeRepository::new(conn.clone());
        let write = |net_pnl_override: rust_decimal::Decimal, closed_at: &str, side: TradeSide| {
            TradeWrite {
                input: TradeInput {
                    account_id: account_id.clone(),
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
                    partial_closes: vec![],
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
            ReportsService::new(
                Arc::new(SqliteTradeRepository::new(conn.clone())),
                accounts_service,
            ),
            dir,
        )
    }

    fn account_id_of(service: &ReportsService) -> String {
        service.accounts.list(false).expect("list accounts")[0]
            .account
            .id
            .clone()
    }

    #[test]
    fn filtered_report_with_no_filters_matches_full_account_report() {
        let (service, _dir) = service_with_fresh_db();
        let account_id = account_id_of(&service);
        let full = service
            .get_account_report(&account_id)
            .expect("account report");
        let filtered = service
            .get_filtered_report(ReportFilter {
                account_id: account_id.clone(),
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
        assert_eq!(filtered.quarterly.len(), 4);
        assert_eq!(filtered.by_day_of_week.len(), 7);
        assert_eq!(filtered.by_four_hour.len(), 6);
        assert_eq!(filtered.by_side.len(), 2);
        assert_eq!(filtered.top_best_trades.len(), 2);
        assert!(filtered.month_calendar.is_empty()); // brak filtru roku+miesiąca
        assert_eq!(filtered.period_balance.starting_balance, dec!(1000));
        assert_eq!(filtered.period_balance.ending_balance, dec!(1060));
    }

    #[test]
    fn filtered_report_narrows_by_side() {
        let (service, _dir) = service_with_fresh_db();
        let account_id = account_id_of(&service);
        let filtered = service
            .get_filtered_report(ReportFilter {
                account_id,
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
    fn filtered_report_narrows_by_year_and_month_and_fills_month_calendar() {
        let (service, _dir) = service_with_fresh_db();
        let account_id = account_id_of(&service);
        let filtered = service
            .get_filtered_report(ReportFilter {
                account_id: account_id.clone(),
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
        assert_eq!(filtered.month_calendar.len(), 28); // luty 2026
                                                       // Saldo startowe lutego wliczyło już transakcję ze stycznia (+100).
        assert_eq!(filtered.period_balance.starting_balance, dec!(1100));
        assert_eq!(filtered.period_balance.ending_balance, dec!(1060));
    }

    #[test]
    fn compare_accounts_returns_one_row_per_account_with_period_balance() {
        let (service, _dir) = service_with_fresh_db();
        let account_id = account_id_of(&service);
        let rows = service
            .compare_accounts(
                vec![account_id.clone()],
                AccountComparisonFilter {
                    instrument_id: None,
                    strategy_id: None,
                    interval_id: None,
                    side: None,
                    year: None,
                    month: None,
                },
            )
            .expect("compare accounts");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].account_id, account_id);
        assert_eq!(rows[0].stats.net_pnl, dec!(60));
        assert_eq!(rows[0].period_balance.starting_balance, dec!(1000));
        assert_eq!(rows[0].period_balance.ending_balance, dec!(1060));
    }
}
