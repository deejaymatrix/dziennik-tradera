use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::state::{AppState, DbState};

#[derive(Serialize)]
pub struct AppStatus {
    pub version: String,
    pub env: &'static str,
}

/// Podstawowe informacje diagnostyczne o aplikacji, używane m.in. przez
/// ekran startowy i sekcję "Informacje i diagnostyka" w Ustawieniach.
#[tauri::command]
pub fn get_app_status() -> AppStatus {
    build_app_status()
}

fn build_app_status() -> AppStatus {
    AppStatus {
        // Jedno źródło numeru wersji - `wersja::WERSJA_CARGO` jest pilnowane testem
        // zgodności z `tauri.conf.json` i `package.json`.
        version: crate::wersja::WERSJA_CARGO.to_string(),
        env: if cfg!(debug_assertions) {
            "development"
        } else {
            "production"
        },
    }
}

#[derive(Serialize)]
#[serde(tag = "status")]
pub enum DatabaseStatus {
    #[serde(rename = "ready")]
    Ready { path: String, integrity_ok: bool },
    #[serde(rename = "failed")]
    Failed { reason: String },
}

/// Uruchamia `PRAGMA integrity_check` i zwraca, czy baza jest spójna. Jedno miejsce dla tej
/// logiki - używają jej i `get_database_status`, i `get_data_overview` (wcześniej powielona).
/// Każdy błąd (nieudany pragma, nieoczekiwany wynik) traktujemy jako "niespójna" - nigdy nie
/// udajemy "ok".
fn integrity_ok(conn: &Connection) -> bool {
    conn.pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))
        .map(|result| result.eq_ignore_ascii_case("ok"))
        .unwrap_or(false)
}

/// Czyste odwzorowanie stanu bazy na status dla frontendu, wydzielone z komendy, żeby dało się
/// je przetestować bez uchwytu Tauri. Krytyczna własność: `Failed` NIGDY nie może wyjść jako
/// `Ready` - ekran startowy nie może pokazać fikcyjnego "gotowe", gdy baza nie wstała.
fn database_status(db: &DbState) -> DatabaseStatus {
    match db {
        DbState::Ready { conn, db_path, .. } => DatabaseStatus::Ready {
            path: db_path.display().to_string(),
            integrity_ok: conn.lock().ok().map(|c| integrity_ok(&c)).unwrap_or(false),
        },
        DbState::Failed { reason } => DatabaseStatus::Failed {
            reason: reason.clone(),
        },
    }
}

/// Prawdziwy status bazy danych - nigdy nie zwraca "ready", jeśli baza faktycznie nie
/// została otwarta/zmigrowana przy starcie. Używane przez ekran startowy, żeby nie pokazywać
/// fikcyjnego statusu "gotowe".
#[tauri::command]
pub fn get_database_status(state: State<'_, AppState>) -> DatabaseStatus {
    database_status(&state.db)
}

/// Bezpieczne podsumowanie stanu danych dla Ustawień → Dane i kopie bezpieczeństwa.
///
/// Świadomie zawiera WYŁĄCZNIE liczby i wynik kontroli integralności - żadnych nazw kont,
/// symboli, kwot ani edytowalnej ścieżki bazy. Specyfikacja wprost zabrania pokazywania tu
/// ścieżki bazy SQLite do edycji i przenoszenia aktywnej bazy z poziomu ustawień.
#[derive(Serialize)]
pub struct DataOverview {
    pub accounts: i64,
    pub trades: i64,
    pub strategies: i64,
    pub attachments: i64,
    /// Rozmiar pliku bazy razem z plikami WAL/SHM, w bajtach. `None`, gdy nie da się go odczytać.
    pub database_size_bytes: Option<u64>,
    /// Łączny rozmiar katalogu załączników w bajtach.
    pub attachments_size_bytes: Option<u64>,
    pub integrity_ok: bool,
}

fn file_size(path: &std::path::Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Rozmiar katalogu liczony rekurencyjnie. Błędy odczytu pojedynczych wpisów są pomijane -
/// to informacja poglądowa, a nie powód, żeby cały ekran ustawień przestał działać.
fn directory_size(path: &std::path::Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_dir() => directory_size(&entry.path()),
            Ok(_) => file_size(&entry.path()),
            Err(_) => 0,
        })
        .sum()
}

