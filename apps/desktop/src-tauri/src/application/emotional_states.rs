use std::sync::Arc;

use crate::domain::emotional_state::{EmotionalState, EmotionalStateRepository, NewEmotionalState};
use crate::error::AppError;

pub struct EmotionalStatesService {
    repository: Arc<dyn EmotionalStateRepository + Send + Sync>,
}

impl EmotionalStatesService {
    pub fn new(repository: Arc<dyn EmotionalStateRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn create(&self, input: NewEmotionalState) -> Result<EmotionalState, AppError> {
        self.repository.create(&input)
    }

    pub fn list(&self, include_hidden: bool) -> Result<Vec<EmotionalState>, AppError> {
        self.repository.list(include_hidden)
    }

    pub fn set_hidden(&self, id: &str, hidden: bool) -> Result<EmotionalState, AppError> {
        self.repository.set_hidden(id, hidden)
    }

    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        self.repository.delete(id)
    }
}
