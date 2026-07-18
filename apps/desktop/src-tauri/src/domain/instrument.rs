use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct Instrument {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub category: Option<String>,
    pub decimal_places: i64,
    pub tick_size: Decimal,
    pub tick_value_per_lot: Decimal,
    pub contract_size: Decimal,
    pub pip_size: Decimal,
    pub quote_currency: String,
    pub settlement_currency: String,
    pub min_lot: Decimal,
    pub lot_step: Decimal,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstrumentSpecInput {
    pub symbol: String,
    pub name: String,
    pub category: Option<String>,
    pub decimal_places: i64,
    pub tick_size: Decimal,
    pub tick_value_per_lot: Decimal,
    pub contract_size: Decimal,
    pub pip_size: Decimal,
    pub quote_currency: String,
    pub settlement_currency: String,
    pub min_lot: Decimal,
    pub lot_step: Decimal,
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

impl InstrumentSpecInput {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.symbol.trim().is_empty() {
            return Err(AppError::Validation(
                "Symbol instrumentu nie może być pusty.".to_string(),
            ));
        }
        if self.name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa instrumentu nie może być pusta.".to_string(),
            ));
        }
        if !(0..=10).contains(&self.decimal_places) {
            return Err(AppError::Validation(
                "Liczba miejsc dziesiętnych musi być z zakresu 0-10.".to_string(),
            ));
        }
        validate_positive("Tick size", self.tick_size)?;
        validate_positive("Tick value na lot", self.tick_value_per_lot)?;
        validate_positive("Wielkość kontraktu", self.contract_size)?;
        validate_positive("Pip size", self.pip_size)?;
        validate_positive("Minimalny lot", self.min_lot)?;
        validate_positive("Krok lota", self.lot_step)?;
        validate_currency_code("Waluta kwotowana", &self.quote_currency)?;
        validate_currency_code("Waluta wyniku", &self.settlement_currency)?;
        Ok(())
    }
}

pub trait InstrumentRepository {
    fn create(&self, input: &InstrumentSpecInput) -> Result<Instrument, AppError>;
    fn get(&self, id: &str) -> Result<Instrument, AppError>;
    fn list(&self, include_inactive: bool) -> Result<Vec<Instrument>, AppError>;
    fn update(&self, id: &str, input: &InstrumentSpecInput) -> Result<Instrument, AppError>;
    fn deactivate(&self, id: &str) -> Result<Instrument, AppError>;
    fn activate(&self, id: &str) -> Result<Instrument, AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn valid_input() -> InstrumentSpecInput {
        InstrumentSpecInput {
            symbol: "EURUSD".to_string(),
            name: "Euro / Dolar amerykański".to_string(),
            category: Some("forex".to_string()),
            decimal_places: 5,
            tick_size: dec!(0.00001),
            tick_value_per_lot: dec!(1),
            contract_size: dec!(100000),
            pip_size: dec!(0.0001),
            quote_currency: "USD".to_string(),
            settlement_currency: "USD".to_string(),
            min_lot: dec!(0.01),
            lot_step: dec!(0.01),
        }
    }

    #[test]
    fn accepts_valid_input() {
        assert!(valid_input().validate().is_ok());
    }

    #[test]
    fn rejects_blank_symbol() {
        let mut input = valid_input();
        input.symbol = "  ".to_string();
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_zero_tick_size() {
        let mut input = valid_input();
        input.tick_size = dec!(0);
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_negative_contract_size() {
        let mut input = valid_input();
        input.contract_size = dec!(-1);
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_out_of_range_decimal_places() {
        let mut input = valid_input();
        input.decimal_places = 11;
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_malformed_currency() {
        let mut input = valid_input();
        input.quote_currency = "us".to_string();
        assert!(input.validate().is_err());
    }
}
