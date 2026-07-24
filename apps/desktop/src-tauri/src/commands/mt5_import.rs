use tauri::State;

use crate::application::mt5_import::{Mt5ImportPreview, Mt5ImportResult, Mt5ImportService};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn read_xlsx_file(source_path: &str) -> Result<Vec<u8>, AppError> {
    std::fs::read(source_path)
        .map_err(|e| AppError::Validation(format!("Nie można odczytać pliku importu: {e}")))
}

/// Podgląd importu historii MT5 bez zapisu - kreator pokazuje, ile pozycji rozpoznano, ile
/// symboli nie ma odpowiednika w katalogu instrumentów konta, i ile pozycji było już
/// zaimportowanych wcześniej (ten sam wzorzec co `preview_broker_import`).
#[tauri::command]
pub fn preview_mt5_import(
    state: State<'_, AppState>,
    account_id: String,
    source_path: String,
) -> Result<Mt5ImportPreview, AppError> {
    let bytes = read_xlsx_file(&source_path)?;
    match &state.db {
        DbState::Ready {
            accounts,
            instruments,
            trades,
            ..
        } => Mt5ImportService::new(accounts, instruments, trades).preview(&account_id, &bytes),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

/// Atomowy import: tworzy transakcję dla każdej rozpoznanej, jeszcze niezaimportowanej pozycji.
/// Pomija (bez błędu całego importu) symbole spoza katalogu instrumentów konta i pozycje już
/// wcześniej zaimportowane - wynik mówi dokładnie ile i dlaczego.
#[tauri::command]
pub fn import_mt5_trades(
    state: State<'_, AppState>,
    account_id: String,
    source_path: String,
) -> Result<Mt5ImportResult, AppError> {
    let bytes = read_xlsx_file(&source_path)?;
    match &state.db {
        DbState::Ready {
            accounts,
            instruments,
            trades,
            ..
        } => Mt5ImportService::new(accounts, instruments, trades).commit(&account_id, &bytes),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}
