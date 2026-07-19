use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::trade_calculations::InstrumentCalcSpec;

/// Kategorie instrumentów z fabrycznego katalogu (sekcja "Widoczność i wybór instrumentów").
pub const INSTRUMENT_CATEGORIES: [&str; 10] = [
    "Forex",
    "Metale",
    "Indeksy",
    "Indeksy mini",
    "Kryptowaluty",
    "Towary",
    "Soft commodities",
    "Akcje",
    "NDF",
    "Instrumenty syntetyczne",
];

/// Stabilna tożsamość instrumentu - symbol wyświetlany, symbol techniczny, opis, kategoria.
/// Wersjonowane parametry obliczeniowe żyją osobno w `InstrumentVersion`, żeby edycja
/// parametrów nigdy nie nadpisywała historii, tylko tworzyła nową wersję.
#[derive(Debug, Clone, Serialize)]
pub struct Instrument {
    pub id: String,
    pub display_symbol: String,
    pub source_symbol: String,
    pub description: String,
    pub category: String,
    /// Indeks rekordu z fabrycznego katalogu 350 instrumentów - `None` dla instrumentów
    /// dodanych ręcznie przez użytkownika.
    pub factory_index: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Kompletny, wersjonowany zestaw parametrów obliczeniowych instrumentu - odpowiada 1:1 polom
/// z wbudowanego katalogu 350 instrumentów. Każda edycja tworzy NOWĄ wersję (poprzednia zostaje
/// `is_active = false`), więc historyczne transakcje odwołujące się do starszej wersji przez
/// migawkę (`InstrumentSnapshot`) nigdy nie zmieniają wyniku retroaktywnie.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentVersion {
    pub id: String,
    pub instrument_id: String,
    pub version_number: i64,
    pub is_active: bool,
    pub currency_base: String,
    pub currency_profit: String,
    pub currency_margin: String,
    pub digits: i64,
    pub point: Decimal,
    pub trade_tick_size: Decimal,
    pub trade_tick_value: Decimal,
    pub tick_value_profit: Decimal,
    pub tick_value_loss: Decimal,
    pub contract_size: Decimal,
    pub volume_min: Decimal,
    pub volume_max: Decimal,
    pub volume_step: Decimal,
    pub volume_limit: Decimal,
    pub calc_mode: String,
    pub trade_mode: String,
    pub execution_mode: String,
    pub order_mode_flags: i64,
    pub filling_mode_flags: i64,
    pub expiration_mode_flags: i64,
    pub spread_floating: bool,
    pub stops_level_points: i64,
    pub freeze_level_points: i64,
    pub margin_initial: Decimal,
    pub margin_maintenance: Decimal,
    pub margin_hedged: Decimal,
    pub margin_hedged_use_leg: bool,
    pub liquidity_rate: Decimal,
    pub margin_rate_buy_initial: Decimal,
    pub margin_rate_buy_maintenance: Decimal,
    pub margin_rate_sell_initial: Decimal,
    pub margin_rate_sell_maintenance: Decimal,
    pub swap_mode: String,
    pub swap_long: Decimal,
    pub swap_short: Decimal,
    pub swap_sunday: Decimal,
    pub swap_monday: Decimal,
    pub swap_tuesday: Decimal,
    pub swap_wednesday: Decimal,
    pub swap_thursday: Decimal,
    pub swap_friday: Decimal,
    pub swap_saturday: Decimal,
    pub triple_swap_day: String,
    pub quote_sessions: String,
    pub trade_sessions: String,
    pub start_time: Option<String>,
    pub expiration_time: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Widok złożony zwracany do frontendu: tożsamość + aktualnie aktywna wersja + preferencje
/// widoczności. To, co widzi ekran "Zarządzaj instrumentami" i pola wyboru instrumentu.
#[derive(Debug, Clone, Serialize)]
pub struct InstrumentWithDetails {
    #[serde(flatten)]
    pub instrument: Instrument,
    pub version: InstrumentVersion,
    pub is_visible: bool,
    pub sort_order: i64,
    pub is_favorite: bool,
}

/// Zamrożony podzbiór parametrów zapisywany w transakcji w momencie jej utworzenia - żeby
/// późniejsza edycja instrumentu (nowa wersja, reset fabryczny, zmiana widoczności) nigdy nie
/// zmieniała retroaktywnie już policzonych wyników historycznych transakcji.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentSnapshot {
    pub display_symbol: String,
    pub source_symbol: String,
    pub description: String,
    pub category: String,
    pub instrument_version_id: String,
    pub currency_base: String,
    pub currency_profit: String,
    pub currency_margin: String,
    pub digits: i64,
    pub point: Decimal,
    pub trade_tick_size: Decimal,
    pub trade_tick_value: Decimal,
    pub tick_value_profit: Decimal,
    pub tick_value_loss: Decimal,
    pub contract_size: Decimal,
    pub volume_min: Decimal,
    pub volume_max: Decimal,
    pub volume_step: Decimal,
    pub volume_limit: Decimal,
    pub calc_mode: String,
}

