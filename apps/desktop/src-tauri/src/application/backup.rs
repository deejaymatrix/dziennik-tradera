use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::domain::backup::BackupManifest;
use crate::error::AppError;
use crate::infrastructure::backup_archive;

/// Warstwa aplikacyjna kopii zapasowych: opakowuje `infrastructure::backup_archive` (I/O,
/// ZIP, SQLite Backup API) w API znane komendom Tauri, trzymając ścieżki bazy/katalogu danych
/// aplikacji, które ta warstwa zna, a infrastruktura nie musi.
pub struct BackupService {
    conn: Arc<Mutex<Connection>>,
    app_data_dir: PathBuf,
}

impl BackupService {
    pub fn new(conn: Arc<Mutex<Connection>>, app_data_dir: PathBuf) -> Self {
        Self { conn, app_data_dir }
    }

    pub fn create_backup(&self, destination: &str) -> Result<BackupManifest, AppError> {
        backup_archive::create_from_connection(
            &self.conn,
            Path::new(destination),
            env!("CARGO_PKG_VERSION"),
        )
    }

    /// Automatyczna kopia zapasowa przed nieodwracalną operacją zbiorczą (np. opróżnieniem
    /// Kosza, Faza 5) - zapisywana bez okna wyboru pliku, w tym samym katalogu co bezpieczne
    /// kopie "pre-restore" (`backup_archive::apply_pending_restore_if_present`), z analogiczną
    /// konwencją nazywania.
    pub fn create_automatic_backup(&self, label: &str) -> Result<BackupManifest, AppError> {
        let backup_dir = self.app_data_dir.join("backups");
        std::fs::create_dir_all(&backup_dir)?;
        let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
        let destination = backup_dir.join(format!("pre-{label}-{timestamp}.dtjbackup"));
        backup_archive::create_from_connection(&self.conn, &destination, env!("CARGO_PKG_VERSION"))
    }

    pub fn prepare_restore(&self, archive_path: &str) -> Result<BackupManifest, AppError> {
        backup_archive::prepare_restore(&self.app_data_dir, Path::new(archive_path))
    }
}
