use base64::Engine;
use tauri::State;

use crate::application::attachments::AttachmentsService;
use crate::domain::attachment::{Attachment, NewLinkAttachment};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&AttachmentsService, AppError> {
    match &state.db {
        DbState::Ready { attachments, .. } => Ok(attachments),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn list_attachments(
    state: State<'_, AppState>,
    trade_id: String,
) -> Result<Vec<Attachment>, AppError> {
    require_db(&state)?.list_for_trade(&trade_id)
}

/// Dodaje zdjęcie z pliku na dysku - wybór z systemowego okna dialogowego albo upuszczenie
/// pliku (drag&drop), bo obie ścieżki dają frontendowi realną ścieżkę na dysku.
#[tauri::command]
pub fn add_screenshot_attachment_from_path(
    state: State<'_, AppState>,
    trade_id: String,
    source_path: String,
    label: Option<String>,
) -> Result<Attachment, AppError> {
    require_db(&state)?.add_screenshot_from_path(
        &trade_id,
        std::path::Path::new(&source_path),
        label,
    )
}

/// Dodaje zdjęcie z bajtów zakodowanych jako base64 - wklejenie ze schowka (frontend czyta
/// obraz przez Web Clipboard API, nie ma tam pliku źródłowego na dysku).
#[tauri::command]
pub fn add_screenshot_attachment_from_bytes(
    state: State<'_, AppState>,
    trade_id: String,
    bytes_base64: String,
    label: Option<String>,
) -> Result<Attachment, AppError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_base64)
        .map_err(|_| {
            AppError::Validation("Nieprawidłowe dane obrazu (błąd base64).".to_string())
        })?;
    require_db(&state)?.add_screenshot_from_bytes(&trade_id, bytes, label)
}

#[tauri::command]
pub fn add_link_attachment(
    state: State<'_, AppState>,
    trade_id: String,
    url: String,
    label: Option<String>,
) -> Result<Attachment, AppError> {
    require_db(&state)?.add_link(NewLinkAttachment {
        trade_id,
        url,
        label,
    })
}

#[tauri::command]
pub fn update_attachment_label(
    state: State<'_, AppState>,
    id: String,
    label: Option<String>,
) -> Result<Attachment, AppError> {
    require_db(&state)?.update_label(&id, label)
}

#[tauri::command]
pub fn reorder_attachments(
    state: State<'_, AppState>,
    trade_id: String,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    require_db(&state)?.reorder(&trade_id, ordered_ids)
}

#[tauri::command]
pub fn delete_attachment(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    require_db(&state)?.delete(&id)
}

/// Zwraca zdjęcie jako `data:` URI - jedyna komenda, która ujawnia bajty zdjęcia frontendowi, a
/// robi to bez przekazywania mu żadnej ścieżki na dysku (patrz `AttachmentsService`).
#[tauri::command]
pub fn read_attachment_image(state: State<'_, AppState>, id: String) -> Result<String, AppError> {
    require_db(&state)?.read_screenshot_data_uri(&id)
}
