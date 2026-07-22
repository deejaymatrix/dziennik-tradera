use std::sync::Arc;

use crate::application::accounts::AccountsService;
use crate::domain::broker_template::{BrokerTemplate, BrokerTemplateRepository, NewTemplate};
use crate::error::AppError;

/// Warstwa aplikacyjna szablonów instrumentów brokera (B1). Poza prostymi przelotkami do
/// repozytorium odpowiada za uzgodnienie startowe: po migracji 0010 tylko najstarsze konto
/// dostaje szablon "QuoMarkets RAW" - każde kolejne aktywne konto bez szablonu dostaje przy
/// starcie NIEZALEŻNĄ kopię szablonu domyślnego (sekcja 1.3 specyfikacji), bo aplikacja nigdy
/// nie może zostawić konta bez aktywnego szablonu.
pub struct BrokerTemplatesService {
    repository: Arc<dyn BrokerTemplateRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
}

impl BrokerTemplatesService {
    pub fn new(
        repository: Arc<dyn BrokerTemplateRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
    ) -> Self {
        Self {
            repository,
            accounts,
        }
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

    /// Uzgodnienie startowe (wywoływane raz przy inicjalizacji aplikacji): każde aktywne konto
    /// bez przypisanego szablonu dostaje niezależną kopię szablonu domyślnego (najstarszego
    /// aktywnego) pod nazwą "Szablon domyślny (nazwa konta)". Zwraca liczbę utworzonych kopii.
    pub fn reconcile_account_templates(&self) -> Result<usize, AppError> {
        let templates = self.repository.list(false)?;
        let Some(default_template) = templates.first() else {
            // Brak jakiegokolwiek aktywnego szablonu nie powinien się zdarzyć (migracja 0010
            // zawsze zostawia "QuoMarkets RAW") - ale jeśli już, nie ma czego kopiować.
            return Ok(0);
        };
        let default_id = default_template.id.clone();
        let default_name = default_template.name.clone();

        let mut created = 0;
        for account in self.accounts.list(false)? {
            let account_id = &account.account.id;
            let has_template = self
                .repository
                .list(false)?
                .iter()
                .any(|t| t.account_id.as_deref() == Some(account_id));
            if has_template {
                continue;
            }
            // Kopia pod czytelną nazwą; przy kolizji dokładamy licznik zamiast się poddawać.
            let base_name = format!("{default_name} ({})", account.account.name);
            let copy = (0..5)
                .map(|attempt| {
                    let candidate = if attempt == 0 {
                        base_name.clone()
                    } else {
                        format!("{base_name} {}", attempt + 1)
                    };
                    self.repository.duplicate(&default_id, &candidate)
                })
                .find_map(Result::ok);
            if let Some(copy) = copy {
                self.repository.assign_to_account(&copy.id, account_id)?;
                created += 1;
            }
        }
        Ok(created)
    }
}
