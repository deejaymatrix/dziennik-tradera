use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Błąd przekraczający granicę IPC do frontendu. Wiadomość dla użytkownika jest zawsze
/// zrozumiała i wolna od surowych szczegółów (np. tekstu błędu SQL) — te trafiają do
/// lokalnego logu diagnostycznego przez [`crate::logging::log_error`], nie do frontendu.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("nie znaleziono: {0}")]
    NotFound(String),
    #[error("błąd bazy danych")]
    Database(String),
    #[error("błąd wejścia/wyjścia")]
    Io(String),
    #[error("konflikt wersji: {0}")]
    Conflict(String),
}

impl AppError {
    /// Błąd wejścia/wyjścia ZE ZAPISEM szczegółów do logu diagnostycznego.
    ///
    /// Komunikat pokazywany użytkownikowi obiecuje, że „szczegóły zapisano w logu
    /// diagnostycznym" - i musi to być prawda. Konwersja `From<std::io::Error>` loguje sama,
    /// ale kod tworzący `AppError::Io(...)` wprost (bo ma własny, bogatszy opis kontekstu:
    /// który wpis archiwum, który plik eksportu) omijał logowanie i obietnica stawała się
    /// pusta. Ta funkcja jest jedynym poprawnym sposobem tworzenia takiego błędu ręcznie.
    pub fn io(details: impl std::fmt::Display) -> Self {
        crate::logging::log_error("io", &details);
        AppError::Io(details.to_string())
    }

    fn code(&self) -> &'static str {
        match self {
            AppError::Validation(_) => "validation",
            AppError::NotFound(_) => "not_found",
            AppError::Database(_) => "database",
            AppError::Io(_) => "io",
            AppError::Conflict(_) => "conflict",
        }
    }

    fn user_message(&self) -> String {
        match self {
            AppError::Validation(message)
            | AppError::NotFound(message)
            | AppError::Conflict(message) => message.clone(),
            AppError::Database(_) => {
                "Wystąpił błąd bazy danych. Szczegóły zapisano w logu diagnostycznym.".to_string()
            }
            AppError::Io(_) => "Wystąpił błąd zapisu/odczytu pliku. Sprawdź uprawnienia i miejsce \
                 na dysku w wybranej lokalizacji - szczegóły zapisano w logu diagnostycznym."
                .to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.user_message())?;
        state.end()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        crate::logging::log_error("rusqlite", &err);
        AppError::Database(err.to_string())
    }
}

impl From<crate::db::migrations::MigrationError> for AppError {
    fn from(err: crate::db::migrations::MigrationError) -> Self {
        crate::logging::log_error("migrations", &err);
        AppError::Database(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        crate::logging::log_error("io", &err);
        AppError::Io(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Użytkownik nigdy nie widzi surowej treści błędu bazy ani pliku - tylko zdanie mówiące,
    /// co sprawdzić. Surowe komunikaty (ścieżki, treść SQL, kody systemowe) idą do logu.
    #[test]
    fn bledy_techniczne_nie_wyciekaja_do_uzytkownika() {
        let baza = AppError::Database("no such column: tajna_nazwa".to_string());
        let plik = AppError::Io("os error 5: access is denied".to_string());

        assert!(!baza.user_message().contains("tajna_nazwa"));
        assert!(!plik.user_message().contains("os error"));
        assert!(plik.user_message().contains("uprawnienia"));
    }

    /// Błędy, które SĄ dla użytkownika (walidacja, brak rekordu, konflikt), muszą przechodzić
    /// w całości - to one niosą konkretną informację, co poprawić.
    #[test]
    fn bledy_dla_uzytkownika_przechodza_w_calosci() {
        let tresc = "Nazwa konta nie może być pusta.";
        assert_eq!(
            AppError::Validation(tresc.to_string()).user_message(),
            tresc
        );
        assert_eq!(AppError::NotFound(tresc.to_string()).user_message(), tresc);
        assert_eq!(AppError::Conflict(tresc.to_string()).user_message(), tresc);
    }

    /// Serializacja do frontendu oddaje kod i komunikat dla użytkownika - nic więcej.
    #[test]
    fn serializacja_oddaje_kod_i_komunikat_uzytkownika() {
        let wartosc =
            serde_json::to_value(AppError::Validation("Podaj lot.".to_string())).expect("json");
        assert_eq!(wartosc["code"], "validation");
        assert_eq!(wartosc["message"], "Podaj lot.");
        assert_eq!(
            wartosc.as_object().expect("obiekt").len(),
            2,
            "do frontendu nie może trafić nic poza kodem i komunikatem"
        );
    }

    /// `AppError::io` zachowuje szczegóły w środku (idą do logu), ale na zewnątrz pokazuje
    /// zdanie z podpowiedzią - to jest właśnie ta obietnica, którą składa `user_message`.
    #[test]
    fn io_zapisuje_szczegoly_a_pokazuje_podpowiedz() {
        let blad = AppError::io("nie można zapisać pliku eksportu: os error 5");
        match &blad {
            AppError::Io(szczegoly) => assert!(szczegoly.contains("os error 5")),
            inny => panic!("oczekiwano AppError::Io, jest {inny:?}"),
        }
        assert!(!blad.user_message().contains("os error"));
    }
}
