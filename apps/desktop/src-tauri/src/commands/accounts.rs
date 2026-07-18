use tauri::State;

use crate::application::accounts::{AccountWithBalance, AccountsService};
use crate::domain::account::{NewAccount, UpdateAccount};
use crate::domain::cash_operation::{CashOperation, NewCashOperation};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&AccountsService, AppError> {
    match &state.db {
        DbState::Ready { accounts, .. } => Ok(accounts),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_account(
    state: State<'_, AppState>,
    input: NewAccount,
) -> Result<AccountWithBalance, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn get_account(state: State<'_, AppState>, id: String) -> Result<AccountWithBalance, AppError> {
    require_db(&state)?.get(&id)
}

#[tauri::command]
pub fn list_accounts(
    state: State<'_, AppState>,
    include_archived: bool,
) -> Result<Vec<AccountWithBalance>, AppError> {
    require_db(&state)?.list(include_archived)
}

#[tauri::command]
pub fn update_account(
    state: State<'_, AppState>,
    id: String,
    input: UpdateAccount,
) -> Result<AccountWithBalance, AppError> {
    require_db(&state)?.update(&id, input)
}

#[tauri::command]
pub fn archive_account(
    state: State<'_, AppState>,
    id: String,
) -> Result<AccountWithBalance, AppError> {
    require_db(&state)?.archive(&id)
}

#[tauri::command]
pub fn restore_account(
    state: State<'_, AppState>,
    id: String,
) -> Result<AccountWithBalance, AppError> {
    require_db(&state)?.restore(&id)
}

#[tauri::command]
pub fn create_cash_operation(
    state: State<'_, AppState>,
    input: NewCashOperation,
) -> Result<CashOperation, AppError> {
    require_db(&state)?.add_cash_operation(input)
}

#[tauri::command]
pub fn list_cash_operations(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<CashOperation>, AppError> {
    require_db(&state)?.list_cash_operations(&account_id)
}
