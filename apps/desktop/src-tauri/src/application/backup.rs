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

    pub fn prepare_restore(&self, archive_path: &str) -> Result<BackupManifest, AppError> {
        backup_archive::prepare_restore(&self.app_data_dir, Path::new(archive_path))
    }
}
