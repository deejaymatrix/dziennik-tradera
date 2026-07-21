use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Kategoria zasad handlu (Faza 8) - karta na zakładce "Zasady handlu". Wbudowane kategorie
/// pochodzą z szablonu specyfikacji; użytkownik może dodawać własne i zmieniać kolejność
/// wszystkich. Kategorii się nie usuwa ani nie archiwizuje w tej wersji - znikają tylko
/// pytania (ukrycie/Kosz), pusta kategoria po prostu nie ma czego pokazać.
#[derive(Debug, Clone, Serialize)]
pub struct TradingRuleCategory {
    pub id: String,
    pub name: String,
    pub is_builtin: bool,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Jedno pytanie regulaminu z odpowiedzią użytkownika. Zgodnie ze specyfikacją pytania-szablony
/// (`is_builtin`) są edytowalne, a `template_question` przechowuje ich oryginalną treść -
/// "Przywróć szablon" odtwarza z niej pytanie, NIGDY nie dotykając odpowiedzi.
#[derive(Debug, Clone, Serialize)]
pub struct TradingRule {
    pub id: String,
    pub category_id: String,
    pub question: String,
    pub answer: Option<String>,
    pub is_builtin: bool,
    pub template_question: Option<String>,
    pub hidden: bool,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
}

/// Pełny stan zakładki - jedna odpowiedź komendy `get_trading_rules`, żeby frontend nie składał
/// widoku z wielu wywołań.
#[derive(Debug, Clone, Serialize)]
pub struct TradingRulesState {
    pub categories: Vec<TradingRuleCategory>,
    pub rules: Vec<TradingRule>,
}

/// Zapis kategorii przy zbiorczym zapisie zakładki: istniejąca (id z bazy) albo nowa (id
/// wygenerowany po stronie frontendu nie jest zaufany - nowe wpisy mają `id: None`).
#[derive(Debug, Clone, Deserialize)]
pub struct TradingRuleCategoryWrite {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TradingRuleWrite {
    pub id: Option<String>,
    /// Indeks kategorii na liście `categories` zapisu (nie id!) - nowe kategorie nie mają
    /// jeszcze id, a pytanie musi dać się przypisać także do nich.
    pub category_index: usize,
    pub question: String,
    pub answer: Option<String>,
    pub hidden: bool,
    pub archived: bool,
}

/// Zbiorczy zapis całej zakładki (wzorzec "Zapisz zmiany" jak na karcie transakcji): kolejność
/// list wyznacza sort_order, brak istniejącego pytania na liście oznacza jego trwałe usunięcie
/// (użytkownik usunął je w trybie edycji), `archived` wysyła pytanie do Kosza.
#[derive(Debug, Clone, Deserialize)]
pub struct TradingRulesWrite {
    pub categories: Vec<TradingRuleCategoryWrite>,
    pub rules: Vec<TradingRuleWrite>,
}

impl TradingRulesWrite {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.categories.is_empty() {
            return Err(AppError::Validation(
                "Zakładka musi mieć co najmniej jedną kategorię.".to_string(),
            ));
        }
        for category in &self.categories {
            if category.name.trim().is_empty() {
                return Err(AppError::Validation(
                    "Nazwa kategorii nie może być pusta.".to_string(),
                ));
            }
        }
        for rule in &self.rules {
            if rule.question.trim().is_empty() {
                return Err(AppError::Validation(
                    "Treść pytania nie może być pusta.".to_string(),
                ));
            }
            if rule.category_index >= self.categories.len() {
                return Err(AppError::Validation(format!(
                    "Pytanie \"{}\" wskazuje nieistniejącą kategorię.",
                    rule.question.trim()
                )));
            }
        }
        Ok(())
    }
}

/// Normalizacja do porównywania duplikatów pytań (sekcja "Usuwanie powtórzeń" specyfikacji):
/// przycięte i zwinięte spacje, bez rozróżniania wielkości liter. Używana po obu stronach -
/// frontend ostrzega na żywo, backend jest autorytatywny przy zapisie.
pub fn normalize_question(question: &str) -> String {
    question
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub trait TradingRulesRepository {
    fn get(&self) -> Result<TradingRulesState, AppError>;
    /// Transakcyjny zapis całej zakładki - patrz `TradingRulesWrite`.
    fn save(&self, write: &TradingRulesWrite) -> Result<TradingRulesState, AppError>;
    /// Przywraca szablon: odtwarza treść pytań wbudowanych z `template_question` i dodaje
    /// z powrotem brakujące/zarchiwizowane pytania wbudowane - NIGDY nie dotyka odpowiedzi
    /// ani pytań własnych użytkownika.
    fn restore_templates(&self) -> Result<TradingRulesState, AppError>;
    /// Przywrócenie pytania z Kosza.
    fn restore_rule(&self, id: &str) -> Result<(), AppError>;
    /// Trwałe usunięcie pytania - dozwolone tylko dla już zarchiwizowanego (Kosz).
    fn delete_rule_permanently(&self, id: &str) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_collapses_whitespace_and_case() {
        assert_eq!(
            normalize_question("  Jak   USTALAM wielkość  pozycji? "),
            "jak ustalam wielkość pozycji?"
        );
    }

    #[test]
    fn write_rejects_empty_categories() {
        let write = TradingRulesWrite {
            categories: vec![],
            rules: vec![],
        };
        assert!(write.validate().is_err());
    }

    #[test]
    fn write_rejects_a_rule_pointing_at_a_missing_category() {
        let write = TradingRulesWrite {
            categories: vec![TradingRuleCategoryWrite {
                id: None,
                name: "Podstawy".to_string(),
            }],
            rules: vec![TradingRuleWrite {
                id: None,
                category_index: 5,
                question: "Pytanie?".to_string(),
                answer: None,
                hidden: false,
                archived: false,
            }],
        };
        assert!(write.validate().is_err());
    }

    #[test]
    fn write_accepts_a_valid_shape() {
        let write = TradingRulesWrite {
            categories: vec![TradingRuleCategoryWrite {
                id: None,
                name: "Podstawy".to_string(),
            }],
            rules: vec![TradingRuleWrite {
                id: None,
                category_index: 0,
                question: "Pytanie?".to_string(),
                answer: Some("Odpowiedź".to_string()),
                hidden: false,
                archived: false,
            }],
        };
        assert!(write.validate().is_ok());
    }
}
