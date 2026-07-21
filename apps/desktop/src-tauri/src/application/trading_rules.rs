use std::sync::Arc;

use crate::domain::trading_rules::{TradingRulesRepository, TradingRulesState, TradingRulesWrite};
use crate::error::AppError;

/// Warstwa aplikacyjna zakładki "Zasady handlu" (Faza 8) - cienka nakładka na repozytorium;
/// cała logika duplikatów/szablonów żyje w domain/infrastructure, a Kosz dostaje osobne metody
/// przywracania/trwałego usuwania pojedynczego pytania.
pub struct TradingRulesService {
    repository: Arc<dyn TradingRulesRepository + Send + Sync>,
}

impl TradingRulesService {
    pub fn new(repository: Arc<dyn TradingRulesRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn get(&self) -> Result<TradingRulesState, AppError> {
        self.repository.get()
    }

    pub fn save(&self, write: TradingRulesWrite) -> Result<TradingRulesState, AppError> {
        self.repository.save(&write)
    }

    pub fn restore_templates(&self) -> Result<TradingRulesState, AppError> {
        self.repository.restore_templates()
    }

    pub fn restore_rule(&self, id: &str) -> Result<(), AppError> {
        self.repository.restore_rule(id)
    }

    pub fn delete_rule_permanently(&self, id: &str) -> Result<(), AppError> {
        self.repository.delete_rule_permanently(id)
    }
}
