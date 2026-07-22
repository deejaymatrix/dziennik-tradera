use tauri::State;

use crate::application::broker_templates::BrokerTemplatesService;
use crate::domain::broker_template::{BrokerTemplate, NewTemplate};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&BrokerTemplatesService, AppError> {
    match &state.db {
        DbState::Ready {
            broker_templates, ..
        } => Ok(broker_templates),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn list_broker_templates(
    state: State<'_, AppState>,
    include_archived: bool,
) -> Result<Vec<BrokerTemplate>, AppError> {
    require_db(&state)?.list(include_archived)
}

#[tauri::command]
pub fn create_broker_template(
    state: State<'_, AppState>,
    input: NewTemplate,
) -> Result<BrokerTemplate, AppError> {
    require_db(&state)?.create(input)
}

#[tauri::command]
pub fn rename_broker_template(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<BrokerTemplate, AppError> {
    require_db(&state)?.rename(&id, &name)
}

#[tauri::command]
pub fn duplicate_broker_template(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<BrokerTemplate, AppError> {
    require_db(&state)?.duplicate(&id, &new_name)
}

/// Atomowe "Zastąp szablon konta" - odpina dotychczasowy szablon konta i przypina wskazany.
#[tauri::command]
pub fn assign_broker_template(
    state: State<'_, AppState>,
    template_id: String,
    account_id: String,
) -> Result<(), AppError> {
    require_db(&state)?.assign_to_account(&template_id, &account_id)
}

#[tauri::command]
pub fn unassign_broker_template(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<(), AppError> {
    require_db(&state)?.unassign(&template_id)
}

/// Do Kosza (przywracanie i trwałe usuwanie odbywa się przez komendy Kosza).
#[tauri::command]
pub fn archive_broker_template(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    require_db(&state)?.archive(&id)
}
