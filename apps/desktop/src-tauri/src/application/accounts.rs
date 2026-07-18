use std::sync::Arc;

use crate::domain::account::{Account, AccountRepository, NewAccount, UpdateAccount};
use crate::error::AppError;

/// Warstwa aplikacyjna: to, co widzą komendy Tauri. Nie zna SQLite ani Reacta - operuje
/// wyłącznie na abstrakcji [`AccountRepository`] z warstwy domenowej.
pub struct AccountsService {
    repository: Arc<dyn AccountRepository + Send + Sync>,
}

impl AccountsService {
    pub fn new(repository: Arc<dyn AccountRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn create(&self, input: NewAccount) -> Result<Account, AppError> {
        self.repository.create(&input)
    }

    pub fn list(&self, include_archived: bool) -> Result<Vec<Account>, AppError> {
        self.repository.list(include_archived)
    }

    pub fn update(&self, id: &str, input: UpdateAccount) -> Result<Account, AppError> {
        self.repository.update(id, &input)
    }

    pub fn archive(&self, id: &str) -> Result<Account, AppError> {
        self.repository.archive(id)
    }

    pub fn restore(&self, id: &str) -> Result<Account, AppError> {
        self.repository.restore(id)
    }
}
