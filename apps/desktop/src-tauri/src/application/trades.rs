use std::sync::Arc;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::application::accounts::AccountsService;
use crate::application::instruments::InstrumentsService;
use crate::application::strategies::StrategiesService;
use crate::domain::balance::balance_before_after_trade;
use crate::domain::instrument::InstrumentSnapshot;
use crate::domain::strategy::StrategySnapshot;
use crate::domain::trade::{Trade, TradeInput, TradeRepository, TradeWrite};
use crate::domain::trade_audit::{diff_trade_input, TradeAuditEntry, TradeAuditRepository};
use crate::domain::trade_calculations::{self, TradeCalculationInput};
use crate::error::AppError;

/// Saldo konta w kontekście jednej transakcji - do wyświetlenia na karcie transakcji (sekcja
/// "Saldo przed/po/aktualne"). `balance_before`/`balance_after` mają sens tylko dla transakcji
/// zamkniętych (dla otwartych/szkiców obie wartości równają się aktualnemu saldu, bo transakcja
/// jeszcze nie wpłynęła na rachunek).
#[derive(Debug, Clone, Serialize)]
pub struct TradeBalanceContext {
    pub balance_before: Decimal,
    pub balance_after: Decimal,
    pub current_balance: Decimal,
}

/// Warstwa aplikacyjna transakcji: jedyne miejsce, gdzie surowy `TradeInput` z formularza
/// spotyka się z migawką instrumentu/strategii, saldem konta i silnikiem przeliczeń
/// (`domain::trade_calculations`), zanim trafi do repozytorium. Repozytorium nigdy nie liczy
/// pieniędzy samo - dostaje już gotowy `TradeWrite`.
pub struct TradesService {
    trades: Arc<dyn TradeRepository + Send + Sync>,
    audit: Arc<dyn TradeAuditRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
    instruments: Arc<InstrumentsService>,
    strategies: Arc<StrategiesService>,
}

impl TradesService {
    pub fn new(
        trades: Arc<dyn TradeRepository + Send + Sync>,
        audit: Arc<dyn TradeAuditRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
        instruments: Arc<InstrumentsService>,
        strategies: Arc<StrategiesService>,
    ) -> Self {
        Self {
            trades,
            audit,
            accounts,
            instruments,
            strategies,
        }
    }

    /// Podgląd na żywo dla formularza (ryzyko, RR, przewidywany wynik) bez zapisu do bazy -
    /// front-end wywołuje to przy każdej zmianie pola, żeby pokazać liczby zanim użytkownik
    /// zapisze transakcję.
    pub fn preview(
        &self,
        input: &TradeInput,
    ) -> Result<trade_calculations::TradeCalculation, AppError> {
        let instrument_snapshot =
            self.resolve_instrument_snapshot(input.instrument_id.as_deref())?;
        let account_balance = self.accounts.get(&input.account_id).ok().map(|a| a.balance);

        let account_currency = self
            .accounts
            .get(&input.account_id)
            .ok()
            .map(|a| a.account.currency);

        let calc_input = TradeCalculationInput {
            side: Some(input.side),
            entry_price: input.entry_price,
            exit_price: input.exit_price,
            stop_loss: input.stop_loss,
            take_profit: input.take_profit,
            volume: input.volume,
            commission: input.commission,
            swap: input.swap,
            other_fees: input.other_fees,
            instrument: instrument_snapshot
                .as_ref()
                .map(InstrumentSnapshot::as_calc_spec),
            account_balance,
            account_currency,
            conversion_rate: input.conversion_rate,
        };

        Ok(trade_calculations::calculate(&calc_input))
    }

    fn resolve_instrument_snapshot(
        &self,
        instrument_id: Option<&str>,
    ) -> Result<Option<InstrumentSnapshot>, AppError> {
        match instrument_id {
            None => Ok(None),
            Some(id) => {
                let instrument = self.instruments.get(id)?;
                Ok(Some(InstrumentSnapshot::from(&instrument)))
            }
        }
    }

