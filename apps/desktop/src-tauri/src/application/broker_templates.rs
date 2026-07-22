use std::sync::Arc;

use crate::domain::broker_template::{BrokerTemplate, BrokerTemplateRepository, NewTemplate};
use crate::error::AppError;

/// Warstwa aplikacyjna szablonów instrumentów brokera (B1). Po migracji 0011 powiązanie z kontem
/// mieszka na koncie (`accounts.template_id`), więc jeden szablon może obsługiwać wiele
/// rachunków - serwis jest tu wyłącznie przelotką do repozytorium. Dawnego uzgodnienia
/// startowego (kopia szablonu dla każdego konta bez szablonu) świadomie nie ma: istniało tylko
/// po to, żeby spełnić regułę jeden-do-jednego, a podejmowało za użytkownika nieodwracalną
/// decyzję o przypisaniu.
pub struct BrokerTemplatesService {
    repository: Arc<dyn BrokerTemplateRepository + Send + Sync>,
}

impl BrokerTemplatesService {
    pub fn new(repository: Arc<dyn BrokerTemplateRepository + Send + Sync>) -> Self {
        Self { repository }
    }

    pub fn list(&self, include_archived: bool) -> Result<Vec<BrokerTemplate>, AppError> {
        self.repository.list(include_archived)
    }

    pub fn create(&self, input: NewTemplate) -> Result<BrokerTemplate, AppError> {
        self.repository.create(&input)
    }

    pub fn rename(&self, id: &str, name: &str) -> Result<BrokerTemplate, AppError> {
        self.repository.rename(id, name)
    }

    pub fn duplicate(&self, id: &str, new_name: &str) -> Result<BrokerTemplate, AppError> {
        self.repository.duplicate(id, new_name)
    }

    pub fn assign_to_account(&self, template_id: &str, account_id: &str) -> Result<(), AppError> {
        self.repository.assign_to_account(template_id, account_id)
    }

    pub fn unassign(&self, template_id: &str) -> Result<(), AppError> {
        self.repository.unassign(template_id)
    }

    pub fn archive(&self, id: &str) -> Result<(), AppError> {
        self.repository.archive(id)
    }

    pub fn restore(&self, id: &str) -> Result<(), AppError> {
        self.repository.restore(id)
    }

    pub fn delete_permanently(&self, id: &str) -> Result<(), AppError> {
        self.repository.delete_permanently(id)
    }
}
