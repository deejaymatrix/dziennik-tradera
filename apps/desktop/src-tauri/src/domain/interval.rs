use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::error::AppError;

/// Jeden wpis na zarządzanej liście interwałów (sekcja "Zarządzanie interwałami", Faza 4) - ten
/// sam wzorzec co `EmotionalState`, rozszerzony o `archived_at`: `hidden` jest szybkim
/// przełącznikiem widoczności dostępnym też dla wpisów wbudowanych, `archived_at` to niezależne,
/// docelowe "miejsce" dla własnych interwałów użytkownika w przyszłym uniwersalnym Koszu (Faza 5)
/// - wbudowane interwały nie mogą być archiwizowane, tylko ukrywane.
#[derive(Debug, Clone, Serialize)]
pub struct Interval {
    pub id: String,
    pub label: String,
    pub is_builtin: bool,
    pub hidden: bool,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct NewInterval {
    pub label: String,
}

impl NewInterval {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.label.trim().is_empty() {
            return Err(AppError::Validation(
                "Etykieta interwału nie może być pusta.".to_string(),
            ));
        }
        Ok(())
    }
}

pub trait IntervalRepository {
    fn create(&self, input: &NewInterval) -> Result<Interval, AppError>;
    fn get(&self, id: &str) -> Result<Interval, AppError>;
    fn list(&self, include_hidden: bool, include_archived: bool)
        -> Result<Vec<Interval>, AppError>;
    /// Odrzuca zmianę etykiety wpisu wbudowanego (`AppError::Validation`).
    fn update_label(&self, id: &str, label: &str) -> Result<Interval, AppError>;
    fn set_hidden(&self, id: &str, hidden: bool) -> Result<Interval, AppError>;
    /// Odrzuca archiwizację wpisu wbudowanego (`AppError::Validation`) - można go wyłącznie
    /// ukryć.
    fn archive(&self, id: &str) -> Result<Interval, AppError>;
    fn restore(&self, id: &str) -> Result<Interval, AppError>;
    fn reorder(&self, ordered_ids: &[String]) -> Result<(), AppError>;
    /// Trwałe usunięcie interwału (uniwersalny Kosz, Faza 5) - dozwolone tylko dla już
    /// zarchiwizowanego interwału (co samo w sobie wyklucza wbudowane - nie można ich
    /// zarchiwizować). `interval_id` na transakcji nie ma żywego klucza obcego - zamrożona
    /// migawka etykiety (`trades.interval`) przetrwa usunięcie bez zmian.
    fn delete_permanently(&self, id: &str) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_label() {
        let input = NewInterval {
            label: "   ".to_string(),
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn accepts_valid_label() {
        let input = NewInterval {
            label: "M20".to_string(),
        };
        assert!(input.validate().is_ok());
    }
}