    fn resolve_strategy_snapshot(
        &self,
        strategy_id: Option<&str>,
    ) -> Result<Option<StrategySnapshot>, AppError> {
        match strategy_id {
            None => Ok(None),
            Some(id) => {
                let strategy = self.strategies.get(id)?;
                Ok(Some(StrategySnapshot::from(&strategy)))
            }
        }
    }

    fn build_write(&self, input: TradeInput) -> Result<TradeWrite, AppError> {
        let instrument_snapshot =
            self.resolve_instrument_snapshot(input.instrument_id.as_deref())?;
        let strategy_snapshot = self.resolve_strategy_snapshot(input.strategy_id.as_deref())?;
        let account = self.accounts.get(&input.account_id)?;

        let calc_input = TradeCalculationInput {
            side: Some(input.side),
            entry_price: input.entry_price,
            exit_price: input.exit_price,
            stop_loss: input.stop_loss,
            take_profit: input.take_profit,
            volume: input.volume,
            commission: input.commission,
            swap: input.swap,
            other_fees: input.other_fees,
            instrument: instrument_snapshot
                .as_ref()
                .map(InstrumentSnapshot::as_calc_spec),
            account_balance: Some(account.balance),
            account_currency: Some(account.account.currency.clone()),
            conversion_rate: input.conversion_rate,
        };
        let calculation = trade_calculations::calculate(&calc_input);

        Ok(TradeWrite {
            input,
            calculation,
            instrument_snapshot,
            strategy_snapshot,
        })
    }

    pub fn create(&self, input: TradeInput) -> Result<Trade, AppError> {
        let write = self.build_write(input)?;
        self.trades.create(&write)
    }

    pub fn get(&self, id: &str) -> Result<Trade, AppError> {
        self.trades.get(id)
    }

    pub fn list(&self, account_id: &str, include_deleted: bool) -> Result<Vec<Trade>, AppError> {
        self.trades.list(account_id, include_deleted)
    }

    /// `expected_updated_at` - `Some(...)` gdy wywołujący (karta transakcji w trybie edycji)
    /// wcześniej wczytał tę konkretną transakcję i chce się upewnić, że nikt jej w międzyczasie
    /// nie zmienił (sekcja "Tryb odczytu i przycisk Edytuj" - wykrywanie konfliktu); `None` dla
    /// wywołań, które nie mają wcześniej wczytanego stanu do porównania (np. szybkie zamknięcie
    /// pozycji). Po udanym zapisie dopisuje wpis do lokalnego dziennika zmian, ale tylko jeśli
    /// realnie coś się zmieniło.
    pub fn update(
        &self,
        id: &str,
        expected_updated_at: Option<DateTime<Utc>>,
        input: TradeInput,
    ) -> Result<Trade, AppError> {
        let before = self.trades.get(id)?;
        let write = self.build_write(input)?;
        let changes = diff_trade_input(&before, &write.input);
        let updated = self.trades.update(id, &write, expected_updated_at)?;
        if !changes.is_empty() {
            self.audit.record_change(id, &changes)?;
        }
        Ok(updated)
    }

    pub fn soft_delete(&self, id: &str) -> Result<Trade, AppError> {
        self.trades.soft_delete(id)
    }

    pub fn restore(&self, id: &str) -> Result<Trade, AppError> {
        self.trades.restore(id)
    }

    pub fn list_audit_log(&self, id: &str) -> Result<Vec<TradeAuditEntry>, AppError> {
        self.audit.list_for_trade(id)
    }

