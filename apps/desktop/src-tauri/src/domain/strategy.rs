use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Jedna zasada wejścia - lista zarządzana wprost na strategii (sekcja "Przebudowa zasad
/// strategii"). `required` odróżnia zasady wymagane od opcjonalnych na checkliście transakcji;
/// `archived` chowa zasadę z aktywnej listy bez usuwania (i bez zrywania historycznych
/// checklist, które przechowują nazwę/required wprost, nie tylko odniesienie po id).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntryRule {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub required: bool,
    pub archived: bool,
    pub sort_order: i64,
}

/// Zasada zarządzania pozycją - ten sam wzorzec co `EntryRule`, ale bez podziału na
/// wymagane/opcjonalne (sekcja "Nowa obowiązkowa sekcja Zasady zarządzania pozycją").
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManagementRule {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub archived: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Strategy {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub entry_rules: Vec<EntryRule>,
    pub management_rules: Vec<ManagementRule>,
    /// Wolny tekst z poprzedniej wersji modelu (przed strukturalizacją zasad) - zachowany
    /// wyłącznie do wglądu/diagnostyki, nowy model już go nie zapisuje ani nie pokazuje w
    /// aktywnym UI.
    pub legacy_entry_rules_text: Option<String>,
    pub legacy_management_rules_text: Option<String>,
    /// Zasady wyjścia usunięte z aktywnego modelu (sekcja "Usuń sekcję Zasady wyjścia") -
    /// stary wolny tekst zachowany wyłącznie do wglądu/diagnostyki.
    pub legacy_exit_rules_text: Option<String>,
    pub tags: Vec<String>,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

/// Snapshot istotnych parametrów strategii zapisywany w transakcji w momencie utworzenia,
/// żeby późniejsza edycja/archiwizacja strategii nie zmieniała historii (sekcja 6.5/6.6).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategySnapshot {
    pub strategy_id: String,
    pub name: String,
    pub color: Option<String>,
}

impl From<&Strategy> for StrategySnapshot {
    fn from(strategy: &Strategy) -> Self {
        Self {
            strategy_id: strategy.id.clone(),
            name: strategy.name.clone(),
            color: strategy.color.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StrategyInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub entry_rules: Vec<EntryRule>,
    pub management_rules: Vec<ManagementRule>,
    pub tags: Vec<String>,
}

fn normalize_rule_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn validate_no_duplicate_active_names<'a>(
    names: impl Iterator<Item = (&'a str, bool)>,
    label: &str,
) -> Result<(), AppError> {
    let mut seen: Vec<String> = Vec::new();
    for (name, archived) in names {
        if archived {
            continue;
        }
        let normalized = normalize_rule_name(name);
        if seen.contains(&normalized) {
            return Err(AppError::Validation(format!(
                "Zduplikowana nazwa {label}: \"{}\" (aktywne zasady muszą mieć unikalne nazwy).",
                name.trim()
            )));
        }
        seen.push(normalized);
    }
    Ok(())
}

impl StrategyInput {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa strategii nie może być pusta.".to_string(),
            ));
        }
        for rule in &self.entry_rules {
            if rule.name.trim().is_empty() {
                return Err(AppError::Validation(
                    "Nazwa zasady wejścia nie może być pusta.".to_string(),
                ));
            }
        }
        for rule in &self.management_rules {
            if rule.name.trim().is_empty() {
                return Err(AppError::Validation(
                    "Nazwa zasady zarządzania pozycją nie może być pusta.".to_string(),
                ));
            }
        }
        validate_no_duplicate_active_names(
            self.entry_rules
                .iter()
                .map(|r| (r.name.as_str(), r.archived)),
            "zasady wejścia",
        )?;
        validate_no_duplicate_active_names(
            self.management_rules
                .iter()
                .map(|r| (r.name.as_str(), r.archived)),
            "zasady zarządzania pozycją",
        )?;
        Ok(())
    }
}

pub trait StrategyRepository {
    fn create(&self, input: &StrategyInput) -> Result<Strategy, AppError>;
    fn get(&self, id: &str) -> Result<Strategy, AppError>;
    fn list(&self, include_archived: bool) -> Result<Vec<Strategy>, AppError>;
    fn update(&self, id: &str, input: &StrategyInput) -> Result<Strategy, AppError>;
    fn duplicate(&self, id: &str) -> Result<Strategy, AppError>;
    fn archive(&self, id: &str) -> Result<Strategy, AppError>;
    fn restore(&self, id: &str) -> Result<Strategy, AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry_rule(name: &str, required: bool, archived: bool) -> EntryRule {
        EntryRule {
            id: format!("entry-{name}"),
            name: name.to_string(),
            description: None,
            required,
            archived,
            sort_order: 0,
        }
    }

    fn management_rule(name: &str, archived: bool) -> ManagementRule {
        ManagementRule {
            id: format!("mgmt-{name}"),
            name: name.to_string(),
            description: None,
            archived,
            sort_order: 0,
        }
    }

    fn valid_input() -> StrategyInput {
        StrategyInput {
            name: "Breakout".to_string(),
            description: Some("Wybicia z konsolidacji".to_string()),
            color: Some("#D7B45A".to_string()),
            entry_rules: vec![entry_rule("Wybicie oporu z wolumenem", true, false)],
            management_rules: vec![],
            tags: vec!["trend".to_string()],
        }
    }

    #[test]
    fn accepts_valid_input() {
        assert!(valid_input().validate().is_ok());
    }

    #[test]
    fn rejects_blank_name() {
        let mut input = valid_input();
        input.name = "   ".to_string();
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_blank_entry_rule_name() {
        let mut input = valid_input();
        input.entry_rules.push(entry_rule("   ", false, false));
        assert!(input.validate().is_err());
    }

    #[test]
    fn rejects_duplicate_active_entry_rule_names_case_insensitive() {
        let mut input = valid_input();
        input
            .entry_rules
            .push(entry_rule("wybicie oporu z wolumenem", false, false));
        assert!(input.validate().is_err());
    }

    #[test]
    fn allows_duplicate_name_when_one_copy_is_archived() {
        let mut input = valid_input();
        input.entry_rules[0].archived = true;
        input
            .entry_rules
            .push(entry_rule("Wybicie oporu z wolumenem", true, false));
        assert!(input.validate().is_ok());
    }

    #[test]
    fn rejects_duplicate_active_management_rule_names() {
        let mut input = valid_input();
        input
            .management_rules
            .push(management_rule("Trailing stop", false));
        input
            .management_rules
            .push(management_rule("trailing stop", false));
        assert!(input.validate().is_err());
    }
}