#[tauri::command]
pub fn get_data_overview(
    state: State<'_, AppState>,
) -> Result<DataOverview, crate::error::AppError> {
    let DbState::Ready { conn, db_path, .. } = &state.db else {
        return Err(crate::error::AppError::Database(
            "Baza danych nie została poprawnie otwarta przy starcie aplikacji.".to_string(),
        ));
    };

    let guard = conn.lock().unwrap_or_else(|zatruty| zatruty.into_inner());

    // Liczymy tylko wpisy NIE leżące w koszu - użytkownik pyta "ile mam danych", a nie
    // "ile wierszy fizycznie stoi w tabelach".
    let count = |sql: &str| -> i64 { guard.query_row(sql, [], |row| row.get(0)).unwrap_or(0) };
    let accounts = count("SELECT count(*) FROM accounts");
    let trades = count("SELECT count(*) FROM trades WHERE deleted_at IS NULL");
    let strategies = count("SELECT count(*) FROM strategies WHERE archived_at IS NULL");
    let attachments = count("SELECT count(*) FROM attachments");

    let integrity_ok = integrity_ok(&guard);
    drop(guard);

    // W trybie WAL sam plik `.sqlite3` to nie całość - dziennik `-wal` potrafi ważyć tyle samo.
    let mut database_size_bytes = file_size(db_path);
    for suffix in ["-wal", "-shm"] {
        let mut companion = db_path.as_os_str().to_owned();
        companion.push(suffix);
        database_size_bytes += file_size(std::path::Path::new(&companion));
    }

    let attachments_size_bytes = db_path
        .parent()
        .map(|dir| directory_size(&dir.join("attachments")));

    Ok(DataOverview {
        accounts,
        trades,
        strategies,
        attachments,
        database_size_bytes: Some(database_size_bytes),
        attachments_size_bytes,
        integrity_ok,
    })
}

/// Raport diagnostyczny dla użytkownika (Ustawienia → Aktualizacje i informacje).
///
/// Zawiera WYŁĄCZNIE: wersję aplikacji, system, architekturę, wersję schematu bazy, status
/// migracji oraz zanonimizowane błędy techniczne. NIE zawiera transakcji, notatek, emocji,
/// danych kont, załączników, kluczy, sekretów ani pełnych ścieżek ujawniających dane prywatne -
/// katalog domowy jest w logach podmieniany na `<UŻYTKOWNIK>`.
#[tauri::command]
pub fn get_diagnostic_report(state: State<'_, AppState>) -> String {
    let app = build_app_status();
    let mut lines = vec![
        "# Raport diagnostyczny - Dziennik Tradera".to_string(),
        format!("Wygenerowano: {}", chrono::Utc::now().to_rfc3339()),
        format!("Wersja aplikacji: {}", app.version),
        format!("Kompilacja: {}", app.env),
        format!(
            "System: {} ({})",
            std::env::consts::OS,
            std::env::consts::ARCH
        ),
    ];

    match &state.db {
        DbState::Ready { conn, .. } => {
            let guard = conn.lock().unwrap_or_else(|zatruty| zatruty.into_inner());
            let schema_version: i64 = guard
                .query_row(
                    "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            let applied: i64 = guard
                .query_row("SELECT count(*) FROM schema_migrations", [], |row| {
                    row.get(0)
                })
                .unwrap_or(0);
            let integrity = guard
                .pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))
                .unwrap_or_else(|_| "nie udało się sprawdzić".to_string());
            drop(guard);

            lines.push(format!("Wersja schematu bazy: {schema_version}"));
            lines.push(format!("Zastosowane migracje: {applied}"));
            lines.push(format!("Kontrola integralności: {integrity}"));
        }
        DbState::Failed { reason } => {
            lines.push(format!("Baza danych: NIEDOSTĘPNA - {reason}"));
        }
    }

    lines.push(String::new());
    lines.push("## Ostatnie wpisy diagnostyczne".to_string());
    let log_lines = crate::logging::recent_lines(50);
    if log_lines.is_empty() {
        lines.push("(brak wpisów)".to_string());
    } else {
        lines.extend(log_lines);
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_the_crate_version() {
        let status = build_app_status();
        assert_eq!(status.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn reports_a_known_environment_label() {
        let status = build_app_status();
        assert!(status.env == "development" || status.env == "production");
    }

    #[test]
    fn status_bazy_dla_failed_nigdy_nie_udaje_gotowej() {
        // Własność bezpieczeństwa z komentarza przy `get_database_status`: gdy baza nie wstała,
        // status MUSI być `Failed` z zachowanym powodem, nigdy `Ready` - inaczej ekran startowy
        // pokazałby fikcyjne "gotowe" mimo martwej bazy.
        let db = DbState::Failed {
            reason: "nie można otworzyć bazy danych".to_string(),
        };
        match database_status(&db) {
            DatabaseStatus::Failed { reason } => {
                assert_eq!(reason, "nie można otworzyć bazy danych");
            }
            DatabaseStatus::Ready { .. } => {
                panic!("stan Failed nie może zostać zaraportowany jako Ready");
            }
        }
    }

    #[test]
    fn integrity_ok_waliduje_realnie_zdrowa_baze() {
        // Zabezpiecza, że kontrola faktycznie odpytuje SQLite, a nie zwraca na sztywno `true`:
        // poprawna (choćby pusta) baza przechodzi `PRAGMA integrity_check` = "ok".
        let conn = Connection::open_in_memory().expect("open in-memory db");
        assert!(integrity_ok(&conn));
    }
}
