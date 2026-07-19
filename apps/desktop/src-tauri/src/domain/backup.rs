use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Wersja formatu kontenera `.dtjbackup` (ZIP z `manifest.json` + kopią bazy SQLite). Zmieniać
/// tylko przy niekompatybilnej zmianie zawartości archiwum - pozwala w przyszłości rozpoznać
/// starszy format przy przywracaniu.
pub const BACKUP_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub format_version: u32,
    pub created_at: DateTime<Utc>,
    pub app_version: String,
    pub sqlite_sha256: String,
}
