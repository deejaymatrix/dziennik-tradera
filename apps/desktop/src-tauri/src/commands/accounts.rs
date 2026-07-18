use tauri::State;

use crate::domain::account::{Account, NewAccount, UpdateAccount};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&crate::application::accounts::AccountsService, AppError> {
    match &state.db {
        DbState::Ready { accounts, .. } => Ok(accounts),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_account(state: State<'_, AppState>, input: NewAccount) -> Result<Account, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>, include_archived: bool) -> Result<Vec<Account>, AppError> {
    require_db(&state)?.list(include_archived)
}

#[tauri::command]
pub fn update_account(state: State<'_, AppState>, id: String, input: UpdateAccount) -> Result<Account, AppError> {
    require_db(&state)?.update(&id, input)
}

#[tauri::command]
pub fn archive_account(state: State<'_, AppState>, id: String) -> Result<Account, AppError> {
    require_db(&state)?.archive(&id)
}

#[tauri::command]
pub fn restore_account(state: State<'_, AppState>, id: String) -> Result<Account, AppError> {
    require_db(&state)?.restore(&id)
}
