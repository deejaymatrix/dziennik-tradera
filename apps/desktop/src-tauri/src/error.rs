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
