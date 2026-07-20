use tauri::State;

use crate::application::reports::{
    AccountComparisonFilter, AccountComparisonRow, AccountReport, FilteredReport, ReportFilter,
    ReportsService,
};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&ReportsService, AppError> {
    match &state.db {
        DbState::Ready { reports, .. } => Ok(reports),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn get_account_report(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<AccountReport, AppError> {
    require_db(&state)?.get_account_report(&account_id)
}

#[tauri::command]
pub fn get_filtered_report(
    state: State<'_, AppState>,
    filter: ReportFilter,
) -> Result<FilteredReport, AppError> {
    require_db(&state)?.get_filtered_report(filter)
}

#[tauri::command]
pub fn compare_accounts_report(
    state: State<'_, AppState>,
    account_ids: Vec<String>,
    filter: AccountComparisonFilter,
) -> Result<Vec<AccountComparisonRow>, AppError> {
    require_db(&state)?.compare_accounts(account_ids, filter)
}
