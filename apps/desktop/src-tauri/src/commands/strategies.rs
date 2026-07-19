use tauri::State;

use crate::application::strategies::StrategiesService;
use crate::domain::strategy::{Strategy, StrategyInput};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&StrategiesService, AppError> {
    match &state.db {
        DbState::Ready { strategies, .. } => Ok(strategies),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_strategy(
    state: State<'_, AppState>,
    input: StrategyInput,
) -> Result<Strategy, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn get_strategy(state: State<'_, AppState>, id: String) -> Result<Strategy, AppError> {
    require_db(&state)?.get(&id)
}

#[tauri::command]
pub fn list_strategies(
    state: State<'_, AppState>,
    include_archived: bool,
) -> Result<Vec<Strategy>, AppError> {
    require_db(&state)?.list(include_archived)
}

#[tauri::command]
pub fn update_strategy(
    state: State<'_, AppState>,
    id: String,
    input: StrategyInput,
) -> Result<Strategy, AppError> {
    require_db(&state)?.update(&id, input)
}

#[tauri::command]
pub fn duplicate_strategy(state: State<'_, AppState>, id: String) -> Result<Strategy, AppError> {
    require_db(&state)?.duplicate(&id)
}

#[tauri::command]
pub fn archive_strategy(state: State<'_, AppState>, id: String) -> Result<Strategy, AppError> {
    require_db(&state)?.archive(&id)
}

#[tauri::command]
pub fn restore_strategy(state: State<'_, AppState>, id: String) -> Result<Strategy, AppError> {
    require_db(&state)?.restore(&id)
}
