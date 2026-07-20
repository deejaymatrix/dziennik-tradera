use tauri::State;

use crate::application::trash::{EmptyTrashResult, TrashEntityType, TrashItem, TrashService};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&TrashService, AppError> {
    match &state.db {
        DbState::Ready { trash, .. } => Ok(trash),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn list_trash_items(state: State<'_, AppState>) -> Result<Vec<TrashItem>, AppError> {
    require_db(&state)?.list()
}

#[tauri::command]
pub fn restore_trash_item(
    state: State<'_, AppState>,
    entity_type: TrashEntityType,
    id: String,
) -> Result<(), AppError> {
    require_db(&state)?.restore(entity_type, &id)
}

#[tauri::command]
pub fn purge_trash_item(
    state: State<'_, AppState>,
    entity_type: TrashEntityType,
    id: String,
) -> Result<(), AppError> {
    require_db(&state)?.delete_permanently(entity_type, &id)
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> Result<EmptyTrashResult, AppError> {
    require_db(&state)?.empty()
}
