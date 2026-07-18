use std::path::{Path, PathBuf};

use rusqlite::Connection;
use sha2::{Digest, Sha256};
use thiserror::Error;

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "0001_init",
    sql: include_str!("migrations/0001_init.sql"),
}];

#[derive(Debug, Error)]
pub enum MigrationError {
    #[error("błąd bazy danych: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("migracja {version} ({name}) nie powiodła się: {source}")]
    Failed {
        version: i64,
        name: String,
        #[source]
        source: rusqlite::Error,
    },
    #[error(
        "wykryto niezgodność sumy kontrolnej już zastosowanej migracji {version} ({name}) — plik migracji zmienił się po zastosowaniu"
    )]
    ChecksumMismatch { version: i64, name: String },
    #[error("kontrola integralności bazy nie powiodła się: {0}")]
    IntegrityCheckFailed(String),
    #[error("błąd We/Wy: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug)]
pub struct MigrationReport {
    pub applied: Vec<i64>,
    pub backup_path: Option<PathBuf>,
}

/// Uruchamia wszystkie oczekujące migracje w jednej transakcji na migrację. Jeżeli baza miała
/// już zastosowane migracje (czyli to nie jest świeża instalacja), przed pierwszą oczekującą
/// migracją wykonuje pełną kopię bazy. Po migracjach sprawdza integralność bazy i klucze obce.
pub fn run_migrations(
    conn: &mut Connection,
    backup_dir: &Path,
) -> Result<MigrationReport, MigrationError> {
    run_migrations_against(conn, backup_dir, MIGRATIONS)
}

fn run_migrations_against(
    conn: &mut Connection,
    backup_dir: &Path,
    migrations: &[Migration],
) -> Result<MigrationReport, MigrationError> {
    ensure_schema_migrations_table(conn)?;

    let applied_before = read_applied(conn)?;
    verify_checksums(migrations, &applied_before)?;

    let pending: Vec<&Migration> = migrations
        .iter()
        .filter(|m| !applied_before.iter().any(|(v, _)| *v == m.version))
        .collect();

    if pending.is_empty() {
        return Ok(MigrationReport {
            applied: vec![],
            backup_path: None,
        });
    }

    let backup_path = if applied_before.is_empty() {
        None
    } else {
        Some(backup_before_migration(conn, backup_dir)?)
    };

    let mut applied = Vec::new();
    for migration in pending {
        apply_migration(conn, migration)?;
        applied.push(migration.version);
    }

    check_integrity(conn)?;

    Ok(MigrationReport {
        applied,
        backup_path,
    })
}

fn verify_checksums(
    migrations: &[Migration],
    applied: &[(i64, String)],
) -> Result<(), MigrationError> {
    for migration in migrations {
        if let Some((_, checksum)) = applied.iter().find(|(v, _)| *v == migration.version) {
            let expected = checksum_of(migration.sql);
            if &expected != checksum {
                return Err(MigrationError::ChecksumMismatch {
                    version: migration.version,
                    name: migration.name.to_string(),
                });
            }
        }
    }
    Ok(())
}

fn apply_migration(conn: &mut Connection, migration: &Migration) -> Result<(), MigrationError> {
    let tx = conn.transaction()?;
    tx.execute_batch(migration.sql)
        .map_err(|source| MigrationError::Failed {
            version: migration.version,
            name: migration.name.to_string(),
            source,
        })?;
    tx.execute(
        "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            migration.version,
            migration.name,
            checksum_of(migration.sql),
            chrono::Utc::now().to_rfc3339(),
        ],
    )?;
    tx.commit()?;
    Ok(())
}

fn backup_before_migration(
    conn: &Connection,
    backup_dir: &Path,
) -> Result<PathBuf, MigrationError> {
    std::fs::create_dir_all(backup_dir)?;
    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let backup_path = backup_dir.join(format!("pre-migration-{timestamp}.sqlite3"));
    let mut dst = Connection::open(&backup_path)?;
    let backup = rusqlite::backup::Backup::new(conn, &mut dst)?;
    backup.run_to_completion(5, std::time::Duration::from_millis(250), None)?;
    Ok(backup_path)
}

