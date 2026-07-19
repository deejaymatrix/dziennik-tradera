use tauri::State;

use crate::application::backup::BackupService;
use crate::domain::backup::BackupManifest;
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&BackupService, AppError> {
    match &state.db {
        DbState::Ready { backup, .. } => Ok(backup),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn create_backup(
    state: State<'_, AppState>,
    destination_path: String,
) -> Result<BackupManifest, AppError> {
    require_db(&state)?.create_backup(&destination_path)
}

/// Weryfikuje archiwum i przygotowuje przywrócenie - zastosowane zostanie dopiero przy
/// następnym starcie aplikacji (patrz `infrastructure::backup_archive::apply_pending_restore_if_present`).
#[tauri::command]
pub fn prepare_backup_restore(
    state: State<'_, AppState>,
    archive_path: String,
) -> Result<BackupManifest, AppError> {
    require_db(&state)?.prepare_restore(&archive_path)
}
