use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use chrono::Utc;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::domain::backup::{BackupManifest, BACKUP_FORMAT_VERSION};
use crate::error::AppError;

const MANIFEST_ENTRY_NAME: &str = "manifest.json";
const SQLITE_ENTRY_NAME: &str = "dziennik.sqlite3";

/// Plik znacznikowy w katalogu danych aplikacji: obecność oznacza "przywrócenie
/// przygotowane, zastosuj przy następnym starcie" (patrz `apply_pending_restore_if_present`).
pub const PENDING_RESTORE_FILENAME: &str = "restore-pending.sqlite3";

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Spójna migawka bazy przez SQLite Backup API (nie zwykłe kopiowanie pliku - unika
/// przechwycenia bazy w trakcie zapisu) do tymczasowego pliku, którego bajty zwracamy.
fn snapshot_to_bytes(conn: &Connection) -> Result<Vec<u8>, AppError> {
    let temp = tempfile::NamedTempFile::new()?;
    {
        let mut dst = Connection::open(temp.path())?;
        let backup = rusqlite::backup::Backup::new(conn, &mut dst)?;
        backup.run_to_completion(5, Duration::from_millis(250), None)?;
    }
    Ok(std::fs::read(temp.path())?)
}

fn build_manifest(sqlite_bytes: &[u8], app_version: &str) -> BackupManifest {
    BackupManifest {
        format_version: BACKUP_FORMAT_VERSION,
        created_at: Utc::now(),
        app_version: app_version.to_string(),
        sqlite_sha256: sha256_hex(sqlite_bytes),
    }
}

fn write_archive(
    destination: &Path,
    manifest: &BackupManifest,
    sqlite_bytes: &[u8],
) -> Result<(), AppError> {
    let file = std::fs::File::create(destination)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    zip.start_file(MANIFEST_ENTRY_NAME, options)
        .map_err(|e| AppError::Io(e.to_string()))?;
    let manifest_json = serde_json::to_vec_pretty(manifest)
        .map_err(|e| AppError::Io(format!("nie można zserializować manifestu kopii: {e}")))?;
    zip.write_all(&manifest_json)?;

    zip.start_file(SQLITE_ENTRY_NAME, options)
        .map_err(|e| AppError::Io(e.to_string()))?;
    zip.write_all(sqlite_bytes)?;

    zip.finish().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(())
}

/// Tworzy kopię zapasową `.dtjbackup` z żywego, otwartego połączenia (normalny przypadek -
/// wywoływane z komendy `create_backup` przez działającą aplikację).
pub fn create_from_connection(
    conn: &Mutex<Connection>,
    destination: &Path,
    app_version: &str,
) -> Result<BackupManifest, AppError> {
    let guard = conn
        .lock()
        .expect("mutex bazy danych zatruty (poprzedni panik)");
    let sqlite_bytes = snapshot_to_bytes(&guard)?;
    drop(guard);

    let manifest = build_manifest(&sqlite_bytes, app_version);
    write_archive(destination, &manifest, &sqlite_bytes)?;
    Ok(manifest)
}

/// Tworzy kopię zapasową z pliku bazy danych bez żywego połączenia (używane jako
/// automatyczna kopia bezpieczeństwa TUŻ PRZED zastosowaniem przywrócenia przy starcie
/// aplikacji, zanim jakiekolwiek połączenie zostanie otwarte).
fn create_from_file(
    db_path: &Path,
    destination: &Path,
    app_version: &str,
) -> Result<BackupManifest, AppError> {
    let conn = Connection::open(db_path)?;
    let sqlite_bytes = snapshot_to_bytes(&conn)?;
    let manifest = build_manifest(&sqlite_bytes, app_version);
    write_archive(destination, &manifest, &sqlite_bytes)?;
    Ok(manifest)
}

fn verify_sqlite_integrity(sqlite_bytes: &[u8]) -> Result<(), AppError> {
    let temp = tempfile::NamedTempFile::new()?;
    std::fs::write(temp.path(), sqlite_bytes)?;
    let conn = Connection::open(temp.path())?;
    let result: String = conn.pragma_query_value(None, "integrity_check", |row| row.get(0))?;
    if result.to_lowercase() != "ok" {
        return Err(AppError::Validation(format!(
            "Kopia zapasowa nie przeszła kontroli integralności bazy danych: {result}"
        )));
    }
    Ok(())
}

/// Otwiera i w pełni weryfikuje archiwum `.dtjbackup` PRZED jakąkolwiek destrukcyjną
/// operacją: format archiwum, obecność wpisów, suma kontrolna SQLite z manifestu i
/// integralność samej bazy. Zwraca manifest + bajty bazy dopiero gdy wszystko się zgadza.
pub fn open_and_verify(archive_path: &Path) -> Result<(BackupManifest, Vec<u8>), AppError> {
    let file = std::fs::File::open(archive_path).map_err(|e| {
        AppError::Validation(format!("Nie można otworzyć pliku kopii zapasowej: {e}"))
    })?;
    let mut archive = ZipArchive::new(file).map_err(|_| {
        AppError::Validation(
            "Plik nie jest prawidłowym archiwum kopii zapasowej (.dtjbackup).".to_string(),
        )
    })?;

    let manifest: BackupManifest = {
        let mut entry = archive.by_name(MANIFEST_ENTRY_NAME).map_err(|_| {
            AppError::Validation(
                "Brak manifestu w kopii zapasowej - archiwum jest uszkodzone lub ma nieznany \
                 format."
                    .to_string(),
            )
        })?;
        let mut buf = String::new();
        entry
            .read_to_string(&mut buf)
            .map_err(|e| AppError::Validation(format!("Nie można odczytać manifestu: {e}")))?;
        serde_json::from_str(&buf).map_err(|e| {
            AppError::Validation(format!(
                "Manifest kopii zapasowej ma nieprawidłowy format: {e}"
            ))
        })?
    };

    let sqlite_bytes = {
        let mut entry = archive.by_name(SQLITE_ENTRY_NAME).map_err(|_| {
            AppError::Validation(
                "Brak bazy danych w kopii zapasowej - archiwum jest uszkodzone.".to_string(),
            )
        })?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| {
            AppError::Validation(format!(
                "Nie można odczytać bazy danych z kopii zapasowej: {e}"
            ))
        })?;
        buf
    };

    let actual_checksum = sha256_hex(&sqlite_bytes);
    if actual_checksum != manifest.sqlite_sha256 {
        return Err(AppError::Validation(
            "Suma kontrolna kopii zapasowej się nie zgadza - plik może być uszkodzony lub \
             zmodyfikowany po utworzeniu."
                .to_string(),
        ));
    }

    verify_sqlite_integrity(&sqlite_bytes)?;

    Ok((manifest, sqlite_bytes))
}

