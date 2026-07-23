use serde::{Deserialize, Serialize};

/// Stan jednej pozycji checklisty - dla zasad wejścia czytany jako Spełniona/Niespełniona/Nie
/// dotyczy, dla zasad zarządzania jako Wykonana/Niewykonana/Nie dotyczy (ta sama wartość,
/// frontend dobiera etykietę wg listy). Niespełniona WYMAGANA zasada nie blokuje zapisu szkicu,
/// ale finalny zapis wymaga podania powodu niespełnienia (patrz `ChecklistItem::reason`).
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
    /// Powód niespełnienia wymaganej zasady (sekcja 6.6) - obowiązkowy przy finalnym zapisie,
    /// gdy `required` i `status == Unfulfilled`. Sam warunek "final vs szkic" żyje w formularzu
    /// (backend nie zna trybu zapisu), tutaj powód jest tylko zamrażany razem z resztą migawki,
    /// żeby historyczna checklista niosła też WYJAŚNIENIE odstępstwa, nie tylko sam fakt.
    ///
    /// `#[serde(default)]`, bo transakcje zapisane przed wprowadzeniem tego pola go nie mają.
    #[serde(default)]
    pub reason: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Checklisty zapisane przed sekcją 6.6 nie mają w JSON-ie pola `reason`. Bez
    /// `#[serde(default)]` ich odczyt wywalałby się na "missing field", czyli historyczne
    /// transakcje przestałyby się otwierać - dlatego ten przypadek pilnuje test.
    #[test]
    fn czyta_historyczna_checkliste_bez_pola_reason() {
        let json = r#"{
            "entry": [
                {"rule_id": "r1", "name": "Wybicie z impetem", "required": true, "status": "unfulfilled"}
            ],
            "management": []
        }"#;

        let checklist: StrategyChecklist = serde_json::from_str(json).expect("stary format");

        assert_eq!(checklist.entry.len(), 1);
        assert_eq!(checklist.entry[0].status, ChecklistStatus::Unfulfilled);
        assert!(checklist.entry[0].required);
        assert_eq!(checklist.entry[0].reason, None);
    }

    #[test]
    fn zapisuje_i_czyta_powod_niespelnienia() {
        let json = r#"{
            "entry": [
                {"rule_id": "r1", "name": "Wybicie z impetem", "required": true,
                 "status": "unfulfilled", "reason": "Wybicie było płaskie."}
            ],
            "management": []
        }"#;

        let checklist: StrategyChecklist = serde_json::from_str(json).expect("nowy format");
        assert_eq!(
            checklist.entry[0].reason.as_deref(),
            Some("Wybicie było płaskie.")
        );

        // Zapis w drugą stronę - powód musi przetrwać rundę przez JSON, bo trafia do
        // historycznej migawki transakcji.
        let back = serde_json::to_string(&checklist).expect("serializacja");
        let again: StrategyChecklist = serde_json::from_str(&back).expect("odczyt po zapisie");
        assert_eq!(
            again.entry[0].reason.as_deref(),
            Some("Wybicie było płaskie.")
        );
    }
}
