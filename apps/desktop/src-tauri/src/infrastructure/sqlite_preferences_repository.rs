use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::Connection;

use crate::domain::preferences::{Preferences, PreferencesRepository, PREFERENCES_VERSION};
use crate::error::AppError;

/// Preferencje mieszkają w JEDNYM wierszu tabeli `app_settings` (`id = 1`, wymuszone przez CHECK
/// w migracji 0001), jako JSON obok numeru wersji schematu.
pub struct SqlitePreferencesRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqlitePreferencesRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

impl PreferencesRepository for SqlitePreferencesRepository {
    /// Odczyt NIGDY nie zawodzi z powodu treści preferencji.
    ///
    /// Wiersz z migracji 0001 zawiera JSON w zupełnie innym kształcie niż obecny model, a plik
    /// bazy mógł też zostać ręcznie uszkodzony. W obu przypadkach wracamy do wartości domyślnych,
    /// zamiast wywalać start aplikacji - specyfikacja wymaga wprost, żeby uszkodzona preferencja
    /// uruchamiała bezpieczny fallback, a nie blokowała program. Sam brak pojedynczych pól
    /// obsługuje `#[serde(default)]` na każdym z nich i nie trafia nawet do tej gałęzi.
    fn load(&self) -> Result<Preferences, AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        let raw: Option<String> = conn
            .query_row("SELECT data FROM app_settings WHERE id = 1", [], |row| {
                row.get(0)
            })
            .ok();

        let Some(raw) = raw else {
            return Ok(Preferences::default());
        };

        match serde_json::from_str::<Preferences>(&raw) {
            Ok(preferences) => Ok(preferences),
            Err(error) => {
                // Diagnostyka trafia do logu, użytkownik dostaje działającą aplikację na
                // domyślnych ustawieniach. Nie nadpisujemy tu uszkodzonego JSON-a - zrobi to
                // dopiero pierwszy świadomy zapis użytkownika, więc nic nie ginie po cichu.
                eprintln!(
                    "Nie udało się odczytać preferencji użytkownika ({error}). \
                     Zastosowano wartości domyślne."
                );
                Ok(Preferences::default())
            }
        }
    }

    fn save(&self, preferences: &Preferences) -> Result<(), AppError> {
        let data = serde_json::to_string(preferences)
            .map_err(|e| AppError::Database(format!("Nie udało się zapisać preferencji: {e}")))?;
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        conn.execute(
            "INSERT INTO app_settings (id, settings_version, data, updated_at)
             VALUES (1, ?1, ?2, ?3)
             ON CONFLICT (id) DO UPDATE SET
                settings_version = excluded.settings_version,
                data = excluded.data,
                updated_at = excluded.updated_at",
            rusqlite::params![PREFERENCES_VERSION, data, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::preferences::ThemeMode;

    fn repo_with_fresh_db() -> (SqlitePreferencesRepository, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        (
            SqlitePreferencesRepository::new(Arc::new(Mutex::new(conn))),
            dir,
        )
    }

    #[test]
    fn swieza_baza_czyta_sie_na_wartosciach_domyslnych() {
        // Migracja 0001 wstawia JSON w STARYM kształcie ("theme":"dark","accent":"gold",...),
        // którego obecny model nie rozumie. Odczyt i tak musi się udać.
        let (repo, _dir) = repo_with_fresh_db();

        let prefs = repo.load().expect("odczyt");

        assert_eq!(prefs, Preferences::default());
    }

    #[test]
    fn zapis_i_odczyt_zachowuje_ustawienia() {
        let (repo, _dir) = repo_with_fresh_db();
        let mut prefs = Preferences::default();
        prefs.appearance.theme = ThemeMode::Light;
        prefs.appearance.accent_color = "#1a2b3c".to_string();
        prefs.notifications.sound = true;

        repo.save(&prefs).expect("zapis");
        let back = repo.load().expect("odczyt");

        assert_eq!(back, prefs);
    }

    #[test]
    fn uszkodzony_json_nie_blokuje_aplikacji() {
        let (repo, _dir) = repo_with_fresh_db();
        {
            let conn = repo.conn.lock().unwrap();
            conn.execute(
                "UPDATE app_settings SET data = '{to nie jest json' WHERE id = 1",
                [],
            )
            .expect("uszkodzenie danych");
        }

        let prefs = repo.load().expect("odczyt mimo uszkodzonych danych");

        assert_eq!(prefs, Preferences::default());
    }

    #[test]
    fn zapis_podbija_wersje_schematu_preferencji() {
        let (repo, _dir) = repo_with_fresh_db();

        repo.save(&Preferences::default()).expect("zapis");

        let version: i64 = repo
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT settings_version FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("odczyt wersji");
        assert_eq!(version, PREFERENCES_VERSION);
    }
}
