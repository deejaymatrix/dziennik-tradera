use serde::de::{Deserializer, Error as _};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Jedna emocja przypisana do transakcji: identyfikator stanu emocjonalnego + natężenie 1-5
/// (skala występowania tej emocji, sekcja 6.8). Emocje dodaje się pojedynczo, dowolnie wiele -
/// każda osobno, z własną skalą. Brak emocji = brak wpisu; nie ma żadnej flagi "nie uzupełniono".
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct EmotionEntry {
    pub state_id: String,
    /// Natężenie 1-5 (`Słaba`..`Bardzo silna`). `None`, dopóki użytkownik nie wybierze na skali.
    pub intensity: Option<i64>,
}

/// Emocje transakcji jako płaska lista wpisów (sekcja 6.8). Pusta lista = brak danych.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct TradeEmotions {
    pub entries: Vec<EmotionEntry>,
}

impl TradeEmotions {
    pub fn validate(&self) -> Result<(), AppError> {
        for entry in &self.entries {
            if let Some(intensity) = entry.intensity {
                if !(1..=5).contains(&intensity) {
                    return Err(AppError::Validation(
                        "Natężenie emocji musi być liczbą od 1 do 5.".to_string(),
                    ));
                }
            }
        }
        Ok(())
    }

    /// Zwięzłe podsumowanie do dziennika zmian - liczba wybranych emocji zamiast pełnego JSON-a.
    pub fn summary(&self) -> Option<String> {
        if self.entries.is_empty() {
            None
        } else {
            Some(format!("{} wybranych emocji", self.entries.len()))
        }
    }
}

/// Stary moment z 3-momentowego zapisu emocji - czytany wyłącznie po to, żeby historyczne
/// transakcje dały się spłaszczyć do nowego modelu bez utraty danych. Nie jest już zapisywany.
#[derive(Deserialize, Default)]
struct LegacyMoment {
    #[serde(default)]
    state_ids: Vec<String>,
    #[serde(default)]
    intensity: Option<i64>,
}

#[derive(Deserialize)]
struct LegacyEmotions {
    #[serde(default)]
    before: LegacyMoment,
    #[serde(default)]
    during: LegacyMoment,
    #[serde(default)]
    after: LegacyMoment,
}

/// Nowy kształt zapisu - to, co przychodzi z aktualnego formularza.
#[derive(Deserialize)]
struct NewEmotions {
    #[serde(default)]
    entries: Vec<EmotionEntry>,
}

impl<'de> Deserialize<'de> for TradeEmotions {
    /// Czyta OBA formaty: nowy (`{ entries: [...] }`) oraz stary 3-momentowy
    /// (`{ before, during, after }`). Stary jest spłaszczany - każdy identyfikator stanu z
    /// każdego momentu staje się osobnym wpisem, z natężeniem tego momentu, bez powtórzeń.
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;

        if value.get("entries").is_some() {
            let parsed: NewEmotions = serde_json::from_value(value).map_err(D::Error::custom)?;
            return Ok(TradeEmotions {
                entries: parsed.entries,
            });
        }

        let legacy: LegacyEmotions = serde_json::from_value(value).map_err(D::Error::custom)?;
        let mut entries: Vec<EmotionEntry> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for moment in [legacy.before, legacy.during, legacy.after] {
            for state_id in moment.state_ids {
                if seen.insert(state_id.clone()) {
                    entries.push(EmotionEntry {
                        state_id,
                        intensity: moment.intensity,
                    });
                }
            }
        }
        Ok(TradeEmotions { entries })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_out_of_range_intensity() {
        let emotions = TradeEmotions {
            entries: vec![EmotionEntry {
                state_id: "s1".to_string(),
                intensity: Some(6),
            }],
        };
        assert!(emotions.validate().is_err());
    }

    #[test]
    fn accepts_intensity_within_range() {
        let emotions = TradeEmotions {
            entries: vec![EmotionEntry {
                state_id: "s1".to_string(),
                intensity: Some(3),
            }],
        };
        assert!(emotions.validate().is_ok());
    }

    #[test]
    fn empty_list_has_no_summary() {
        assert_eq!(TradeEmotions::default().summary(), None);
    }

    #[test]
    fn summary_counts_entries() {
        let emotions = TradeEmotions {
            entries: vec![
                EmotionEntry {
                    state_id: "s1".to_string(),
                    intensity: Some(2),
                },
                EmotionEntry {
                    state_id: "s2".to_string(),
                    intensity: None,
                },
            ],
        };
        assert_eq!(emotions.summary(), Some("2 wybranych emocji".to_string()));
    }

    #[test]
    fn reads_the_new_flat_format() {
        let json = r#"{"entries":[{"state_id":"s1","intensity":4}]}"#;
        let emotions: TradeEmotions = serde_json::from_str(json).unwrap();
        assert_eq!(emotions.entries.len(), 1);
        assert_eq!(emotions.entries[0].state_id, "s1");
        assert_eq!(emotions.entries[0].intensity, Some(4));
    }

    /// Historyczne transakcje w starym 3-momentowym formacie muszą dać się odczytać - spłaszczamy
    /// je do płaskiej listy bez utraty identyfikatorów ani natężeń.
    #[test]
    fn reads_and_flattens_the_legacy_three_moment_format() {
        let json = r#"{
            "before": {"state_ids":["calm"],"intensity":2,"not_filled":false},
            "during": {"state_ids":["fomo","calm"],"intensity":5,"not_filled":false},
            "after": {"state_ids":[],"intensity":null,"not_filled":true}
        }"#;
        let emotions: TradeEmotions = serde_json::from_str(json).unwrap();
        assert_eq!(emotions.entries.len(), 2);
        assert_eq!(emotions.entries[0].state_id, "calm");
        assert_eq!(emotions.entries[0].intensity, Some(2));
        assert_eq!(emotions.entries[1].state_id, "fomo");
        assert_eq!(emotions.entries[1].intensity, Some(5));
    }

    #[test]
    fn empty_object_is_no_emotions() {
        let emotions: TradeEmotions = serde_json::from_str("{}").unwrap();
        assert!(emotions.entries.is_empty());
    }
}
