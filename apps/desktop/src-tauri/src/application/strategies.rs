use std::sync::Arc;

use crate::domain::strategy::{Strategy, StrategyInput, StrategyRepository};
use crate::error::AppError;

pub struct StrategiesService {
    repository: Arc<dyn StrategyRepository + Send + Sync>,
}

impl StrategiesService {
    pub fn new(repository: Arc<dyn StrategyRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn create(&self, input: StrategyInput) -> Result<Strategy, AppError> {
        self.repository.create(&input)
    }

    pub fn get(&self, id: &str) -> Result<Strategy, AppError> {
        self.repository.get(id)
    }

    pub fn list(&self, include_archived: bool) -> Result<Vec<Strategy>, AppError> {
        self.repository.list(include_archived)
    }

    pub fn update(&self, id: &str, input: StrategyInput) -> Result<Strategy, AppError> {
        self.repository.update(id, &input)
    }

    pub fn duplicate(&self, id: &str) -> Result<Strategy, AppError> {
        self.repository.duplicate(id)
    }

    pub fn archive(&self, id: &str) -> Result<Strategy, AppError> {
        self.repository.archive(id)
    }

    pub fn restore(&self, id: &str) -> Result<Strategy, AppError> {
        self.repository.restore(id)
    }
}
