use tauri::State;

use crate::application::trading_rules::TradingRulesService;
use crate::domain::trading_rules::{TradingRulesState, TradingRulesWrite};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<&TradingRulesService, AppError> {
    match &state.db {
        DbState::Ready { trading_rules, .. } => Ok(trading_rules),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

#[tauri::command]
pub fn get_trading_rules(state: State<'_, AppState>) -> Result<TradingRulesState, AppError> {
    require_db(&state)?.get()
}

/// Zbiorczy zapis całej zakładki (wzorzec "Zapisz zmiany") - kolejność list wyznacza kolejność
/// kart/pytań, `archived: true` wysyła pytanie do uniwersalnego Kosza.
#[tauri::command]
pub fn save_trading_rules(
    state: State<'_, AppState>,
    write: TradingRulesWrite,
) -> Result<TradingRulesState, AppError> {
    require_db(&state)?.save(write)
}

/// Przywraca szablon pytań: odtwarza treść/obecność pytań wbudowanych, NIGDY nie dotyka
/// odpowiedzi ani pytań własnych użytkownika.
#[tauri::command]
pub fn restore_trading_rule_templates(
    state: State<'_, AppState>,
) -> Result<TradingRulesState, AppError> {
    require_db(&state)?.restore_templates()
}