/// Weryfikuje archiwum i zapisuje jego zawartość jako "przywrócenie oczekujące" - samo
/// przywrócenie stosowane jest dopiero przy następnym starcie aplikacji
/// (`apply_pending_restore_if_present`), żeby nie dotykać pliku bazy, gdy jest otwarty przez
/// żywe połączenie.
pub fn prepare_restore(
    app_data_dir: &Path,
    archive_path: &Path,
) -> Result<BackupManifest, AppError> {
    let (manifest, sqlite_bytes) = open_and_verify(archive_path)?;
    let pending_path = app_data_dir.join(PENDING_RESTORE_FILENAME);
    std::fs::write(&pending_path, &sqlite_bytes)?;
    Ok(manifest)
}

/// Wywoływane przy starcie aplikacji, PRZED otwarciem połączenia do bazy. Jeśli poprzednia
/// sesja przygotowała przywrócenie, robi bezpieczną kopię aktualnej bazy, usuwa nieaktualne
/// pliki WAL/SHM i podmienia plik bazy na przywrócony. Zwraca `true`, jeśli przywrócenie
/// zostało zastosowane.
pub fn apply_pending_restore_if_present(
    app_data_dir: &Path,
    db_path: &Path,
    backup_dir: &Path,
    app_version: &str,
) -> Result<bool, AppError> {
    let pending_path = app_data_dir.join(PENDING_RESTORE_FILENAME);
    if !pending_path.exists() {
        return Ok(false);
    }

    if db_path.exists() {
        std::fs::create_dir_all(backup_dir)?;
        let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
        let safety_path = backup_dir.join(format!("pre-restore-{timestamp}.dtjbackup"));
        if let Err(err) = create_from_file(db_path, &safety_path, app_version) {
            crate::logging::log_error("backup_restore", &err);
            return Err(err);
        }
    }

    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", db_path.display()));
        if sidecar.exists() {
            std::fs::remove_file(&sidecar)?;
        }
    }

    if std::fs::rename(&pending_path, db_path).is_err() {
        std::fs::copy(&pending_path, db_path)?;
        std::fs::remove_file(&pending_path)?;
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use std::sync::Arc;

    fn make_db(dir: &Path) -> (Arc<Mutex<Connection>>, PathBuf) {
        let db_path = dir.join("db.sqlite3");
        let mut conn = connection::open(&db_path).expect("open");
        migrations::run_migrations(&mut conn, &dir.join("backups")).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
             VALUES ('acc-1', 'Konto testowe', 'USD', '1000', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("seed account");
        (Arc::new(Mutex::new(conn)), db_path)
    }

    #[test]
    fn create_then_verify_round_trip_succeeds() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (conn, _db_path) = make_db(dir.path());
        let archive_path = dir.path().join("backup.dtjbackup");

        let manifest = create_from_connection(&conn, &archive_path, "0.1.0").expect("create");
        assert_eq!(manifest.format_version, BACKUP_FORMAT_VERSION);

        let (verified_manifest, sqlite_bytes) = open_and_verify(&archive_path).expect("verify");
        assert_eq!(verified_manifest.sqlite_sha256, manifest.sqlite_sha256);
        assert!(!sqlite_bytes.is_empty());
    }

    #[test]
    fn tampered_archive_is_rejected_on_checksum_mismatch() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (conn, _db_path) = make_db(dir.path());
        let archive_path = dir.path().join("backup.dtjbackup");
        create_from_connection(&conn, &archive_path, "0.1.0").expect("create");

        // Podmieniamy zawartość bazy w archiwum, nie zmieniając manifestu - symulacja
        // uszkodzenia/modyfikacji pliku po utworzeniu kopii.
        let (manifest, mut sqlite_bytes) = {
            let file = std::fs::File::open(&archive_path).unwrap();
            let mut archive = ZipArchive::new(file).unwrap();
            let manifest: BackupManifest = {
                let mut entry = archive.by_name(MANIFEST_ENTRY_NAME).unwrap();
                let mut buf = String::new();
                entry.read_to_string(&mut buf).unwrap();
                serde_json::from_str(&buf).unwrap()
            };
            let mut entry = archive.by_name(SQLITE_ENTRY_NAME).unwrap();
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).unwrap();
            (manifest, buf)
        };
        sqlite_bytes.push(0xFF);
        let tampered_path = dir.path().join("tampered.dtjbackup");
        write_archive(&tampered_path, &manifest, &sqlite_bytes).unwrap();

        let result = open_and_verify(&tampered_path);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn not_a_zip_file_is_rejected() {
        let dir = tempfile::tempdir().expect("tempdir");
        let fake_path = dir.path().join("not-a-backup.dtjbackup");
        std::fs::write(&fake_path, b"this is not a zip file").unwrap();

        let result = open_and_verify(&fake_path);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn prepare_restore_then_apply_swaps_db_file_and_keeps_safety_backup() {
        let dir = tempfile::tempdir().expect("tempdir");
        let app_data_dir = dir.path();
        let (conn, db_path) = make_db(app_data_dir);
        let backup_dir = app_data_dir.join("backups");

        // Utwórz kopię ORYGINALNEJ bazy (z kontem "acc-1"), potem dopisz drugie konto do
        // ŻYWEJ bazy, żeby po przywróceniu dało się odróżnić stan sprzed/po.
        let archive_path = app_data_dir.join("original.dtjbackup");
        create_from_connection(&conn, &archive_path, "0.1.0").expect("create original backup");
        conn.lock().unwrap().execute(
            "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
             VALUES ('acc-2', 'Konto dodane po kopii', 'USD', '0', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z')",
            [],
        ).expect("insert second account");
        drop(conn);

        let manifest = prepare_restore(app_data_dir, &archive_path).expect("prepare restore");
        assert_eq!(manifest.format_version, BACKUP_FORMAT_VERSION);
        assert!(app_data_dir.join(PENDING_RESTORE_FILENAME).exists());

        let applied =
            apply_pending_restore_if_present(app_data_dir, &db_path, &backup_dir, "0.1.0")
                .expect("apply restore");
        assert!(applied);
        assert!(!app_data_dir.join(PENDING_RESTORE_FILENAME).exists());

        // Baza jest teraz przywróconą wersją - konto "acc-2" (dodane po kopii) nie istnieje.
        let restored_conn = connection::open(&db_path).expect("open restored db");
        let count: i64 = restored_conn
            .query_row(
                "SELECT count(*) FROM accounts WHERE id = 'acc-2'",
                [],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(count, 0);
        let original_count: i64 = restored_conn
            .query_row(
                "SELECT count(*) FROM accounts WHERE id = 'acc-1'",
                [],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(original_count, 1);

        // Kopia bezpieczeństwa "przed przywróceniem" (zawierająca acc-2) istnieje w backups/.
        let safety_backups: Vec<_> = std::fs::read_dir(&backup_dir)
            .expect("read backup dir")
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("pre-restore-"))
            .collect();
        assert_eq!(safety_backups.len(), 1);
    }

    #[test]
    fn apply_with_no_pending_restore_is_a_no_op() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (_conn, db_path) = make_db(dir.path());
        let applied = apply_pending_restore_if_present(
            dir.path(),
            &db_path,
            &dir.path().join("backups"),
            "0.1.0",
        )
        .expect("apply");
        assert!(!applied);
    }
}
