//! Komendy Tauri Asystenta AI (Blok F, Etap 3). Ciężkie operacje (analiza, pobieranie modelu) są
//! `async` i idą na `spawn_blocking`, żeby nie blokować wątku UI - z `AppState` wyciągamy
//! współdzielony `Arc<AiAnalysisService>` i przenosimy go do zadania blokującego.

use std::sync::Arc;

use tauri::State;

use crate::application::ai_analysis::{AiAnalysisService, StatusModeluAi};
use crate::application::ai_runtime::OpisModeluStatus;
use crate::application::reports::ReportFilter;
use crate::domain::ai_analysis::{AnalizaWynik, ZapisanaAnaliza};
use crate::error::AppError;
use crate::infrastructure::ai_model_download::PostepPobrania;
use crate::state::{AppState, DbState};

fn require_ai(state: &AppState) -> Result<Arc<AiAnalysisService>, AppError> {
    match &state.db {
        DbState::Ready { ai_analysis, .. } => Ok(Arc::clone(ai_analysis)),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

/// Analizuje transakcję modelem AI i zapisuje wynik. `async` + `spawn_blocking`, bo generowanie
/// jest CPU-bound i trwa dziesiątki sekund - nie może blokować interfejsu.
#[tauri::command]
pub async fn analyze_trade(
    state: State<'_, AppState>,
    trade_id: String,
) -> Result<ZapisanaAnaliza, AppError> {
    let service = require_ai(&state)?;
    tauri::async_runtime::spawn_blocking(move || service.analizuj_transakcje_blocking(&trade_id))
        .await
        .map_err(|e| AppError::io(format!("zadanie analizy AI nie powiodło się: {e}")))?
}

/// Analiza CAŁOŚCIOWA raportu/okresu (zagregowane dane wg tego samego filtra co strona Raporty).
/// `async` + `spawn_blocking` jak `analyze_trade`. Wynik NIE jest zapisywany - zwracany do
/// pokazania. `zakres_opis` to ludzki opis zakresu do promptu i UI.
#[tauri::command]
pub async fn analyze_report(
    state: State<'_, AppState>,
    filter: ReportFilter,
    zakres_opis: String,
) -> Result<AnalizaWynik, AppError> {
    let service = require_ai(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        service.analizuj_raport_blocking(filter, zakres_opis)
    })
    .await
    .map_err(|e| AppError::io(format!("zadanie analizy raportu nie powiodło się: {e}")))?
}

/// Przerywa trwającą analizę.
#[tauri::command]
pub fn cancel_ai_analysis(state: State<'_, AppState>) -> Result<(), AppError> {
    require_ai(&state)?.anuluj();
    Ok(())
}

/// Najnowsza zapisana analiza transakcji (albo `null`), z policzoną flagą nieaktualności.
#[tauri::command]
pub fn get_trade_analysis(
    state: State<'_, AppState>,
    trade_id: String,
) -> Result<Option<ZapisanaAnaliza>, AppError> {
    require_ai(&state)?.ostatnia_analiza(&trade_id)
}

/// Usuwa pojedynczą zapisaną analizę.
#[tauri::command]
pub fn delete_trade_analysis(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    require_ai(&state)?.usun_analize(&id)
}

/// Usuwa WSZYSTKIE zapisane analizy AI (Ustawienia → Asystent AI).
#[tauri::command]
pub fn delete_all_ai_analyses(state: State<'_, AppState>) -> Result<(), AppError> {
    require_ai(&state)?.usun_wszystkie_analizy()
}

/// Status modelu: gotowy/etykieta/rozmiar - frontend decyduje, czy pokazać przycisk analizy, czy
/// zaproponować pobranie.
#[tauri::command]
pub fn ai_model_status(state: State<'_, AppState>) -> Result<StatusModeluAi, AppError> {
    Ok(require_ai(&state)?.status_modelu())
}

/// Lista 3 kandydatów na model z ich stanem (pobrany/aktywny) - do wyboru modelu w Ustawieniach.
#[tauri::command]
pub fn ai_list_models(state: State<'_, AppState>) -> Result<Vec<OpisModeluStatus>, AppError> {
    Ok(require_ai(&state)?.lista_modeli())
}

/// Ustawia aktywny model AI (jeden z kandydatów) - zapamiętywane, zwalnia poprzedni z pamięci.
#[tauri::command]
pub fn ai_set_model(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    require_ai(&state)?.ustaw_model(&id)
}

/// Pobiera i weryfikuje model. `async` + `spawn_blocking` (gigabajty + SHA-256). Postęp odpytywać
/// osobno przez `ai_model_download_progress`.
#[tauri::command]
pub async fn download_ai_model(state: State<'_, AppState>) -> Result<(), AppError> {
    let service = require_ai(&state)?;
    tauri::async_runtime::spawn_blocking(move || service.pobierz_model_blocking())
        .await
        .map_err(|e| AppError::io(format!("zadanie pobierania modelu nie powiodło się: {e}")))?
}

/// Bieżący postęp pobierania modelu (odpytywany w pętli przez frontend, ten sam wzorzec co reszta
/// aplikacji).
#[tauri::command]
pub fn ai_model_download_progress(state: State<'_, AppState>) -> Result<PostepPobrania, AppError> {
    Ok(require_ai(&state)?.postep_pobierania())
}

/// Przerywa pobieranie modelu.
#[tauri::command]
pub fn cancel_ai_model_download(state: State<'_, AppState>) -> Result<(), AppError> {
    require_ai(&state)?.anuluj_pobieranie();
    Ok(())
}

/// Usuwa pobrany model z dysku (Ustawienia → Asystent AI).
#[tauri::command]
pub fn delete_ai_model(state: State<'_, AppState>) -> Result<(), AppError> {
    require_ai(&state)?.usun_model()
}
