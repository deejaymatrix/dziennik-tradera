use std::sync::Arc;

use crate::domain::instrument::{Instrument, InstrumentRepository, InstrumentSpecInput};
use crate::error::AppError;

pub struct InstrumentsService {
    repository: Arc<dyn InstrumentRepository + Send + Sync>,
}

impl InstrumentsService {
    pub fn new(repository: Arc<dyn InstrumentRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn create(&self, input: InstrumentSpecInput) -> Result<Instrument, AppError> {
        self.repository.create(&input)
    }

    pub fn list(&self, include_inactive: bool) -> Result<Vec<Instrument>, AppError> {
        self.repository.list(include_inactive)
    }

    pub fn update(&self, id: &str, input: InstrumentSpecInput) -> Result<Instrument, AppError> {
        self.repository.update(id, &input)
    }

    pub fn deactivate(&self, id: &str) -> Result<Instrument, AppError> {
        self.repository.deactivate(id)
    }

    pub fn activate(&self, id: &str) -> Result<Instrument, AppError> {
        self.repository.activate(id)
    }
}
