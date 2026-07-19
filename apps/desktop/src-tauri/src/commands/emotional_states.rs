use tauri::State;

use crate::application::emotional_states::EmotionalStatesService;
use crate::domain::emotional_state::{EmotionalState, NewEmotionalState};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&EmotionalStatesService, AppError> {
    match &state.db {
        DbState::Ready {
            emotional_states, ..
        } => Ok(emotional_states),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_emotional_state(
    state: State<'_, AppState>,
    input: NewEmotionalState,
) -> Result<EmotionalState, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn list_emotional_states(
    state: State<'_, AppState>,
    include_hidden: bool,
) -> Result<Vec<EmotionalState>, AppError> {
    require_db(&state)?.list(include_hidden)
}

#[tauri::command]
pub fn set_emotional_state_hidden(
    state: State<'_, AppState>,
    id: String,
    hidden: bool,
) -> Result<EmotionalState, AppError> {
    require_db(&state)?.set_hidden(&id, hidden)
}

#[tauri::command]
pub fn delete_emotional_state(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    require_db(&state)?.delete(&id)
}
