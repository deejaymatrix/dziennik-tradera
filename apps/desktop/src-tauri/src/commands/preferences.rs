use tauri::State;

use crate::application::preferences::PreferencesService;
use crate::domain::preferences::{Preferences, PreferencesSection};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&PreferencesService, AppError> {
    match &state.db {
        DbState::Ready { preferences, .. } => Ok(preferences),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> Result<Preferences, AppError> {
    require_db(&state)?.get()
}

/// Zapisuje DOKŁADNIE jedną sekcję ustawień. `preferences` to komplet z formularza, ale zapisana
/// zostanie wyłącznie sekcja wskazana w `section` - patrz `PreferencesService::update_section`.
#[tauri::command]
pub fn update_preferences_section(
    state: State<'_, AppState>,
    section: PreferencesSection,
    preferences: Preferences,
) -> Result<Preferences, AppError> {
    require_db(&state)?.update_section(section, preferences)
}

#[tauri::command]
pub fn reset_preferences_section(
    state: State<'_, AppState>,
    section: PreferencesSection,
) -> Result<Preferences, AppError> {
    require_db(&state)?.reset_section(section)
}
