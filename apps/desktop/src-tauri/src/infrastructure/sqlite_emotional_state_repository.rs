use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::domain::emotional_state::{EmotionalState, EmotionalStateRepository, NewEmotionalState};
use crate::error::AppError;

pub struct SqliteEmotionalStateRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteEmotionalStateRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const SELECT_COLUMNS: &str = "id, name, is_builtin, hidden, sort_order, created_at";

fn map_row(row: &Row) -> rusqlite::Result<EmotionalState> {
    Ok(EmotionalState {
        id: row.get("id")?,
        name: row.get("name")?,
        is_builtin: row.get::<_, i64>("is_builtin")? != 0,
        hidden: row.get::<_, i64>("hidden")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
    })
}

impl EmotionalStateRepository for SqliteEmotionalStateRepository {
    fn create(&self, input: &NewEmotionalState) -> Result<EmotionalState, AppError> {
        input.validate()?;

        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        let id = Uuid::now_v7().to_string();
        let now = Utc::now();
        let next_sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM emotional_states",
            [],
            |row| row.get(0),
        )?;

        let inserted = conn.execute(
            "INSERT INTO emotional_states (id, name, is_builtin, hidden, sort_order, created_at)
             VALUES (?1, ?2, 0, 0, ?3, ?4)",
            rusqlite::params![id, input.name.trim(), next_sort_order, now.to_rfc3339()],
        );
        if let Err(err) = inserted {
            if let rusqlite::Error::SqliteFailure(sql_err, _) = &err {
                if sql_err.code == rusqlite::ErrorCode::ConstraintViolation {
                    return Err(AppError::Validation(format!(
                        "Stan emocjonalny o nazwie \"{}\" już istnieje.",
                        input.name.trim()
                    )));
                }
            }
            return Err(err.into());
        }

        drop(conn);
        self.get(&id)
    }

    fn list(&self, include_hidden: bool) -> Result<Vec<EmotionalState>, AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        let sql = if include_hidden {
            format!("SELECT {SELECT_COLUMNS} FROM emotional_states ORDER BY sort_order")
        } else {
            format!(
                "SELECT {SELECT_COLUMNS} FROM emotional_states WHERE hidden = 0 ORDER BY sort_order"
            )
        };
        let mut stmt = conn.prepare(&sql)?;
        let states = stmt
            .query_map([], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(states)
    }

    fn set_hidden(&self, id: &str, hidden: bool) -> Result<EmotionalState, AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        let affected = conn.execute(
            "UPDATE emotional_states SET hidden = ?1 WHERE id = ?2",
            rusqlite::params![hidden as i64, id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono stanu emocjonalnego o id {id}."
            )));
        }
        drop(conn);
        self.get(id)
    }

    fn delete(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        let is_builtin: bool = conn
            .query_row(
                "SELECT is_builtin FROM emotional_states WHERE id = ?1",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .map(|v| v != 0)
            .ok_or_else(|| {
                AppError::NotFound(format!("Nie znaleziono stanu emocjonalnego o id {id}."))
            })?;
        if is_builtin {
            return Err(AppError::Validation(
                "Wbudowanych stanów emocjonalnych nie można usunąć - można je wyłącznie ukryć."
                    .to_string(),
            ));
        }
        conn.execute("DELETE FROM emotional_states WHERE id = ?1", [id])?;
        Ok(())
    }
}

impl SqliteEmotionalStateRepository {
    fn get(&self, id: &str) -> Result<EmotionalState, AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        conn.query_row(
            &format!("SELECT {SELECT_COLUMNS} FROM emotional_states WHERE id = ?1"),
            [id],
            map_row,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono stanu emocjonalnego o id {id}.")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};

    fn repo_with_fresh_db() -> (SqliteEmotionalStateRepository, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        (
            SqliteEmotionalStateRepository::new(Arc::new(Mutex::new(conn))),
            dir,
        )
    }

    #[test]
    fn seed_migration_provides_builtin_states_visible_by_default() {
        let (repo, _dir) = repo_with_fresh_db();
        let states = repo.list(false).expect("list");
        assert!(!states.is_empty());
        assert!(states.iter().all(|s| s.is_builtin && !s.hidden));
    }

    #[test]
    fn creates_a_custom_state_after_the_builtin_ones() {
        let (repo, _dir) = repo_with_fresh_db();
        let builtin_count = repo.list(true).expect("list").len();

        let created = repo
            .create(&NewEmotionalState {
                name: "Skupienie".to_string(),
            })
            .expect("create");
        assert!(!created.is_builtin);
        assert_eq!(created.sort_order, builtin_count as i64);
    }

    #[test]
    fn rejects_duplicate_name() {
        let (repo, _dir) = repo_with_fresh_db();
        repo.create(&NewEmotionalState {
            name: "Skupienie".to_string(),
        })
        .expect("first create");

        let result = repo.create(&NewEmotionalState {
            name: "Skupienie".to_string(),
        });
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn hiding_a_builtin_state_never_deletes_it() {
        let (repo, _dir) = repo_with_fresh_db();
        let visible = repo.list(false).expect("list");
        let first = &visible[0];

        let hidden = repo.set_hidden(&first.id, true).expect("hide");
        assert!(hidden.hidden);

        let still_present = repo.list(true).expect("list all");
        assert!(still_present.iter().any(|s| s.id == first.id));
        let visible_after = repo.list(false).expect("list visible");
        assert!(!visible_after.iter().any(|s| s.id == first.id));
    }

    #[test]
    fn rejects_deleting_a_builtin_state() {
        let (repo, _dir) = repo_with_fresh_db();
        let states = repo.list(true).expect("list");
        let builtin = &states[0];

        let result = repo.delete(&builtin.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn deletes_a_custom_state() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo
            .create(&NewEmotionalState {
                name: "Skupienie".to_string(),
            })
            .expect("create");

        repo.delete(&created.id).expect("delete");
        let states = repo.list(true).expect("list");
        assert!(!states.iter().any(|s| s.id == created.id));
    }
}
