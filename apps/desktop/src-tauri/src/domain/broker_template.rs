use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::instrument_import::ImportedInstrument;
use crate::error::AppError;

/// Źródło szablonu instrumentów (sekcja 1.2 specyfikacji szablonów brokerów).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TemplateSource {
    BrokerImport,
    Duplicated,
    UserCreated,
}

impl TemplateSource {
    pub fn from_db_str(value: &str) -> Self {
        match value {
            "duplicated" => TemplateSource::Duplicated,
            "user_created" => TemplateSource::UserCreated,
            _ => TemplateSource::BrokerImport,
        }
    }
}

/// Szablon instrumentów brokera: odrębny, kompletny zbiór instrumentów i parametrów dla
/// konkretnego konta handlowego. Izolacja (1 konto = 1 aktywny szablon, 1 szablon = max 1
/// konto) jest wymuszona w bazie indeksami częściowymi z migracji 0010, nie tylko w UI.
#[derive(Debug, Clone, Serialize)]
pub struct BrokerTemplate {
    pub id: String,
    pub name: String,
    pub broker_name: String,
    pub account_type: Option<String>,
    pub source: TemplateSource,
    pub import_format_version: Option<i64>,
    pub account_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
    /// Liczba instrumentów w szablonie - do list/potwierdzeń usunięcia (sekcja 1.4).
    pub instrument_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewTemplate {
    pub name: String,
    pub broker_name: String,
    pub account_type: Option<String>,
}

impl NewTemplate {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa szablonu nie może być pusta.".to_string(),
            ));
        }
        if self.broker_name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa brokera nie może być pusta.".to_string(),
            ));
        }
        Ok(())
    }
}

pub trait BrokerTemplateRepository {
    fn list(&self, include_archived: bool) -> Result<Vec<BrokerTemplate>, AppError>;
    fn get(&self, id: &str) -> Result<BrokerTemplate, AppError>;
    /// Nowy, pusty szablon użytkownika.
    fn create(&self, input: &NewTemplate) -> Result<BrokerTemplate, AppError>;
    /// Atomowo tworzy szablon z importu brokera wraz ze WSZYSTKIMI instrumentami i ich pierwszą
    /// rewizją parametrów (sekcja 1.5 - żaden częściowy szablon nie powstaje przy błędzie).
    /// `source = broker_import`, instrumenty oznaczone jako pochodzące z importu (chronione
    /// przed pojedynczym usunięciem). Domyślnie wszystkie ukryte - użytkownik aktywuje wybrane.
    fn create_from_import(
        &self,
        meta: &NewTemplate,
        instruments: &[ImportedInstrument],
    ) -> Result<BrokerTemplate, AppError>;
    /// Atomowo wgrywa dane brokera do ISTNIEJĄCEGO szablonu - dokładnie raz na szablon.
    /// Powtórny import do tego samego szablonu jest odrzucany (`Validation`), bo scalanie dwóch
    /// eksportów dawałoby duplikaty symboli i niejednoznaczne parametry; żeby wgrać dane innego
    /// brokera, użytkownik zakłada nowy szablon.
    fn import_into_template(
        &self,
        template_id: &str,
        instruments: &[ImportedInstrument],
    ) -> Result<BrokerTemplate, AppError>;
    fn rename(&self, id: &str, name: &str) -> Result<BrokerTemplate, AppError>;
    /// Głęboka, niezależna kopia: szablon + instrumenty + preferencje + AKTYWNE rewizje
    /// parametrów. Zmiany w kopii nigdy nie dotykają oryginału (sekcja 1.1).
    fn duplicate(&self, id: &str, new_name: &str) -> Result<BrokerTemplate, AppError>;
    /// Atomowe "Zastąp szablon konta": w jednej transakcji odpina dotychczasowy szablon konta
    /// (jeśli istnieje) i przypina wskazany. Szablon leżący na INNYM koncie zostaje z niego
    /// przeniesiony - relacja jeden-do-jednego jest utrzymana przez przeniesienie, nie przez
    /// odmowę. O zgodę użytkownika (i o to, żeby wiedział, z którego konta szablon zniknie) pyta
    /// warstwa interfejsu.
    fn assign_to_account(&self, template_id: &str, account_id: &str) -> Result<(), AppError>;
    fn unassign(&self, template_id: &str) -> Result<(), AppError>;
    /// Do Kosza. Odrzuca: ostatni aktywny szablon oraz szablon wciąż przypisany do konta
    /// (najpierw "Zastąp szablon konta" - sekcja 1.4).
    fn archive(&self, id: &str) -> Result<(), AppError>;
    /// Z Kosza; kolizja nazwy z aktywnym szablonem = Validation (użytkownik zmienia nazwę).
    fn restore(&self, id: &str) -> Result<(), AppError>;
    /// Trwałe usunięcie (tylko zarchiwizowany): usuwa instrumenty/preferencje/rewizje szablonu,
    /// a transakcjom historycznym zeruje odniesienie `instrument_id` - ich zamrożone migawki
    /// (`instrument_spec_snapshot`) pozostają nietknięte, zgodnie ze specyfikacją.
    fn delete_permanently(&self, id: &str) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_template_rejects_blank_name_and_broker() {
        let blank_name = NewTemplate {
            name: "  ".into(),
            broker_name: "IC Markets".into(),
            account_type: None,
        };
        assert!(blank_name.validate().is_err());

        let blank_broker = NewTemplate {
            name: "IC Markets RAW".into(),
            broker_name: " ".into(),
            account_type: None,
        };
        assert!(blank_broker.validate().is_err());
    }

    #[test]
    fn template_source_parses_known_db_strings_and_defaults_the_rest() {
        assert_eq!(
            TemplateSource::from_db_str("duplicated"),
            TemplateSource::Duplicated
        );
        assert_eq!(
            TemplateSource::from_db_str("user_created"),
            TemplateSource::UserCreated
        );
        assert_eq!(
            TemplateSource::from_db_str("broker_import"),
            TemplateSource::BrokerImport
        );
        assert_eq!(
            TemplateSource::from_db_str("cokolwiek"),
            TemplateSource::BrokerImport
        );
    }
}
