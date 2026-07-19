use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
pub struct Strategy {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub entry_rules: Option<String>,
    pub management_rules: Option<String>,
    pub exit_rules: Option<String>,
    pub tags: Vec<String>,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

/// Snapshot istotnych parametrów strategii zapisywany w transakcji w momencie utworzenia,
/// żeby późniejsza edycja/archiwizacja strategii nie zmieniała historii (sekcja 6.5/6.6).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategySnapshot {
    pub strategy_id: String,
    pub name: String,
    pub color: Option<String>,
}

impl From<&Strategy> for StrategySnapshot {
    fn from(strategy: &Strategy) -> Self {
        Self {
            strategy_id: strategy.id.clone(),
            name: strategy.name.clone(),
            color: strategy.color.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StrategyInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub entry_rules: Option<String>,
    pub management_rules: Option<String>,
    pub exit_rules: Option<String>,
    pub tags: Vec<String>,
}

impl StrategyInput {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa strategii nie może być pusta.".to_string(),
            ));
        }
        Ok(())
    }
}

pub trait StrategyRepository {
    fn create(&self, input: &StrategyInput) -> Result<Strategy, AppError>;
    fn get(&self, id: &str) -> Result<Strategy, AppError>;
    fn list(&self, include_archived: bool) -> Result<Vec<Strategy>, AppError>;
    fn update(&self, id: &str, input: &StrategyInput) -> Result<Strategy, AppError>;
    fn duplicate(&self, id: &str) -> Result<Strategy, AppError>;
    fn archive(&self, id: &str) -> Result<Strategy, AppError>;
    fn restore(&self, id: &str) -> Result<Strategy, AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> StrategyInput {
        StrategyInput {
            name: "Breakout".to_string(),
            description: Some("Wybicia z konsolidacji".to_string()),
            color: Some("#D7B45A".to_string()),
            entry_rules: Some("Wybicie oporu z wolumenem".to_string()),
            management_rules: None,
            exit_rules: None,
            tags: vec!["trend".to_string()],
        }
    }

    #[test]
    fn accepts_valid_input() {
        assert!(valid_input().validate().is_ok());
    }

    #[test]
    fn rejects_blank_name() {
        let mut input = valid_input();
        input.name = "   ".to_string();
        assert!(input.validate().is_err());
    }
}
