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
