use serde::{Deserialize, Serialize};

/// Stan jednej pozycji checklisty - dla zasad wejścia czytany jako Spełniona/Niespełniona/Nie
/// dotyczy, dla zasad zarządzania jako Wykonana/Niewykonana/Nie dotyczy (ta sama wartość,
/// frontend dobiera etykietę wg listy). Niespełniona wymagana zasada NIE blokuje zapisu -
/// oznacza tylko naruszenie planu, widoczne później przy przeglądzie transakcji.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChecklistStatus {
    Fulfilled,
    Unfulfilled,
    NotApplicable,
}

/// Zamrożona pozycja checklisty - niesie nazwę i `required` WPROST (nie tylko odniesienie po
/// id), więc późniejsza edycja/usunięcie zasady w definicji strategii nigdy nie zmienia ani nie
/// psuje już zapisanej historycznej checklisty transakcji.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub rule_id: String,
    pub name: String,
    pub required: bool,
    pub status: ChecklistStatus,
}

/// Migawka zasad strategii w momencie jej wyboru na transakcji (sekcja "Checklist w
/// transakcji") - budowana i utrzymywana po stronie frontendu (ten sam wzorzec co
/// `domain::trade_emotions`): świeża przy zmianie strategii na inną, zachowana bez zmian gdy
/// strategia się nie zmienia (nawet jeśli w międzyczasie zmieniono jej definicję).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StrategyChecklist {
    #[serde(default)]
    pub entry: Vec<ChecklistItem>,
    #[serde(default)]
    pub management: Vec<ChecklistItem>,
}
