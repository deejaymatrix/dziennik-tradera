use tauri::State;

use crate::application::export::ExportService;
use crate::domain::export_filter::ExportFilter;
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&ExportService, AppError> {
    match &state.db {
        DbState::Ready { export, .. } => Ok(export),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn export_trades_csv(
    state: State<'_, AppState>,
    account_id: String,
    destination_path: String,
    filter: Option<ExportFilter>,
) -> Result<(), AppError> {
    require_db(&state)?.export_csv(&account_id, &destination_path, filter.as_ref())
}

#[tauri::command]
pub fn export_trades_xlsx(
    state: State<'_, AppState>,
    account_id: String,
    destination_path: String,
    filter: Option<ExportFilter>,
) -> Result<(), AppError> {
    require_db(&state)?.export_xlsx(&account_id, &destination_path, filter.as_ref())
}

#[tauri::command]
pub fn export_trades_pdf(
    state: State<'_, AppState>,
    account_id: String,
    destination_path: String,
    filter: Option<ExportFilter>,
) -> Result<(), AppError> {
    require_db(&state)?.export_pdf(&account_id, &destination_path, filter.as_ref())
}
