use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::error::AppError;

/// Jeden wpis na zarządzanej liście stanów emocjonalnych (sekcja "Emocje w 3 momentach") -
/// wbudowane stany (`is_builtin`) nie mogą być zmieniane nazwą ani usuwane, tylko ukrywane;
/// własne stany użytkownika można usunąć w całości. Ten sam wzorzec co planowane zarządzanie
/// interwałami (Faza 4).
#[derive(Debug, Clone, Serialize)]
pub struct EmotionalState {
    pub id: String,
    pub name: String,
    pub is_builtin: bool,
    pub hidden: bool,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct NewEmotionalState {
    pub name: String,
}

impl NewEmotionalState {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa stanu emocjonalnego nie może być pusta.".to_string(),
            ));
        }
        Ok(())
    }
}

pub trait EmotionalStateRepository {
    fn create(&self, input: &NewEmotionalState) -> Result<EmotionalState, AppError>;
    fn list(&self, include_hidden: bool) -> Result<Vec<EmotionalState>, AppError>;
    fn set_hidden(&self, id: &str, hidden: bool) -> Result<EmotionalState, AppError>;
    /// Odrzuca usunięcie wbudowanego stanu (`AppError::Validation`) - można je wyłącznie ukryć.
    fn delete(&self, id: &str) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_name() {
        let input = NewEmotionalState {
            name: "   ".to_string(),
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn accepts_valid_name() {
        let input = NewEmotionalState {
            name: "Skupienie".to_string(),
        };
        assert!(input.validate().is_ok());
    }
}
