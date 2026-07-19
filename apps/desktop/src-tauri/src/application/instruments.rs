use std::sync::Arc;

use crate::domain::instrument::{
    InstrumentListFilter, InstrumentRepository, InstrumentVersionInput, InstrumentWithDetails,
    NewInstrumentInput,
};
use crate::error::AppError;

pub struct InstrumentsService {
    repository: Arc<dyn InstrumentRepository + Send + Sync>,
}

impl InstrumentsService {
    pub fn new(repository: Arc<dyn InstrumentRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn create(&self, input: NewInstrumentInput) -> Result<InstrumentWithDetails, AppError> {
        input.validate()?;
        self.repository.create(&input)
    }

    pub fn get(&self, id: &str) -> Result<InstrumentWithDetails, AppError> {
        self.repository.get(id)
    }

    pub fn list(
        &self,
        filter: InstrumentListFilter,
    ) -> Result<Vec<InstrumentWithDetails>, AppError> {
        self.repository.list(&filter)
    }

    pub fn update_version(
        &self,
        id: &str,
        input: InstrumentVersionInput,
    ) -> Result<InstrumentWithDetails, AppError> {
        input.validate()?;
        self.repository.update_version(id, &input)
    }

    pub fn reset_to_factory(&self, id: &str) -> Result<InstrumentWithDetails, AppError> {
        self.repository.reset_to_factory(id)
    }

    pub fn set_visibility(&self, id: &str, is_visible: bool) -> Result<(), AppError> {
        self.repository.set_visibility(id, is_visible)
    }

    pub fn set_visibility_bulk(&self, ids: Vec<String>, is_visible: bool) -> Result<(), AppError> {
        self.repository.set_visibility_bulk(&ids, is_visible)
    }

    pub fn reorder(&self, ordered_ids: Vec<String>) -> Result<(), AppError> {
        self.repository.reorder(&ordered_ids)
    }

    pub fn reset_to_default_visibility(&self) -> Result<(), AppError> {
        self.repository.reset_to_default_visibility()
    }

    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        self.repository.delete(id)
    }
}
