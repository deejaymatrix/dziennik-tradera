use chrono::{DateTime, Utc};
use tauri::State;

use crate::application::trades::{TradeBalanceContext, TradesService};
use crate::domain::trade::{Trade, TradeInput};
use crate::domain::trade_audit::TradeAuditEntry;
use crate::domain::trade_calculations::TradeCalculation;
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&TradesService, AppError> {
    match &state.db {
        DbState::Ready { trades, .. } => Ok(trades),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn preview_trade(
    state: State<'_, AppState>,
    input: TradeInput,
) -> Result<TradeCalculation, AppError> {
    require_db(&state)?.preview(&input)
}

#[tauri::command]
pub fn create_trade(state: State<'_, AppState>, input: TradeInput) -> Result<Trade, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn get_trade(state: State<'_, AppState>, id: String) -> Result<Trade, AppError> {
    require_db(&state)?.get(&id)
}

#[tauri::command]
pub fn list_trades(
    state: State<'_, AppState>,
    account_id: String,
    include_deleted: bool,
) -> Result<Vec<Trade>, AppError> {
    require_db(&state)?.list(&account_id, include_deleted)
}

#[tauri::command]
pub fn update_trade(
    state: State<'_, AppState>,
    id: String,
    expected_updated_at: Option<DateTime<Utc>>,
    input: TradeInput,
) -> Result<Trade, AppError> {
    require_db(&state)?.update(&id, expected_updated_at, input)
}

#[tauri::command]
pub fn soft_delete_trade(state: State<'_, AppState>, id: String) -> Result<Trade, AppError> {
    require_db(&state)?.soft_delete(&id)
}

#[tauri::command]
pub fn restore_trade(state: State<'_, AppState>, id: String) -> Result<Trade, AppError> {
    require_db(&state)?.restore(&id)
}

#[tauri::command]
pub fn get_trade_balance_context(
    state: State<'_, AppState>,
    id: String,
) -> Result<TradeBalanceContext, AppError> {
    require_db(&state)?.balance_context(&id)
}

#[tauri::command]
pub fn list_trade_audit_log(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<TradeAuditEntry>, AppError> {
    require_db(&state)?.list_audit_log(&id)
}
