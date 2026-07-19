use std::sync::Arc;

use crate::application::accounts::AccountsService;
use crate::application::instruments::InstrumentsService;
use crate::application::strategies::StrategiesService;
use crate::domain::instrument::InstrumentSnapshot;
use crate::domain::strategy::StrategySnapshot;
use crate::domain::trade::{Trade, TradeInput, TradeRepository, TradeWrite};
use crate::domain::trade_calculations::{self, TradeCalculationInput};
use crate::error::AppError;

/// Warstwa aplikacyjna transakcji: jedyne miejsce, gdzie surowy `TradeInput` z formularza
/// spotyka się z migawką instrumentu/strategii, saldem konta i silnikiem przeliczeń
/// (`domain::trade_calculations`), zanim trafi do repozytorium. Repozytorium nigdy nie liczy
/// pieniędzy samo - dostaje już gotowy `TradeWrite`.
pub struct TradesService {
    trades: Arc<dyn TradeRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
    instruments: Arc<InstrumentsService>,
    strategies: Arc<StrategiesService>,
}

impl TradesService {
    pub fn new(
        trades: Arc<dyn TradeRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
        instruments: Arc<InstrumentsService>,
        strategies: Arc<StrategiesService>,
    ) -> Self {
        Self {
            trades,
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

    pub fn update(&self, id: &str, input: TradeInput) -> Result<Trade, AppError> {
        let write = self.build_write(input)?;
        self.trades.update(id, &write)
    }

    pub fn soft_delete(&self, id: &str) -> Result<Trade, AppError> {
        self.trades.soft_delete(id)
    }

    pub fn restore(&self, id: &str) -> Result<Trade, AppError> {
        self.trades.restore(id)
    }
}