impl InstrumentSnapshot {
    pub fn as_calc_spec(&self) -> InstrumentCalcSpec {
        InstrumentCalcSpec {
            point: self.point,
            trade_tick_size: self.trade_tick_size,
            tick_value_profit: self.tick_value_profit,
            tick_value_loss: self.tick_value_loss,
            currency_profit: self.currency_profit.clone(),
        }
    }
}

impl From<&InstrumentWithDetails> for InstrumentSnapshot {
    fn from(details: &InstrumentWithDetails) -> Self {
        let v = &details.version;
        Self {
            display_symbol: details.instrument.display_symbol.clone(),
            source_symbol: details.instrument.source_symbol.clone(),
            description: details.instrument.description.clone(),
            category: details.instrument.category.clone(),
            instrument_version_id: v.id.clone(),
            currency_base: v.currency_base.clone(),
            currency_profit: v.currency_profit.clone(),
            currency_margin: v.currency_margin.clone(),
            digits: v.digits,
            point: v.point,
            trade_tick_size: v.trade_tick_size,
            trade_tick_value: v.trade_tick_value,
            tick_value_profit: v.tick_value_profit,
            tick_value_loss: v.tick_value_loss,
            contract_size: v.contract_size,
            volume_min: v.volume_min,
            volume_max: v.volume_max,
            volume_step: v.volume_step,
            volume_limit: v.volume_limit,
            calc_mode: v.calc_mode.clone(),
        }
    }
}

/// Dane potrzebne, żeby dodać ręcznie własny instrument użytkownika (poza fabrycznym
/// katalogiem 350) - `factory_index` zawsze `None`, wersja startowa ma `version_number = 1`.
#[derive(Debug, Clone, Deserialize)]
pub struct NewInstrumentInput {
    pub display_symbol: String,
    pub source_symbol: String,
    pub description: String,
    pub category: String,
    pub parameters: InstrumentVersionInput,
}

/// Edytowalny podzbiór parametrów wersji - to, co użytkownik może zmienić w trybie edycji.
/// Zapis tworzy nową wersję, nigdy nie nadpisuje poprzedniej (sekcja "Edycja parametrów
/// instrumentu").
#[derive(Debug, Clone, Deserialize)]
pub struct InstrumentVersionInput {
    pub currency_base: String,
    pub currency_profit: String,
    pub currency_margin: String,
    pub digits: i64,
    pub point: Decimal,
    pub trade_tick_size: Decimal,
    pub trade_tick_value: Decimal,
    pub tick_value_profit: Decimal,
    pub tick_value_loss: Decimal,
    pub contract_size: Decimal,
    pub volume_min: Decimal,
    pub volume_max: Decimal,
    pub volume_step: Decimal,
    pub volume_limit: Decimal,
    pub calc_mode: String,
    pub trade_mode: String,
    pub execution_mode: String,
    pub order_mode_flags: i64,
    pub filling_mode_flags: i64,
    pub expiration_mode_flags: i64,
    pub spread_floating: bool,
    pub stops_level_points: i64,
    pub freeze_level_points: i64,
    pub margin_initial: Decimal,
    pub margin_maintenance: Decimal,
    pub margin_hedged: Decimal,
    pub margin_hedged_use_leg: bool,
    pub liquidity_rate: Decimal,
    pub margin_rate_buy_initial: Decimal,
    pub margin_rate_buy_maintenance: Decimal,
    pub margin_rate_sell_initial: Decimal,
    pub margin_rate_sell_maintenance: Decimal,
    pub swap_mode: String,
    pub swap_long: Decimal,
    pub swap_short: Decimal,
    pub swap_sunday: Decimal,
    pub swap_monday: Decimal,
    pub swap_tuesday: Decimal,
    pub swap_wednesday: Decimal,
    pub swap_thursday: Decimal,
    pub swap_friday: Decimal,
    pub swap_saturday: Decimal,
    pub triple_swap_day: String,
    pub quote_sessions: String,
    pub trade_sessions: String,
    pub start_time: Option<String>,
    pub expiration_time: Option<String>,
}

fn validate_currency_code(label: &str, code: &str) -> Result<(), AppError> {
    let is_valid = code.len() == 3 && code.chars().all(|c| c.is_ascii_uppercase());
    if !is_valid {
        return Err(AppError::Validation(format!(
            "{label} musi być trzyliterowym kodem wielkimi literami (np. USD)."
        )));
    }
    Ok(())
}

