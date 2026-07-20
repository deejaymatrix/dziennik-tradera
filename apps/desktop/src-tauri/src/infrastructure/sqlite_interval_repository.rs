use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::domain::interval::{Interval, IntervalRepository, NewInterval};
use crate::error::AppError;

pub struct SqliteIntervalRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteIntervalRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const SELECT_COLUMNS: &str =
    "id, label, is_builtin, hidden, sort_order, created_at, updated_at, archived_at";

fn map_row(row: &Row) -> rusqlite::Result<Interval> {
    Ok(Interval {
        id: row.get("id")?,
        label: row.get("label")?,
        is_builtin: row.get::<_, i64>("is_builtin")? != 0,
        hidden: row.get::<_, i64>("hidden")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

fn constraint_violation_as_validation(err: rusqlite::Error, label: &str) -> AppError {
    if let rusqlite::Error::SqliteFailure(sql_err, _) = &err {
        if sql_err.code == rusqlite::ErrorCode::ConstraintViolation {
            return AppError::Validation(format!("Interwał o etykiecie \"{label}\" już istnieje."));
        }
    }
    err.into()
}

impl IntervalRepository for SqliteIntervalRepository {
    fn create(&self, input: &NewInterval) -> Result<Interval, AppError> {
        input.validate()?;

        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let next_sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM intervals",
            [],
            |row| row.get(0),
        )?;

        let inserted = conn.execute(
            "INSERT INTO intervals (id, label, is_builtin, hidden, sort_order, created_at, updated_at, archived_at)
             VALUES (?1, ?2, 0, 0, ?3, ?4, ?4, NULL)",
            rusqlite::params![id, input.label.trim(), next_sort_order, now],
        );
        if let Err(err) = inserted {
            return Err(constraint_violation_as_validation(err, input.label.trim()));
        }

        drop(conn);
        self.get(&id)
    }

    fn get(&self, id: &str) -> Result<Interval, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        conn.query_row(
            &format!("SELECT {SELECT_COLUMNS} FROM intervals WHERE id = ?1"),
            [id],
            map_row,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono interwału o id {id}.")))
    }

    fn list(
        &self,
        include_hidden: bool,
        include_archived: bool,
    ) -> Result<Vec<Interval>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let mut clauses = Vec::new();
        if !include_hidden {
            clauses.push("hidden = 0");
        }
        if !include_archived {
            clauses.push("archived_at IS NULL");
        }
        let sql = if clauses.is_empty() {
            format!("SELECT {SELECT_COLUMNS} FROM intervals ORDER BY sort_order")
        } else {
            format!(
                "SELECT {SELECT_COLUMNS} FROM intervals WHERE {} ORDER BY sort_order",
                clauses.join(" AND ")
            )
        };
        let mut stmt = conn.prepare(&sql)?;
        let intervals = stmt
            .query_map([], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(intervals)
    }

    fn update_label(&self, id: &str, label: &str) -> Result<Interval, AppError> {
        if label.trim().is_empty() {
            return Err(AppError::Validation(
                "Etykieta interwału nie może być pusta.".to_string(),
            ));
        }
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let is_builtin: bool = conn
            .query_row(
                "SELECT is_builtin FROM intervals WHERE id = ?1",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .map(|v| v != 0)
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono interwału o id {id}.")))?;
        if is_builtin {
            return Err(AppError::Validation(
                "Wbudowanych interwałów nie można przemianować.".to_string(),
            ));
        }
        let now = Utc::now().to_rfc3339();
        let updated = conn.execute(
            "UPDATE intervals SET label = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![label.trim(), now, id],
        );
        if let Err(err) = updated {
            return Err(constraint_violation_as_validation(err, label.trim()));
        }
        drop(conn);
        self.get(id)
    }

    fn set_hidden(&self, id: &str, hidden: bool) -> Result<Interval, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE intervals SET hidden = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![hidden as i64, now, id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono interwału o id {id}."
            )));
        }
        drop(conn);
        self.get(id)
    }

    fn archive(&self, id: &str) -> Result<Interval, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let is_builtin: bool = conn
            .query_row(
                "SELECT is_builtin FROM intervals WHERE id = ?1",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .map(|v| v != 0)
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono interwału o id {id}.")))?;
        if is_builtin {
            return Err(AppError::Validation(
                "Wbudowanych interwałów nie można archiwizować - można je wyłącznie ukryć."
                    .to_string(),
            ));
        }
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE intervals SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnego interwału o id {id}."
            )));
        }
        self.get(id)
    }

    fn restore(&self, id: &str) -> Result<Interval, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE intervals SET archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND archived_at IS NOT NULL",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono zarchiwizowanego interwału o id {id}."
            )));
        }
        self.get(id)
    }

    fn delete_permanently(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let archived_at: Option<String> = conn
            .query_row(
                "SELECT archived_at FROM intervals WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono interwału o id {id}.")))?;
        if archived_at.is_none() {
            return Err(AppError::Validation(
                "Trwale usunąć można tylko zarchiwizowany interwał - najpierw go zarchiwizuj \
                 (wbudowanych interwałów nie można archiwizować ani usuwać)."
                    .to_string(),
            ));
        }
        let affected = conn.execute("DELETE FROM intervals WHERE id = ?1", [id])?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono interwału o id {id}."
            )));
        }
        Ok(())
    }

    fn reorder(&self, ordered_ids: &[String]) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        for (index, id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE intervals SET sort_order = ?1 WHERE id = ?2",
                rusqlite::params![index as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};

    fn repo_with_fresh_db() -> (SqliteIntervalRepository, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        (
            SqliteIntervalRepository::new(Arc::new(Mutex::new(conn))),
            dir,
        )
    }

    #[test]
    fn seed_migration_provides_builtin_intervals_visible_and_active_by_default() {
        let (repo, _dir) = repo_with_fresh_db();
        let intervals = repo.list(false, false).expect("list");
        assert_eq!(intervals.len(), 6);
        assert!(intervals
            .iter()
            .all(|i| i.is_builtin && !i.hidden && i.archived_at.is_none()));
        assert_eq!(
            intervals
                .iter()
                .map(|i| i.label.as_str())
                .collect::<Vec<_>>(),
            vec!["M1", "M5", "M15", "M30", "H1", "H4"]
        );
    }

    #[test]
    fn creates_a_custom_interval_after_the_builtin_ones() {
        let (repo, _dir) = repo_with_fresh_db();
        let builtin_count = repo.list(true, true).expect("list").len();

        let created = repo
            .create(&NewInterval {
                label: "M20".to_string(),
            })
            .expect("create");
        assert!(!created.is_builtin);
        assert_eq!(created.sort_order, builtin_count as i64);
    }

    #[test]
    fn rejects_duplicate_label() {
        let (repo, _dir) = repo_with_fresh_db();
        let result = repo.create(&NewInterval {
            label: "M1".to_string(),
        });
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn hiding_a_builtin_interval_never_deletes_it() {
        let (repo, _dir) = repo_with_fresh_db();
        let visible = repo.list(false, false).expect("list");
        let first = &visible[0];

        let hidden = repo.set_hidden(&first.id, true).expect("hide");
        assert!(hidden.hidden);

        let still_present = repo.list(true, true).expect("list all");
        assert!(still_present.iter().any(|i| i.id == first.id));
        let visible_after = repo.list(false, false).expect("list visible");
        assert!(!visible_after.iter().any(|i| i.id == first.id));
    }

    #[test]
    fn rejects_archiving_a_builtin_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let intervals = repo.list(true, true).expect("list");
        let builtin = &intervals[0];

        let result = repo.archive(&builtin.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn rejects_renaming_a_builtin_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let intervals = repo.list(true, true).expect("list");
        let builtin = &intervals[0];

        let result = repo.update_label(&builtin.id, "M2");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn archive_then_restore_round_trip_for_custom_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo
            .create(&NewInterval {
                label: "M20".to_string(),
            })
            .expect("create");

        let archived = repo.archive(&created.id).expect("archive");
        assert!(archived.archived_at.is_some());
        let not_included = repo.list(true, false).expect("list without archived");
        assert!(!not_included.iter().any(|i| i.id == created.id));

        let restored = repo.restore(&created.id).expect("restore");
        assert!(restored.archived_at.is_none());
    }

    #[test]
    fn delete_permanently_rejects_a_non_archived_custom_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo
            .create(&NewInterval {
                label: "M20".to_string(),
            })
            .expect("create");

        let result = repo.delete_permanently(&created.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_permanently_rejects_a_builtin_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let intervals = repo.list(true, true).expect("list");
        let builtin = &intervals[0];

        let result = repo.delete_permanently(&builtin.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_permanently_removes_an_archived_custom_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo
            .create(&NewInterval {
                label: "M20".to_string(),
            })
            .expect("create");
        repo.archive(&created.id).expect("archive");

        repo.delete_permanently(&created.id).expect("purge");

        assert!(matches!(repo.get(&created.id), Err(AppError::NotFound(_))));
    }

    #[test]
    fn renames_a_custom_interval() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo
            .create(&NewInterval {
                label: "M20".to_string(),
            })
            .expect("create");

        let renamed = repo.update_label(&created.id, "M25").expect("rename");
        assert_eq!(renamed.label, "M25");
    }

    #[test]
    fn reorder_updates_sort_order() {
        let (repo, _dir) = repo_with_fresh_db();
        let intervals = repo.list(true, true).expect("list");
        let mut ids: Vec<String> = intervals.iter().map(|i| i.id.clone()).collect();
        ids.reverse();

        repo.reorder(&ids).expect("reorder");

        let reordered = repo.list(true, true).expect("list after reorder");
        let reordered_ids: Vec<String> = reordered.iter().map(|i| i.id.clone()).collect();
        assert_eq!(reordered_ids, ids);
    }
}
