use std::path::{Path, PathBuf};
use std::sync::Arc;

use base64::Engine;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::domain::attachment::{
    Attachment, AttachmentKind, AttachmentRepository, AttachmentWrite, NewLinkAttachment,
    MAX_SCREENSHOT_BYTES,
};
use crate::error::AppError;

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Rozpoznaje rzeczywisty format obrazu z pierwszych bajtów pliku (magic numbers) - NIGDY z
/// rozszerzenia nazwy, żeby plik wykonywalny/inny nie mógł się przemianować na "screenshot.png"
/// i przejść walidacji. Zawiera tylko formaty realnie używane do screenshotów wykresu.
fn sniff_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.get(..8) == Some(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    if bytes.get(..3) == Some(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.get(..6) == Some(b"GIF87a") || bytes.get(..6) == Some(b"GIF89a") {
        return Some("gif");
    }
    if bytes.get(..4) == Some(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return Some("webp");
    }
    if bytes.get(..2) == Some(b"BM") {
        return Some("bmp");
    }
    None
}

fn mime_for_extension(extension: &str) -> &'static str {
    match extension {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn trim_to_none(label: Option<String>) -> Option<String> {
    label.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Warstwa aplikacyjna załączników transakcji (Faza 6): jedyne miejsce, które dotyka systemu
/// plików dla zdjęć - repozytorium (`AttachmentRepository`) zna tylko wiersze bazy. Zdjęcia są
/// kopiowane do zarządzanego katalogu `app_data_dir/attachments/` pod WŁASNĄ nazwą (UUID +
/// rozszerzenie wynikające z rozpoznanego formatu) - baza nigdy nie przechowuje ścieżki/nazwy
/// pochodzącej od użytkownika, więc nie ma możliwości path traversal przy późniejszym odczycie.
pub struct AttachmentsService {
    repository: Arc<dyn AttachmentRepository + Send + Sync>,
    app_data_dir: PathBuf,
}

impl AttachmentsService {
    pub fn new(
        repository: Arc<dyn AttachmentRepository + Send + Sync>,
        app_data_dir: PathBuf,
    ) -> Self {
        Self {
            repository,
            app_data_dir,
        }
    }

    pub fn attachments_dir(&self) -> PathBuf {
        self.app_data_dir.join("attachments")
    }

    pub fn list_for_trade(&self, trade_id: &str) -> Result<Vec<Attachment>, AppError> {
        self.repository.list_for_trade(trade_id)
    }

    /// Dodaje zdjęcie z pliku na dysku - używane przy wyborze z systemowego okna dialogowego
    /// oraz przy upuszczeniu pliku (drag&drop), bo obie ścieżki dają Tauri realną ścieżkę na
    /// dysku. Odrzuca dowiązania symboliczne u źródła (ochrona przed odczytem poza oczekiwany
    /// plik przez podstawiony link).
    pub fn add_screenshot_from_path(
        &self,
        trade_id: &str,
        source_path: &Path,
        label: Option<String>,
    ) -> Result<Attachment, AppError> {
        let metadata = std::fs::symlink_metadata(source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(AppError::Validation(
                "Odczyt z dowiązania symbolicznego nie jest dozwolony.".to_string(),
            ));
        }
        let bytes = std::fs::read(source_path)?;
        self.store_screenshot_bytes(trade_id, bytes, label)
    }

    /// Dodaje zdjęcie z surowych bajtów - używane przy wklejeniu obrazu ze schowka (frontend
    /// odczytuje Blob przez Web Clipboard API, u nas nie ma pliku źródłowego na dysku).
    pub fn add_screenshot_from_bytes(
        &self,
        trade_id: &str,
        bytes: Vec<u8>,
        label: Option<String>,
    ) -> Result<Attachment, AppError> {
        self.store_screenshot_bytes(trade_id, bytes, label)
    }

    fn store_screenshot_bytes(
        &self,
        trade_id: &str,
        bytes: Vec<u8>,
        label: Option<String>,
    ) -> Result<Attachment, AppError> {
        if bytes.len() > MAX_SCREENSHOT_BYTES {
            return Err(AppError::Validation(format!(
                "Plik jest zbyt duży ({} MB) - limit to {} MB.",
                bytes.len() / (1024 * 1024),
                MAX_SCREENSHOT_BYTES / (1024 * 1024)
            )));
        }
        let extension = sniff_image_extension(&bytes).ok_or_else(|| {
            AppError::Validation(
                "Plik nie jest rozpoznawalnym obrazem (PNG/JPEG/GIF/WEBP/BMP) - sprawdzana jest \
                 rzeczywista zawartość pliku, nie rozszerzenie nazwy."
                    .to_string(),
            )
        })?;

        let dir = self.attachments_dir();
        std::fs::create_dir_all(&dir)?;
        let filename = format!("{}.{extension}", Uuid::now_v7());
        std::fs::write(dir.join(&filename), &bytes)?;

        let write = AttachmentWrite {
            trade_id: trade_id.to_string(),
            kind: AttachmentKind::Screenshot,
            file_path: Some(filename),
            url: None,
            label: trim_to_none(label),
            sha256: Some(sha256_hex(&bytes)),
            size_bytes: Some(bytes.len() as i64),
        };
        self.repository.create(&write)
    }

    pub fn add_link(&self, mut input: NewLinkAttachment) -> Result<Attachment, AppError> {
        input.label = trim_to_none(input.label);
        input.validate()?;
        let write = AttachmentWrite {
            trade_id: input.trade_id,
            kind: AttachmentKind::Link,
            file_path: None,
            url: Some(input.url),
            label: input.label,
            sha256: None,
            size_bytes: None,
        };
        self.repository.create(&write)
    }

    pub fn update_label(&self, id: &str, label: Option<String>) -> Result<Attachment, AppError> {
        let label = trim_to_none(label);
        self.repository.update_label(id, label.as_deref())
    }

    pub fn reorder(&self, trade_id: &str, ordered_ids: Vec<String>) -> Result<(), AppError> {
        self.repository.reorder(trade_id, &ordered_ids)
    }

    /// Usuwa wiersz w bazie, a plik z dysku dopiero PO potwierdzonym sukcesie tego usunięcia -
    /// jeśli usunięcie samego pliku się nie powiedzie, wiersz i tak zostaje usunięty (osierocony
    /// plik na dysku jest do zaakceptowania, niespójność bazy nie jest).
    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        let attachment = self.repository.get(id)?;
        self.repository.delete(id)?;
        if let Some(file_path) = attachment.file_path {
            let _ = std::fs::remove_file(self.attachments_dir().join(file_path));
        }
        Ok(())
    }

    /// Usuwa pliki z zarządzanego katalogu bez dotykania bazy - używane przez `TrashService`
    /// PO potwierdzonym sukcesie trwałego usunięcia transakcji/konta (którego kaskadowe
    /// `DELETE FROM attachments` już wyczyściło wiersze bazy; tu tylko czyścimy pliki, które
    /// osierociłoby to usunięcie). Najlepszy wysiłek - błąd pojedynczego pliku nie przerywa
    /// reszty, bo baza jest już w docelowym stanie niezależnie od tego, co się stanie na dysku.
    pub fn purge_physical_files(&self, file_paths: impl IntoIterator<Item = String>) {
        let dir = self.attachments_dir();
        for file_path in file_paths {
            let _ = std::fs::remove_file(dir.join(file_path));
        }
    }

    /// Odczytuje zdjęcie i koduje je jako `data:` URI - jedyne miejsce, które ujawnia bajty
    /// zdjęcia frontendowi, więc frontend nigdy nie konstruuje ani nie widzi rzeczywistej
    /// ścieżki na dysku.
    pub fn read_screenshot_data_uri(&self, id: &str) -> Result<String, AppError> {
        let attachment = self.repository.get(id)?;
        let file_path = attachment
            .file_path
            .ok_or_else(|| AppError::Validation("Ten załącznik nie jest zdjęciem.".to_string()))?;
        let bytes = std::fs::read(self.attachments_dir().join(&file_path))?;
        let extension = file_path.rsplit('.').next().unwrap_or("");
        let mime = mime_for_extension(extension);
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(format!("data:{mime};base64,{encoded}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::sqlite_attachment_repository::SqliteAttachmentRepository;
    use chrono::Utc;
    use std::sync::Mutex;

    const PNG_BYTES: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    ];

    fn service_with_fresh_db() -> (AttachmentsService, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = crate::db::connection::open(&dir.path().join("db.sqlite3")).expect("open");
        crate::db::migrations::run_migrations(&mut conn, &dir.path().join("backups"))
            .expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        let now = Utc::now().to_rfc3339();
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
                 VALUES ('acc-1', 'Konto testowe', 'USD', '1000', ?1, ?1)",
                [&now],
            )
            .expect("seed account");
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO trades (id, account_id, display_number, status, side, created_at, updated_at)
                 VALUES ('trade-1', 'acc-1', 1, 'draft', 'buy', ?1, ?1)",
                [&now],
            )
            .expect("seed trade");
        let repository = Arc::new(SqliteAttachmentRepository::new(conn));
        let service = AttachmentsService::new(repository, dir.path().to_path_buf());
        (service, dir)
    }

    #[test]
    fn sniffs_a_real_png_regardless_of_extension() {
        assert_eq!(sniff_image_extension(PNG_BYTES), Some("png"));
    }

    #[test]
    fn rejects_a_file_that_is_not_a_known_image_format() {
        let (service, _dir) = service_with_fresh_db();
        let result = service.store_screenshot_bytes("trade-1", b"MZ this is an exe".to_vec(), None);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn rejects_a_file_larger_than_the_size_limit() {
        let (service, _dir) = service_with_fresh_db();
        let mut oversized = PNG_BYTES.to_vec();
        oversized.resize(MAX_SCREENSHOT_BYTES + 1, 0);
        let result = service.store_screenshot_bytes("trade-1", oversized, None);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn stores_a_valid_screenshot_and_reads_it_back_as_a_data_uri() {
        let (service, dir) = service_with_fresh_db();
        let created = service
            .add_screenshot_from_bytes(
                "trade-1",
                PNG_BYTES.to_vec(),
                Some("  Wejście  ".to_string()),
            )
            .expect("store screenshot");

        assert_eq!(created.label, Some("Wejście".to_string()));
        assert!(created.file_path.as_ref().unwrap().ends_with(".png"));
        assert!(dir
            .path()
            .join("attachments")
            .join(created.file_path.as_ref().unwrap())
            .exists());

        let data_uri = service
            .read_screenshot_data_uri(&created.id)
            .expect("read data uri");
        assert!(data_uri.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn add_link_trims_blank_label_to_none() {
        let (service, _dir) = service_with_fresh_db();
        let created = service
            .add_link(NewLinkAttachment {
                trade_id: "trade-1".to_string(),
                url: "https://example.com".to_string(),
                label: Some("   ".to_string()),
            })
            .expect("add link");
        assert_eq!(created.label, None);
        assert_eq!(created.kind, AttachmentKind::Link);
    }

    #[test]
    fn add_link_rejects_a_non_https_url() {
        let (service, _dir) = service_with_fresh_db();
        let result = service.add_link(NewLinkAttachment {
            trade_id: "trade-1".to_string(),
            url: "http://example.com".to_string(),
            label: None,
        });
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_both_the_row_and_the_physical_file() {
        let (service, dir) = service_with_fresh_db();
        let created = service
            .add_screenshot_from_bytes("trade-1", PNG_BYTES.to_vec(), None)
            .expect("store screenshot");
        let file_path = dir
            .path()
            .join("attachments")
            .join(created.file_path.as_ref().unwrap());
        assert!(file_path.exists());

        service.delete(&created.id).expect("delete");

        assert!(!file_path.exists());
        assert!(matches!(
            service.read_screenshot_data_uri(&created.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn add_screenshot_from_path_rejects_a_symlink_source() {
        let (service, dir) = service_with_fresh_db();
        let real_file = dir.path().join("real.png");
        std::fs::write(&real_file, PNG_BYTES).expect("write real file");
        let link_path = dir.path().join("link.png");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_file, &link_path).expect("symlink");
        #[cfg(windows)]
        let symlink_supported = std::os::windows::fs::symlink_file(&real_file, &link_path).is_ok();
        #[cfg(not(windows))]
        let symlink_supported = true;

        #[cfg(windows)]
        if !symlink_supported {
            // Tworzenie dowiązań symbolicznych na Windows wymaga uprawnień administratora/
            // Trybu dewelopera - jeśli środowisko testowe ich nie ma, nie ma czego sprawdzić.
            return;
        }

        let result = service.add_screenshot_from_path("trade-1", &link_path, None);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
