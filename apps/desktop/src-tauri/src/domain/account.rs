use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub account_type: Option<String>,
    pub currency: String,
    pub initial_balance: Decimal,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewAccount {
    pub name: String,
    pub description: Option<String>,
    pub account_type: Option<String>,
    pub currency: String,
    pub initial_balance: Decimal,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAccount {
    pub name: String,
    pub description: Option<String>,
    pub account_type: Option<String>,
    pub currency: String,
}

fn validate_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation(
            "Nazwa konta nie może być pusta.".to_string(),
        ));
    }
    Ok(())
}

fn validate_currency(currency: &str) -> Result<(), AppError> {
    let is_valid = currency.len() == 3 && currency.chars().all(|c| c.is_ascii_uppercase());
    if !is_valid {
        return Err(AppError::Validation(
            "Waluta musi być trzyliterowym kodem wielkimi literami (np. USD).".to_string(),
        ));
    }
    Ok(())
}

impl NewAccount {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_name(&self.name)?;
        validate_currency(&self.currency)?;
        if self.initial_balance.is_sign_negative() {
            return Err(AppError::Validation(
                "Saldo początkowe nie może być ujemne.".to_string(),
            ));
        }
        Ok(())
    }
}

impl UpdateAccount {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_name(&self.name)?;
        validate_currency(&self.currency)?;
        Ok(())
    }
}

pub trait AccountRepository {
    fn create(&self, input: &NewAccount) -> Result<Account, AppError>;
    fn get(&self, id: &str) -> Result<Account, AppError>;
    fn list(&self, include_archived: bool) -> Result<Vec<Account>, AppError>;
    fn update(&self, id: &str, input: &UpdateAccount) -> Result<Account, AppError>;
    fn archive(&self, id: &str) -> Result<Account, AppError>;
    fn restore(&self, id: &str) -> Result<Account, AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn rejects_blank_name() {
        let input = NewAccount {
            name: "   ".to_string(),
            description: None,
            account_type: None,
            currency: "USD".to_string(),
            initial_balance: dec!(0),
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_negative_initial_balance() {
        let input = NewAccount {
            name: "Konto testowe".to_string(),
            description: None,
            account_type: None,
            currency: "USD".to_string(),
            initial_balance: dec!(-1),
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_malformed_currency() {
        let input = NewAccount {
            name: "Konto testowe".to_string(),
            description: None,
            account_type: None,
            currency: "usd".to_string(),
            initial_balance: dec!(100),
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn accepts_valid_input() {
        let input = NewAccount {
            name: "Konto testowe".to_string(),
            description: Some("Opis".to_string()),
            account_type: Some("demo".to_string()),
            currency: "USD".to_string(),
            initial_balance: dec!(1000.50),
        };
        assert!(input.validate().is_ok());
    }

    #[test]
    fn decimal_serializes_as_json_string_not_float() {
        let value = dec!(1000.50);
        let json = serde_json::to_value(value).expect("serialize");
        assert!(
            json.is_string(),
            "Decimal powinien serializować się jako string JSON, nie float"
        );
        assert_eq!(json, serde_json::Value::String("1000.50".to_string()));
    }
}