fn validate_positive(label: &str, value: Decimal) -> Result<(), AppError> {
    if value.is_sign_negative() || value.is_zero() {
        return Err(AppError::Validation(format!(
            "{label} musi być liczbą dodatnią."
        )));
    }
    Ok(())
}

/// Luźna walidacja typów enum/flag z katalogu MT5 (CalcMode, TradeMode, ExecutionMode,
/// SwapMode) - sprawdza rozpoznawalny prefiks zamiast zamkniętej listy wartości, żeby nie
/// blokować przyszłych aktualizacji fabrycznego katalogu o nowe warianty.
fn validate_enum_prefix(label: &str, value: &str, expected_prefix: &str) -> Result<(), AppError> {
    if !value.starts_with(expected_prefix) {
        return Err(AppError::Validation(format!(
            "{label} musi zaczynać się od \"{expected_prefix}\"."
        )));
    }
    Ok(())
}

impl InstrumentVersionInput {
    pub fn validate(&self) -> Result<(), AppError> {
        if !(0..=10).contains(&self.digits) {
            return Err(AppError::Validation(
                "Liczba miejsc dziesiętnych musi być z zakresu 0-10.".to_string(),
            ));
        }
        validate_positive("Point", self.point)?;
        validate_positive("Wielkość ticka (TradeTickSize)", self.trade_tick_size)?;
        validate_positive("Wartość ticka dla zysku", self.tick_value_profit)?;
        validate_positive("Wartość ticka dla straty", self.tick_value_loss)?;
        validate_positive("Wielkość kontraktu", self.contract_size)?;
        validate_positive("Minimalny wolumen", self.volume_min)?;
        validate_positive("Maksymalny wolumen", self.volume_max)?;
        validate_positive("Krok wolumenu", self.volume_step)?;
        validate_currency_code("Waluta bazowa", &self.currency_base)?;
        validate_currency_code("Waluta wyniku", &self.currency_profit)?;
        validate_currency_code("Waluta depozytu", &self.currency_margin)?;
        validate_enum_prefix("Tryb kalkulacji", &self.calc_mode, "SYMBOL_CALC_MODE_")?;
        validate_enum_prefix("Tryb handlu", &self.trade_mode, "SYMBOL_TRADE_MODE_")?;
        validate_enum_prefix(
            "Tryb egzekucji",
            &self.execution_mode,
            "SYMBOL_TRADE_EXECUTION_",
        )?;
        validate_enum_prefix("Tryb swapu", &self.swap_mode, "SYMBOL_SWAP_MODE_")?;

        if self.volume_min > self.volume_max {
            return Err(AppError::Validation(
                "Minimalny wolumen nie może być większy niż maksymalny.".to_string(),
            ));
        }
        if self.volume_step.is_sign_positive() && !self.volume_step.is_zero() {
            let steps = (self.volume_max - self.volume_min) / self.volume_step;
            if steps.fract() != Decimal::ZERO {
                return Err(AppError::Validation(
                    "Zakres wolumenu musi być podzielny przez krok wolumenu.".to_string(),
                ));
            }
        }

        Ok(())
    }
}

impl NewInstrumentInput {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.display_symbol.trim().is_empty() {
            return Err(AppError::Validation(
                "Symbol wyświetlany nie może być pusty.".to_string(),
            ));
        }
        if self.source_symbol.trim().is_empty() {
            return Err(AppError::Validation(
                "Symbol techniczny nie może być pusty.".to_string(),
            ));
        }
        if self.description.trim().is_empty() {
            return Err(AppError::Validation(
                "Opis instrumentu nie może być pusty.".to_string(),
            ));
        }
        if !INSTRUMENT_CATEGORIES.contains(&self.category.as_str()) {
            return Err(AppError::Validation(format!(
                "Kategoria musi być jedną z: {}.",
                INSTRUMENT_CATEGORIES.join(", ")
            )));
        }
        self.parameters.validate()
    }
}

