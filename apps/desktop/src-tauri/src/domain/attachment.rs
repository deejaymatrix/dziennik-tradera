use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Rozmiar pliku obrazu dopuszczony do zapisania jako załącznik - screenshot wykresu, nie
/// zdjęcie z aparatu, więc 15 MB to duży margines bez ryzyka rozdęcia katalogu danych.
pub const MAX_SCREENSHOT_BYTES: usize = 15 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentKind {
    Screenshot,
    Link,
}

impl AttachmentKind {
    pub fn as_db_str(self) -> &'static str {
        match self {
            AttachmentKind::Screenshot => "screenshot",
            AttachmentKind::Link => "link",
        }
    }

    pub fn from_db_str(value: &str) -> Self {
        match value {
            "link" => AttachmentKind::Link,
            _ => AttachmentKind::Screenshot,
        }
    }
}

/// Jeden załącznik transakcji - zdjęcie wykresu (plik skopiowany do zarządzanego katalogu,
/// `file_path` to WYŁĄCZNIE nazwa wygenerowana przez `AttachmentsService`, nigdy ścieżka/nazwa
/// pochodząca od użytkownika - patrz uzasadnienie ochrony przed path traversal w tym module)
/// albo link (tylko `https://`, otwierany w zewnętrznej przeglądarce po świadomej akcji w UI).
#[derive(Debug, Clone, Serialize)]
pub struct Attachment {
    pub id: String,
    pub trade_id: String,
    pub kind: AttachmentKind,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub label: Option<String>,
    pub sha256: Option<String>,
    pub size_bytes: Option<i64>,
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
}

/// Dane gotowe do zapisu przez repozytorium - wszystkie pola już rozwiązane przez warstwę
/// aplikacyjną (plik już skopiowany/zahashowany, adres już zwalidowany). Repozytorium nie robi
/// żadnego I/O na plikach, tylko zapisuje wiersz.
#[derive(Debug, Clone)]
pub struct AttachmentWrite {
    pub trade_id: String,
    pub kind: AttachmentKind,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub label: Option<String>,
    pub sha256: Option<String>,
    pub size_bytes: Option<i64>,
}

pub trait AttachmentRepository {
    fn create(&self, input: &AttachmentWrite) -> Result<Attachment, AppError>;
    fn get(&self, id: &str) -> Result<Attachment, AppError>;
    /// Zwraca załączniki jednej transakcji, uporządkowane po `sort_order`.
    fn list_for_trade(&self, trade_id: &str) -> Result<Vec<Attachment>, AppError>;
    /// Nazwy plików WSZYSTKICH zdjęć należących do transakcji danego konta - JEDNYM zapytaniem.
    ///
    /// Istnieje wyłącznie po to, żeby trwałe usunięcie konta nie odpytywało bazy osobno o każdą
    /// jego transakcję. Przy koncie z tysiącami transakcji tamto podejście zajmowało dziesiątki
    /// sekund i wyglądało jak zawieszenie aplikacji.
    fn file_paths_for_account(&self, account_id: &str) -> Result<Vec<String>, AppError>;
    fn update_label(&self, id: &str, label: Option<&str>) -> Result<Attachment, AppError>;
    /// Nadpisuje `sort_order` wszystkich podanych id kolejnością ich wystąpienia na liście -
    /// musi obejmować WSZYSTKIE załączniki danej transakcji (patrz walidacja w `AttachmentsService`).
    fn reorder(&self, trade_id: &str, ordered_ids: &[String]) -> Result<(), AppError>;
    /// Trwałe, natychmiastowe usunięcie wiersza (załączniki nie mają własnego Kosza - patrz
    /// uzasadnienie w PROGRESS.md, Faza 6). Nie usuwa pliku z dysku - o to musi zadbać
    /// wywołujący (`AttachmentsService`) PO powodzeniu tego wywołania.
    fn delete(&self, id: &str) -> Result<(), AppError>;
}

/// Waliduje, że adres linku jest bezpieczny do zapisania i późniejszego otwarcia w zewnętrznej
/// przeglądarce - wyłącznie `https://` (bez `http://`, `javascript:`, `data:`, itd.), bez białych
/// znaków/znaków kontrolnych, z niepustą częścią po schemacie. Celowo nie parsuje pełnego RFC
/// 3986 (żadna nowa zależność) - to jest bezpieczny, wystarczający filtr dla "otwórz w
/// przeglądarce", nie ogólny walidator URL.
pub fn is_valid_https_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed != raw {
        return false;
    }
    if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    let Some(rest) = trimmed
        .get(..8)
        .filter(|prefix| prefix.eq_ignore_ascii_case("https://"))
        .map(|_| &trimmed[8..])
    else {
        return false;
    };
    !rest.is_empty()
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewLinkAttachment {
    pub trade_id: String,
    pub url: String,
    pub label: Option<String>,
}

impl NewLinkAttachment {
    pub fn validate(&self) -> Result<(), AppError> {
        if !is_valid_https_url(&self.url) {
            return Err(AppError::Validation(
                "Link musi być prawidłowym adresem zaczynającym się od https://.".to_string(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_plain_https_url() {
        assert!(is_valid_https_url("https://example.com/chart"));
    }

    #[test]
    fn accepts_https_with_mixed_case_scheme() {
        assert!(is_valid_https_url("HTTPS://example.com"));
    }

    #[test]
    fn rejects_http() {
        assert!(!is_valid_https_url("http://example.com"));
    }

    #[test]
    fn rejects_javascript_scheme() {
        assert!(!is_valid_https_url("javascript:alert(1)"));
    }

    #[test]
    fn rejects_data_scheme() {
        assert!(!is_valid_https_url("data:text/html,<script>1</script>"));
    }

    #[test]
    fn rejects_bare_scheme_with_nothing_after() {
        assert!(!is_valid_https_url("https://"));
    }

    #[test]
    fn rejects_leading_or_trailing_whitespace() {
        assert!(!is_valid_https_url(" https://example.com"));
        assert!(!is_valid_https_url("https://example.com "));
    }

    #[test]
    fn rejects_embedded_whitespace() {
        assert!(!is_valid_https_url("https://example.com/a b"));
    }

    #[test]
    fn new_link_attachment_validate_rejects_bad_url() {
        let input = NewLinkAttachment {
            trade_id: "trade-1".to_string(),
            url: "ftp://example.com".to_string(),
            label: None,
        };
        assert!(input.validate().is_err());
    }

    #[test]
    fn new_link_attachment_validate_accepts_good_url() {
        let input = NewLinkAttachment {
            trade_id: "trade-1".to_string(),
            url: "https://example.com".to_string(),
            label: Some("Wykres na TradingView".to_string()),
        };
        assert!(input.validate().is_ok());
    }
}
