use std::sync::Arc;

use crate::domain::interval::{Interval, IntervalRepository, NewInterval};
use crate::error::AppError;

pub struct IntervalsService {
    repository: Arc<dyn IntervalRepository + Send + Sync>,
}

impl IntervalsService {
    pub fn new(repository: Arc<dyn IntervalRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn create(&self, input: NewInterval) -> Result<Interval, AppError> {
        input.validate()?;
        self.repository.create(&input)
    }

    pub fn get(&self, id: &str) -> Result<Interval, AppError> {
        self.repository.get(id)
    }

    pub fn list(
        &self,
        include_hidden: bool,
        include_archived: bool,
    ) -> Result<Vec<Interval>, AppError> {
        self.repository.list(include_hidden, include_archived)
    }

    pub fn update_label(&self, id: &str, label: String) -> Result<Interval, AppError> {
        self.repository.update_label(id, label.trim())
    }

    pub fn set_hidden(&self, id: &str, hidden: bool) -> Result<Interval, AppError> {
        self.repository.set_hidden(id, hidden)
    }

    pub fn archive(&self, id: &str) -> Result<Interval, AppError> {
        self.repository.archive(id)
    }

    pub fn restore(&self, id: &str) -> Result<Interval, AppError> {
        self.repository.restore(id)
    }

    /// Przywrócenie z kosza pod inną nazwą - używane po odrzuceniu zwykłego przywrócenia
    /// z powodu konfliktu nazw (sekcja 7).
    pub fn restore_with_label(&self, id: &str, label: &str) -> Result<Interval, AppError> {
        self.repository.restore_with_label(id, label)
    }

    /// Podpowiedź wolnej nazwy dla interfejsu proponującego przywrócenie pod inną nazwą.
    pub fn suggest_free_label(&self, label: &str) -> Result<String, AppError> {
        self.repository.suggest_free_label(label)
    }

    pub fn delete_permanently(&self, id: &str) -> Result<(), AppError> {
        self.repository.delete_permanently(id)
    }

    pub fn reorder(&self, ordered_ids: Vec<String>) -> Result<(), AppError> {
        self.repository.reorder(&ordered_ids)
    }
}