    pub fn balance_context(&self, id: &str) -> Result<TradeBalanceContext, AppError> {
        let trade = self.trades.get(id)?;
        let account = self.accounts.get(&trade.account_id)?;
        let operations = self.accounts.list_cash_operations(&trade.account_id)?;
        let closed_trades = self.trades.list(&trade.account_id, false)?;
        let (balance_before, balance_after) = balance_before_after_trade(
            account.account.initial_balance,
            &operations,
            &closed_trades,
            &trade.id,
        );
        Ok(TradeBalanceContext {
            balance_before,
            balance_after,
            current_balance: account.balance,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::account::NewAccount;
    use crate::domain::trade::TradeSide;
    use crate::infrastructure::sqlite_account_repository::SqliteAccountRepository;
    use crate::infrastructure::sqlite_cash_operation_repository::SqliteCashOperationRepository;
    use crate::infrastructure::sqlite_instrument_repository::SqliteInstrumentRepository;
    use crate::infrastructure::sqlite_strategy_repository::SqliteStrategyRepository;
    use crate::infrastructure::sqlite_trade_repository::SqliteTradeRepository;
    use rust_decimal_macros::dec;
    use std::sync::Mutex;

    fn setup() -> (
        TradesService,
        Arc<AccountsService>,
        String,
        String,
        tempfile::TempDir,
    ) {
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
                initial_balance: dec!(1000),
            })
            .expect("create account");

        let instrument_id: String = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT id FROM instruments WHERE display_symbol = 'EURUSD'",
                [],
                |row| row.get(0),
            )
            .expect("EURUSD musi istnieć w fabrycznym katalogu");

        let instruments = Arc::new(InstrumentsService::new(Arc::new(
            SqliteInstrumentRepository::new(conn.clone()),
        )));
        let strategies = Arc::new(StrategiesService::new(Arc::new(
            SqliteStrategyRepository::new(conn.clone()),
        )));
        let trades = TradesService::new(
            Arc::new(SqliteTradeRepository::new(conn.clone())),
            Arc::new(SqliteTradeRepository::new(conn.clone())),
            accounts.clone(),
            instruments,
            strategies,
        );

        (trades, accounts, account.account.id, instrument_id, dir)
    }

    fn closed_trade_input(
        account_id: &str,
        instrument_id: &str,
        net_pnl_override: Decimal,
        closed_at: &str,
    ) -> TradeInput {
        use crate::domain::trade::ManualPnlOverride;
        TradeInput {
            account_id: account_id.to_string(),
            instrument_id: Some(instrument_id.to_string()),
            strategy_id: None,
            side: TradeSide::Buy,
            opened_at: Some(closed_at.parse().unwrap()),
            closed_at: Some(closed_at.parse().unwrap()),
            interval: None,
            session: None,
            volume: Some(dec!(1)),
            entry_price: Some(dec!(1)),
            stop_loss: None,
            take_profit: None,
            exit_price: Some(dec!(1)),
            commission: dec!(0),
            swap: dec!(0),
            other_fees: dec!(0),
            conversion_rate: None,
            plan_before: None,
            management_notes: None,
            post_trade_summary: None,
            conclusion: None,
            plan_adherence_rating: None,
            pnl_override: Some(ManualPnlOverride {
                net_pnl: net_pnl_override,
                reason: "test fixture".to_string(),
            }),
            emotions: None,
            checklist: None,
        }
    }

