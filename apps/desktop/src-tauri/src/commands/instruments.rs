use tauri::State;

use crate::application::instruments::InstrumentsService;
use crate::domain::instrument::{
    InstrumentListFilter, InstrumentVersionInput, InstrumentWithDetails, NewInstrumentInput,
};
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
    input: NewInstrumentInput,
) -> Result<InstrumentWithDetails, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn get_instrument(
    state: State<'_, AppState>,
    id: String,
) -> Result<InstrumentWithDetails, AppError> {
    require_db(&state)?.get(&id)
}

#[tauri::command]
pub fn list_instruments(
    state: State<'_, AppState>,
    filter: InstrumentListFilter,
) -> Result<Vec<InstrumentWithDetails>, AppError> {
    require_db(&state)?.list(filter)
}

#[tauri::command]
pub fn update_instrument_version(
    state: State<'_, AppState>,
    id: String,
    input: InstrumentVersionInput,
) -> Result<InstrumentWithDetails, AppError> {
    require_db(&state)?.update_version(&id, input)
}

#[tauri::command]
pub fn reset_instrument_to_factory(
    state: State<'_, AppState>,
    id: String,
) -> Result<InstrumentWithDetails, AppError> {
    require_db(&state)?.reset_to_factory(&id)
}

#[tauri::command]
pub fn set_instrument_visibility(
    state: State<'_, AppState>,
    id: String,
    is_visible: bool,
) -> Result<(), AppError> {
    require_db(&state)?.set_visibility(&id, is_visible)
}

#[tauri::command]
pub fn set_instruments_visibility_bulk(
    state: State<'_, AppState>,
    ids: Vec<String>,
    is_visible: bool,
) -> Result<(), AppError> {
    require_db(&state)?.set_visibility_bulk(ids, is_visible)
}

#[tauri::command]
pub fn reorder_instruments(
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    require_db(&state)?.reorder(ordered_ids)
}

#[tauri::command]
pub fn reset_instrument_visibility_to_default(state: State<'_, AppState>) -> Result<(), AppError> {
    require_db(&state)?.reset_to_default_visibility()
}

#[tauri::command]
pub fn delete_instrument(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    require_db(&state)?.delete(&id)
}
