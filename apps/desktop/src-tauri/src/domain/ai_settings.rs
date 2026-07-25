//! Ustawienia stylu odpowiedzi Asystenta AI (Blok F, Etap 5): język i poziom szczegółowości.
//!
//! Czysta warstwa: zamienia wybór użytkownika na jedno zdanie-instrukcję doklejane na KOŃCU
//! polecenia analizy albo wiadomości systemowej czatu. Dzięki temu ma pierwszeństwo nad
//! wcześniejszymi, domyślnymi wzmiankami o języku w prompcie. Nie dotyka ani modelu, ani bazy -
//! całą logikę (mapowanie wyboru na tekst) da się przetestować bez inferencji.

/// Język, w którym model ma odpowiadać. Domyślnie polski (aplikacja jest po polsku).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JezykOdpowiedzi {
    #[default]
    Polski,
    Angielski,
}

/// Poziom szczegółowości odpowiedzi. Domyślnie standardowy - kompromis między zwięzłością a
/// rozwinięciem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SzczegolowoscOdpowiedzi {
    Zwiezle,
    #[default]
    Standardowe,
    Szczegolowe,
}

/// Zestaw ustawień stylu odpowiedzi. `#[serde(default)]` na polach sprawia, że starszy albo
/// niepełny plik ustawień nadal się wczyta (brakujące pola dostają wartość domyślną).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
pub struct UstawieniaOdpowiedziAi {
    #[serde(default)]
    pub jezyk: JezykOdpowiedzi,
    #[serde(default)]
    pub szczegolowosc: SzczegolowoscOdpowiedzi,
}

impl UstawieniaOdpowiedziAi {
    /// Jedno zdanie-instrukcja stylu (język + szczegółowość) do doklejenia na końcu polecenia.
    /// Zawsze jawne i konkretne, żeby wybór użytkownika był dla modelu jednoznaczny.
    pub fn instrukcja_stylu(&self) -> String {
        let jezyk = match self.jezyk {
            JezykOdpowiedzi::Polski => "Zawsze odpowiadaj w języku polskim.",
            JezykOdpowiedzi::Angielski => "Zawsze odpowiadaj w języku angielskim.",
        };
        let szczegolowosc = match self.szczegolowosc {
            SzczegolowoscOdpowiedzi::Zwiezle => {
                "Pisz maksymalnie zwięźle - tylko najważniejsze punkty, krótkie zdania."
            }
            SzczegolowoscOdpowiedzi::Standardowe => {
                "Zachowaj umiarkowaną długość - konkretnie, bez zbędnego rozwlekania."
            }
            SzczegolowoscOdpowiedzi::Szczegolowe => {
                "Odpowiadaj szczegółowo - rozwiń każdy punkt i dodaj kontekst, wciąż trzymając się \
                 wyłącznie podanych danych."
            }
        };
        format!("{jezyk} {szczegolowosc}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domyslnie_polski_i_standardowe() {
        let u = UstawieniaOdpowiedziAi::default();
        assert_eq!(u.jezyk, JezykOdpowiedzi::Polski);
        assert_eq!(u.szczegolowosc, SzczegolowoscOdpowiedzi::Standardowe);
    }

    #[test]
    fn instrukcja_odzwierciedla_jezyk() {
        let pl = UstawieniaOdpowiedziAi {
            jezyk: JezykOdpowiedzi::Polski,
            szczegolowosc: SzczegolowoscOdpowiedzi::Standardowe,
        };
        assert!(pl.instrukcja_stylu().contains("polskim"));
        let en = UstawieniaOdpowiedziAi {
            jezyk: JezykOdpowiedzi::Angielski,
            szczegolowosc: SzczegolowoscOdpowiedzi::Standardowe,
        };
        assert!(en.instrukcja_stylu().contains("angielskim"));
    }

    #[test]
    fn instrukcja_odzwierciedla_szczegolowosc() {
        let zwiezle = UstawieniaOdpowiedziAi {
            jezyk: JezykOdpowiedzi::Polski,
            szczegolowosc: SzczegolowoscOdpowiedzi::Zwiezle,
        };
        assert!(zwiezle
            .instrukcja_stylu()
            .to_lowercase()
            .contains("zwięźle"));
        let szczegolowe = UstawieniaOdpowiedziAi {
            jezyk: JezykOdpowiedzi::Polski,
            szczegolowosc: SzczegolowoscOdpowiedzi::Szczegolowe,
        };
        assert!(szczegolowe
            .instrukcja_stylu()
            .to_lowercase()
            .contains("szczegółowo"));
    }

    #[test]
    fn niepelny_json_wczytuje_sie_z_domyslnymi() {
        // Starszy plik bez pola `szczegolowosc` nadal musi się wczytać (pole dostaje default).
        let u: UstawieniaOdpowiedziAi =
            serde_json::from_str(r#"{"jezyk":"angielski"}"#).expect("parsowanie");
        assert_eq!(u.jezyk, JezykOdpowiedzi::Angielski);
        assert_eq!(u.szczegolowosc, SzczegolowoscOdpowiedzi::Standardowe);
    }
}