    #[test]
    fn account_balance_reflects_closed_trades_net_pnl() {
        let (trades, accounts, account_id, instrument_id, _dir) = setup();
        trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(100),
                "2026-01-05T00:00:00Z",
            ))
            .expect("create trade 1");
        trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(-40),
                "2026-01-06T00:00:00Z",
            ))
            .expect("create trade 2");

        let account = accounts.get(&account_id).expect("get account");
        assert_eq!(account.balance, dec!(1060)); // 1000 + 100 - 40
    }

    #[test]
    fn balance_context_reports_before_after_and_current_for_a_closed_trade() {
        let (trades, _accounts, account_id, instrument_id, _dir) = setup();
        let first = trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(100),
                "2026-01-05T00:00:00Z",
            ))
            .expect("create trade 1");
        let second = trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(-40),
                "2026-01-06T00:00:00Z",
            ))
            .expect("create trade 2");

        let ctx_first = trades
            .balance_context(&first.id)
            .expect("balance context 1");
        assert_eq!(ctx_first.balance_before, dec!(1000));
        assert_eq!(ctx_first.balance_after, dec!(1100));
        assert_eq!(ctx_first.current_balance, dec!(1060));

        let ctx_second = trades
            .balance_context(&second.id)
            .expect("balance context 2");
        assert_eq!(ctx_second.balance_before, dec!(1100));
        assert_eq!(ctx_second.balance_after, dec!(1060));
        assert_eq!(ctx_second.current_balance, dec!(1060));
    }

    #[test]
    fn balance_context_for_open_trade_shows_before_equal_to_after() {
        let (trades, _accounts, account_id, instrument_id, _dir) = setup();
        let mut input = closed_trade_input(
            &account_id,
            &instrument_id,
            dec!(100),
            "2026-01-05T00:00:00Z",
        );
        input.closed_at = None;
        input.exit_price = None;
        input.pnl_override = None;
        let open_trade = trades.create(input).expect("create open trade");

        let ctx = trades
            .balance_context(&open_trade.id)
            .expect("balance context");
        assert_eq!(ctx.balance_before, dec!(1000));
        assert_eq!(ctx.balance_after, dec!(1000));
        assert_eq!(ctx.current_balance, dec!(1000));
    }

    #[test]
    fn deleting_a_trade_removes_its_contribution_from_the_account_balance() {
        let (trades, accounts, account_id, instrument_id, _dir) = setup();
        let trade = trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(500),
                "2026-01-05T00:00:00Z",
            ))
            .expect("create trade");
        assert_eq!(accounts.get(&account_id).unwrap().balance, dec!(1500));

        trades.soft_delete(&trade.id).expect("soft delete");
        assert_eq!(accounts.get(&account_id).unwrap().balance, dec!(1000));
    }

    #[test]
    fn updating_a_trade_with_real_changes_writes_one_audit_entry() {
        let (trades, _accounts, account_id, instrument_id, _dir) = setup();
        let trade = trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(100),
                "2026-01-05T00:00:00Z",
            ))
            .expect("create trade");

        let mut input = closed_trade_input(
            &account_id,
            &instrument_id,
            dec!(100),
            "2026-01-05T00:00:00Z",
        );
        input.volume = Some(dec!(2));
        trades
            .update(&trade.id, Some(trade.updated_at), input)
            .expect("update");

        let log = trades.list_audit_log(&trade.id).expect("list audit log");
        assert_eq!(log.len(), 1);
        assert!(log[0].changes.iter().any(|c| c.field == "Wolumen"));
    }

    #[test]
    fn updating_a_trade_with_no_real_changes_writes_no_audit_entry() {
        let (trades, _accounts, account_id, instrument_id, _dir) = setup();
        let trade = trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(100),
                "2026-01-05T00:00:00Z",
            ))
            .expect("create trade");

        let unchanged_input = closed_trade_input(
            &account_id,
            &instrument_id,
            dec!(100),
            "2026-01-05T00:00:00Z",
        );
        trades
            .update(&trade.id, Some(trade.updated_at), unchanged_input)
            .expect("update");

        let log = trades.list_audit_log(&trade.id).expect("list audit log");
        assert!(log.is_empty());
    }

    #[test]
    fn updating_with_a_stale_expected_updated_at_returns_a_conflict_error() {
        let (trades, _accounts, account_id, instrument_id, _dir) = setup();
        let trade = trades
            .create(closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(100),
                "2026-01-05T00:00:00Z",
            ))
            .expect("create trade");
        let stale_updated_at = trade.updated_at;

        // Ktoś inny (albo inne okno) edytuje transakcję pierwszy - to "wygrywa".
        trades
            .update(
                &trade.id,
                None,
                closed_trade_input(
                    &account_id,
                    &instrument_id,
                    dec!(200),
                    "2026-01-05T00:00:00Z",
                ),
            )
            .expect("first update wins");

        let result = trades.update(
            &trade.id,
            Some(stale_updated_at),
            closed_trade_input(
                &account_id,
                &instrument_id,
                dec!(300),
                "2026-01-05T00:00:00Z",
            ),
        );
        assert!(matches!(result, Err(AppError::Conflict(_))));
    }
}
