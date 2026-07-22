use tauri::State;

use crate::application::accounts::AccountsService;
use crate::application::instruments::InstrumentsService;
use crate::domain::position_sizing::{
    calculate, PositionSizingRequest, PositionSizingResult, PositionSizingSpec,
};
use crate::error::AppError;
use crate::state::{AppState, DbState};

fn require_db(state: &AppState) -> Result<(&AccountsService, &InstrumentsService), AppError> {
    match &state.db {
        DbState::Ready {
            accounts,
            instruments,
            ..
        } => Ok((accounts, instruments)),
        DbState::Failed { reason } => Err(AppError::Database(format!(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji: {reason}"
        ))),
    }
}

/// Kalkulator wielkości pozycji (sekcja 2 specyfikacji). Saldo i waluta pochodzą z konta, a
/// WSZYSTKIE parametry instrumentu z jego aktualnej rewizji - frontend nie przysyła ani wielkości
/// kontraktu, ani wartości ticka, żeby nie dało się policzyć wyniku na nieaktualnej kopii.
#[tauri::command]
pub fn calculate_position_size(
    state: State<'_, AppState>,
    account_id: String,
    instrument_id: String,
    request: PositionSizingRequest,
) -> Result<PositionSizingResult, AppError> {
    let (accounts, instruments) = require_db(&state)?;
    let account = accounts.get(&account_id)?;
    let instrument = instruments.get(&instrument_id)?;
    let version = &instrument.version;

    let spec = PositionSizingSpec {
        point: version.point,
        trade_tick_size: version.trade_tick_size,
        tick_value_profit: version.tick_value_profit,
        tick_value_loss: version.tick_value_loss,
        contract_size: version.contract_size,
        volume_min: version.volume_min,
        volume_max: version.volume_max,
        volume_step: version.volume_step,
        currency_profit: version.currency_profit.clone(),
    };

    calculate(&request, &spec, account.balance, &account.account.currency)
}
