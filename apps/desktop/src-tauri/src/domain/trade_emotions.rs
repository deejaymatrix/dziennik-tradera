use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Dane emocjonalne dla jednego z trzech momentów transakcji - wielokrotny wybór stanu +
/// natężenie 1-5 + notatka, z jawną flagą "nie uzupełniono" odróżniającą świadomy brak danych
/// od zwykłego pustego formularza (sekcja "Emocje w 3 momentach"). Gdy `not_filled` jest
/// prawdą, pozostałe pola powinny być puste - wymuszane po stronie frontendu, nie tutaj (samo
/// `not_filled=true` z niepustymi polami nie jest błędem walidacji, tylko niespójnym stanem UI).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct MomentEmotion {
    #[serde(default)]
    pub state_ids: Vec<String>,
    pub intensity: Option<i64>,
    pub note: Option<String>,
    #[serde(default)]
    pub not_filled: bool,
}

impl MomentEmotion {
    fn validate(&self, label: &str) -> Result<(), AppError> {
        if let Some(intensity) = self.intensity {
            if !(1..=5).contains(&intensity) {
                return Err(AppError::Validation(format!(
                    "Natężenie emocji ({label}) musi być liczbą od 1 do 5."
                )));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct TradeEmotions {
    #[serde(default)]
    pub before: MomentEmotion,
    #[serde(default)]
    pub during: MomentEmotion,
    #[serde(default)]
    pub after: MomentEmotion,
}

impl TradeEmotions {
    pub fn validate(&self) -> Result<(), AppError> {
        self.before.validate("przed transakcją")?;
        self.during.validate("w trakcie transakcji")?;
        self.after.validate("po transakcji")?;
        Ok(())
    }

    /// Zwięzłe podsumowanie do dziennika zmian (sekcja "Tryb odczytu i przycisk Edytuj") -
    /// pełny zrzut JSON byłby nieczytelny w liście zmian, więc log dostaje tylko listę
    /// uzupełnionych momentów.
    pub fn summary(&self) -> Option<String> {
        let filled: Vec<&str> = [
            ("przed", &self.before),
            ("w trakcie", &self.during),
            ("po", &self.after),
        ]
        .into_iter()
        .filter(|(_, moment)| !moment.not_filled)
        .map(|(label, _)| label)
        .collect();
        if filled.is_empty() {
            None
        } else {
            Some(format!("uzupełnione: {}", filled.join(", ")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_out_of_range_intensity() {
        let emotions = TradeEmotions {
            before: MomentEmotion {
                intensity: Some(6),
                ..Default::default()
            },
            ..Default::default()
        };
        assert!(emotions.validate().is_err());
    }

    #[test]
    fn accepts_intensity_within_range() {
        let emotions = TradeEmotions {
            during: MomentEmotion {
                state_ids: vec!["state-1".to_string()],
                intensity: Some(3),
                note: Some("Trzymałem się planu.".to_string()),
                not_filled: false,
            },
            ..Default::default()
        };
        assert!(emotions.validate().is_ok());
    }

    #[test]
    fn summary_lists_only_filled_moments() {
        let emotions = TradeEmotions {
            before: MomentEmotion {
                not_filled: false,
                ..Default::default()
            },
            during: MomentEmotion {
                not_filled: true,
                ..Default::default()
            },
            after: MomentEmotion {
                not_filled: false,
                ..Default::default()
            },
        };
        assert_eq!(
            emotions.summary(),
            Some("uzupełnione: przed, po".to_string())
        );
    }

    #[test]
    fn summary_is_none_when_nothing_filled() {
        let emotions = TradeEmotions {
            before: MomentEmotion {
                not_filled: true,
                ..Default::default()
            },
            during: MomentEmotion {
                not_filled: true,
                ..Default::default()
            },
            after: MomentEmotion {
                not_filled: true,
                ..Default::default()
            },
        };
        assert_eq!(emotions.summary(), None);
    }
}