fn check_integrity(conn: &Connection) -> Result<(), MigrationError> {
    let result: String = conn.pragma_query_value(None, "integrity_check", |row| row.get(0))?;
    if result.to_lowercase() != "ok" {
        return Err(MigrationError::IntegrityCheckFailed(result));
    }

    let fk_violations: i64 =
        conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })?;
    if fk_violations > 0 {
        return Err(MigrationError::IntegrityCheckFailed(format!(
            "{fk_violations} naruszeń kluczy obcych"
        )));
    }

    Ok(())
}

fn ensure_schema_migrations_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )",
    )
}

fn read_applied(conn: &Connection) -> rusqlite::Result<Vec<(i64, String)>> {
    let mut stmt =
        conn.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

fn checksum_of(sql: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(sql.as_bytes());
    let digest = hasher.finalize();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection;

    fn table_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .expect("prepare");
        stmt.query_map([], |row| row.get::<_, String>(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect")
    }

    #[test]
    fn fresh_database_creates_all_tables_without_backup() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");

        let report = run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");

        assert_eq!(report.applied, vec![1]);
        assert!(
            report.backup_path.is_none(),
            "świeża baza nie powinna być kopiowana"
        );
        let tables = table_names(&conn);
        for expected in [
            "accounts",
            "app_settings",
            "attachments",
            "audit_log",
            "cash_operations",
            "daily_notes",
            "instruments",
            "schema_migrations",
            "strategies",
            "trade_executions",
            "trades",
        ] {
            assert!(
                tables.iter().any(|t| t == expected),
                "brak tabeli {expected}"
            );
        }
    }

    #[test]
    fn running_migrations_twice_is_idempotent() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");

        run_migrations(&mut conn, &dir.path().join("backups")).expect("first run");
        let second = run_migrations(&mut conn, &dir.path().join("backups")).expect("second run");

        assert!(second.applied.is_empty());
        assert!(second.backup_path.is_none());
    }

    #[test]
    fn upgrading_an_existing_database_takes_a_backup_of_the_prior_state() {
        let dir = tempfile::tempdir().expect("tempdir");
        let backup_dir = dir.path().join("backups");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");

        let v1_only = &MIGRATIONS[..1];
        run_migrations_against(&mut conn, &backup_dir, v1_only).expect("apply v1");

        let v1_and_v2 = [
            Migration {
                version: 1,
                name: "0001_init",
                sql: MIGRATIONS[0].sql,
            },
            Migration {
                version: 2,
                name: "test_only_extra_table",
                sql: "CREATE TABLE test_extra (id INTEGER PRIMARY KEY);",
            },
        ];
        let report = run_migrations_against(&mut conn, &backup_dir, &v1_and_v2).expect("apply v2");

        assert_eq!(report.applied, vec![2]);
        let backup_path = report.backup_path.expect("oczekiwano kopii przed migracją");
        assert!(backup_path.exists());
    }

    #[test]
    fn a_failing_migration_leaves_no_partial_state() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");

        let broken = [Migration {
            version: 1,
            name: "broken",
            sql: "CREATE TABLE ok (id INTEGER PRIMARY KEY); THIS IS NOT VALID SQL;",
        }];

        let result = run_migrations_against(&mut conn, &dir.path().join("backups"), &broken);
        assert!(matches!(
            result,
            Err(MigrationError::Failed { version: 1, .. })
        ));

        let tables = table_names(&conn);
        assert!(
            !tables.iter().any(|t| t == "ok"),
            "tabela z nieudanej migracji nie powinna zostać zapisana"
        );
        assert!(
            !tables.iter().any(|t| t == "schema_migrations")
                || read_applied(&conn).expect("read applied").is_empty(),
            "nieudana migracja nie powinna zostać oznaczona jako zastosowana"
        );
    }

    #[test]
    fn detects_checksum_drift_on_already_applied_migration() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        run_migrations(&mut conn, &dir.path().join("backups")).expect("first run");

        conn.execute(
            "UPDATE schema_migrations SET checksum = 'zepsuta' WHERE version = 1",
            [],
        )
        .expect("tamper with checksum");

        let result = run_migrations(&mut conn, &dir.path().join("backups"));
        assert!(matches!(
            result,
            Err(MigrationError::ChecksumMismatch { version: 1, .. })
        ));
    }
}
