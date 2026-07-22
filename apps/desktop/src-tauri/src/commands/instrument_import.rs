use tauri::State;

use crate::application::instrument_import::InstrumentImportService;
use crate::domain::broker_template::BrokerTemplate;
use crate::domain::instrument_import::ImportPreview;
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&InstrumentImportService, AppError> {
    match &state.db {
        DbState::Ready {
            instrument_import, ..
        } => Ok(instrument_import),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

/// Czyta plik jako UTF-8, usuwając ewentualny znak BOM (eksporty MT5 często go mają).
fn read_csv_file(source_path: &str) -> Result<String, AppError> {
    let text = std::fs::read_to_string(source_path)
        .map_err(|e| AppError::Validation(format!("Nie można odczytać pliku importu: {e}")))?;
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

/// Podgląd importu bez zapisu - kreator pokazuje listę instrumentów i ostrzeżenia przed
/// zatwierdzeniem (sekcja 1.5 specyfikacji szablonów brokerów).
#[tauri::command]
pub fn preview_broker_import(
    state: State<'_, AppState>,
    source_path: String,
) -> Result<ImportPreview, AppError> {
    let csv_text = read_csv_file(&source_path)?;
    require_db(&state)?.preview(&csv_text)
}

/// Atomowy import pliku brokera do WYBRANEGO szablonu - jeden import na szablon.
#[tauri::command]
pub fn import_instruments_into_template(
    state: State<'_, AppState>,
    template_id: String,
    source_path: String,
) -> Result<BrokerTemplate, AppError> {
    let csv_text = read_csv_file(&source_path)?;
    require_db(&state)?.import_into_template(&template_id, &csv_text)
}

/// Atomowy import pliku brokera jako nowy szablon instrumentów.
#[tauri::command]
pub fn import_broker_template(
    state: State<'_, AppState>,
    name: String,
    broker_name: String,
    account_type: Option<String>,
    source_path: String,
) -> Result<BrokerTemplate, AppError> {
    let csv_text = read_csv_file(&source_path)?;
    require_db(&state)?.import_as_new_template(name, broker_name, account_type, &csv_text)
}
