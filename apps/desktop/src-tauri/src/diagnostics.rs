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
        version: env!("CARGO_PKG_VERSION").to_string(),
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

/// Prawdziwy status bazy danych - nigdy nie zwraca "ready", jeśli baza faktycznie nie
/// została otwarta/zmigrowana przy starcie. Używane przez ekran startowy, żeby nie pokazywać
/// fikcyjnego statusu "gotowe".
#[tauri::command]
pub fn get_database_status(state: State<'_, AppState>) -> DatabaseStatus {
    match &state.db {
        DbState::Ready { conn, db_path, .. } => {
            let integrity_ok = conn
                .lock()
                .ok()
                .and_then(|c| {
                    c.pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))
                        .ok()
                })
                .map(|result| result.eq_ignore_ascii_case("ok"))
                .unwrap_or(false);
            DatabaseStatus::Ready {
                path: db_path.display().to_string(),
                integrity_ok,
            }
        }
        DbState::Failed { reason } => DatabaseStatus::Failed {
            reason: reason.clone(),
        },
    }
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

    let guard = conn
        .lock()
        .expect("mutex bazy danych zatruty (poprzedni panik)");

    // Liczymy tylko wpisy NIE leżące w koszu - użytkownik pyta "ile mam danych", a nie
    // "ile wierszy fizycznie stoi w tabelach".
    let count = |sql: &str| -> i64 { guard.query_row(sql, [], |row| row.get(0)).unwrap_or(0) };
    let accounts = count("SELECT count(*) FROM accounts");
    let trades = count("SELECT count(*) FROM trades WHERE deleted_at IS NULL");
    let strategies = count("SELECT count(*) FROM strategies WHERE archived_at IS NULL");
    let attachments = count("SELECT count(*) FROM attachments");

    let integrity_ok = guard
        .pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))
        .map(|result| result.eq_ignore_ascii_case("ok"))
        .unwrap_or(false);
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
}
