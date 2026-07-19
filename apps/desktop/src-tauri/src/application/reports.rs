use std::sync::Arc;

use serde::Serialize;

use crate::domain::trade::TradeRepository;
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
}
