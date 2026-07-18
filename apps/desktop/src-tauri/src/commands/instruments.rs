use tauri::State;

use crate::application::instruments::InstrumentsService;
use crate::domain::instrument::{Instrument, InstrumentSpecInput};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&InstrumentsService, AppError> {
    match &state.db {
        DbState::Ready { instruments, .. } => Ok(instruments),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_instrument(
    state: State<'_, AppState>,
    input: InstrumentSpecInput,
) -> Result<Instrument, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn list_instruments(
    state: State<'_, AppState>,
    include_inactive: bool,
) -> Result<Vec<Instrument>, AppError> {
    require_db(&state)?.list(include_inactive)
}

#[tauri::command]
pub fn update_instrument(
    state: State<'_, AppState>,
    id: String,
    input: InstrumentSpecInput,
) -> Result<Instrument, AppError> {
    require_db(&state)?.update(&id, input)
}

#[tauri::command]
pub fn deactivate_instrument(
    state: State<'_, AppState>,
    id: String,
) -> Result<Instrument, AppError> {
    require_db(&state)?.deactivate(&id)
}

#[tauri::command]
pub fn activate_instrument(state: State<'_, AppState>, id: String) -> Result<Instrument, AppError> {
    require_db(&state)?.activate(&id)
}