/// Filtr listy dla ekranu "Zarządzaj instrumentami".
#[derive(Debug, Clone, Default, Deserialize)]
pub struct InstrumentListFilter {
    /// Szuka w symbolu wyświetlanym, symbolu technicznym, opisie i kategorii.
    pub search: Option<String>,
    pub category: Option<String>,
    pub visibility: InstrumentVisibilityFilter,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstrumentVisibilityFilter {
    #[default]
    All,
    Visible,
    Hidden,
}

pub trait InstrumentRepository {
    fn create(&self, input: &NewInstrumentInput) -> Result<InstrumentWithDetails, AppError>;
    fn get(&self, id: &str) -> Result<InstrumentWithDetails, AppError>;
    fn list(&self, filter: &InstrumentListFilter) -> Result<Vec<InstrumentWithDetails>, AppError>;
    /// Tworzy nową wersję parametrów instrumentu (poprzednia staje się nieaktywna) - nigdy nie
    /// nadpisuje historycznych wartości.
    fn update_version(
        &self,
        instrument_id: &str,
        input: &InstrumentVersionInput,
    ) -> Result<InstrumentWithDetails, AppError>;
    /// Przywraca fabryczne wartości parametrów (tylko dla instrumentów z katalogu, czyli
    /// z `factory_index.is_some()`) jako kolejną nową wersję.
    fn reset_to_factory(&self, instrument_id: &str) -> Result<InstrumentWithDetails, AppError>;
    fn set_visibility(&self, instrument_id: &str, is_visible: bool) -> Result<(), AppError>;
    fn set_visibility_bulk(
        &self,
        instrument_ids: &[String],
        is_visible: bool,
    ) -> Result<(), AppError>;
    fn reorder(&self, ordered_instrument_ids: &[String]) -> Result<(), AppError>;
    fn reset_to_default_visibility(&self) -> Result<(), AppError>;
    /// Trwale usuwa instrument. Dozwolone WYŁĄCZNIE dla instrumentów własnych
    /// (`factory_index.is_none()`) - fabryczny katalog 350 można wyłącznie ukryć, nigdy usunąć.
    /// Odrzuca też usunięcie instrumentu, do którego odwołuje się choćby jedna transakcja.
    fn delete(&self, instrument_id: &str) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn valid_params() -> InstrumentVersionInput {
        InstrumentVersionInput {
            currency_base: "EUR".to_string(),
            currency_profit: "USD".to_string(),
            currency_margin: "EUR".to_string(),
            digits: 5,
            point: dec!(0.00001),
            trade_tick_size: dec!(0.00001),
            trade_tick_value: dec!(1),
            tick_value_profit: dec!(1),
            tick_value_loss: dec!(1),
            contract_size: dec!(100000),
            volume_min: dec!(0.01),
            volume_max: dec!(100),
            volume_step: dec!(0.01),
            volume_limit: dec!(0),
            calc_mode: "SYMBOL_CALC_MODE_FOREX".to_string(),
            trade_mode: "SYMBOL_TRADE_MODE_FULL".to_string(),
            execution_mode: "SYMBOL_TRADE_EXECUTION_MARKET".to_string(),
            order_mode_flags: 63,
            filling_mode_flags: 1,
            expiration_mode_flags: 15,
            spread_floating: true,
            stops_level_points: 0,
            freeze_level_points: 0,
            margin_initial: dec!(0),
            margin_maintenance: dec!(0),
            margin_hedged: dec!(0),
            margin_hedged_use_leg: false,
            liquidity_rate: dec!(0),
            margin_rate_buy_initial: dec!(1),
            margin_rate_buy_maintenance: dec!(1),
            margin_rate_sell_initial: dec!(1),
            margin_rate_sell_maintenance: dec!(1),
            swap_mode: "SYMBOL_SWAP_MODE_POINTS".to_string(),
            swap_long: dec!(-3.08),
            swap_short: dec!(-1.4),
            swap_sunday: dec!(1),
            swap_monday: dec!(1),
            swap_tuesday: dec!(1),
            swap_wednesday: dec!(1),
            swap_thursday: dec!(1),
            swap_friday: dec!(1),
            swap_saturday: dec!(1),
            triple_swap_day: "ENUM_DAY_OF_WEEK::7".to_string(),
            quote_sessions: "Mon:00:00-23:55".to_string(),
            trade_sessions: "Mon:00:00-23:55".to_string(),
            start_time: None,
            expiration_time: None,
        }
    }

    fn valid_input() -> NewInstrumentInput {
        NewInstrumentInput {
            display_symbol: "EURUSD".to_string(),
            source_symbol: "EURUSD.ecn".to_string(),
            description: "Euro vs US Dollar".to_string(),
            category: "Forex".to_string(),
            parameters: valid_params(),
        }
    }

    #[test]
    fn accepts_valid_input() {
        assert!(valid_input().validate().is_ok());
    }

    #[test]
    fn rejects_blank_display_symbol() {
        let mut input = valid_input();
        input.display_symbol = "  ".to_string();
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_unknown_category() {
        let mut input = valid_input();
        input.category = "Nieznana".to_string();
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_zero_trade_tick_size() {
        let mut input = valid_input();
        input.parameters.trade_tick_size = dec!(0);
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_volume_min_greater_than_max() {
        let mut input = valid_input();
        input.parameters.volume_min = dec!(10);
        input.parameters.volume_max = dec!(1);
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_volume_range_not_divisible_by_step() {
        let mut input = valid_input();
        input.parameters.volume_min = dec!(0.01);
        input.parameters.volume_max = dec!(1.005);
        input.parameters.volume_step = dec!(0.01);
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_malformed_currency() {
        let mut input = valid_input();
        input.parameters.currency_profit = "us".to_string();
        assert!(input.validate().is_err());
    }
}
