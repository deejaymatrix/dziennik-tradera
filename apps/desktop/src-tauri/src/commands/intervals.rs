use tauri::State;

use crate::application::intervals::IntervalsService;
use crate::domain::interval::{Interval, NewInterval};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&IntervalsService, AppError> {
    match &state.db {
        DbState::Ready { intervals, .. } => Ok(intervals),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_interval(
    state: State<'_, AppState>,
    input: NewInterval,
) -> Result<Interval, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn get_interval(state: State<'_, AppState>, id: String) -> Result<Interval, AppError> {
    require_db(&state)?.get(&id)
}

#[tauri::command]
pub fn list_intervals(
    state: State<'_, AppState>,
    include_hidden: bool,
    include_archived: bool,
) -> Result<Vec<Interval>, AppError> {
    require_db(&state)?.list(include_hidden, include_archived)
}

#[tauri::command]
pub fn update_interval_label(
    state: State<'_, AppState>,
    id: String,
    label: String,
) -> Result<Interval, AppError> {
    require_db(&state)?.update_label(&id, label)
}

#[tauri::command]
pub fn set_interval_hidden(
    state: State<'_, AppState>,
    id: String,
    hidden: bool,
) -> Result<Interval, AppError> {
    require_db(&state)?.set_hidden(&id, hidden)
}

#[tauri::command]
pub fn archive_interval(state: State<'_, AppState>, id: String) -> Result<Interval, AppError> {
    require_db(&state)?.archive(&id)
}

#[tauri::command]
pub fn restore_interval(state: State<'_, AppState>, id: String) -> Result<Interval, AppError> {
    require_db(&state)?.restore(&id)
}

#[tauri::command]
pub fn reorder_intervals(
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    require_db(&state)?.reorder(ordered_ids)
}
