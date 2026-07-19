use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::domain::strategy::{
    EntryRule, ManagementRule, Strategy, StrategyInput, StrategyRepository,
};
use crate::error::AppError;

pub struct SqliteStrategyRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteStrategyRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const SELECT_COLUMNS: &str =
    "id, name, description, color, entry_rules_json, management_rules_json,
     entry_rules, management_rules, exit_rules,
     tags, sort_order, created_at, updated_at, archived_at";

fn parse_tags(raw: Option<String>) -> rusqlite::Result<Vec<String>> {
    match raw {
        None => Ok(Vec::new()),
        Some(text) => serde_json::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        }),
    }
}

fn parse_rules<T: serde::de::DeserializeOwned>(raw: Option<String>) -> rusqlite::Result<Vec<T>> {
    match raw {
        None => Ok(Vec::new()),
        Some(text) => serde_json::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        }),
    }
}

fn rules_json<T: serde::Serialize>(rules: &[T]) -> String {
    serde_json::to_string(rules).unwrap_or_else(|_| "[]".to_string())
}

fn map_row(row: &Row) -> rusqlite::Result<Strategy> {
    Ok(Strategy {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        color: row.get("color")?,
        entry_rules: parse_rules::<EntryRule>(row.get("entry_rules_json")?)?,
        management_rules: parse_rules::<ManagementRule>(row.get("management_rules_json")?)?,
        legacy_entry_rules_text: row.get("entry_rules")?,
        legacy_management_rules_text: row.get("management_rules")?,
        legacy_exit_rules_text: row.get("exit_rules")?,
        tags: parse_tags(row.get("tags")?)?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

fn tags_json(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
}

impl StrategyRepository for SqliteStrategyRepository {
    fn create(&self, input: &StrategyInput) -> Result<Strategy, AppError> {
        input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let id = Uuid::now_v7().to_string();
        let now = Utc::now();
        let next_sort_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM strategies",
            [],
            |row| row.get(0),
        )?;

        tx.execute(
            "INSERT INTO strategies (
                id, name, description, color, entry_rules_json, management_rules_json,
                tags, sort_order, created_at, updated_at, archived_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, NULL)",
            rusqlite::params![
                id,
                input.name.trim(),
                input.description,
                input.color,
                rules_json(&input.entry_rules),
                rules_json(&input.management_rules),
                tags_json(&input.tags),
                next_sort_order,
                now.to_rfc3339(),
            ],
        )?;
        tx.commit()?;
        drop(conn);

        self.get(&id)
    }

    fn get(&self, id: &str) -> Result<Strategy, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let strategy = conn
            .query_row(
                &format!("SELECT {SELECT_COLUMNS} FROM strategies WHERE id = ?1"),
                [id],
                map_row,
            )
            .optional()?;
        strategy.ok_or_else(|| AppError::NotFound(format!("Nie znaleziono strategii o id {id}.")))
    }

    fn list(&self, include_archived: bool) -> Result<Vec<Strategy>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let sql = if include_archived {
            format!("SELECT {SELECT_COLUMNS} FROM strategies ORDER BY sort_order")
        } else {
            format!("SELECT {SELECT_COLUMNS} FROM strategies WHERE archived_at IS NULL ORDER BY sort_order")
        };
        let mut stmt = conn.prepare(&sql)?;
        let strategies = stmt
            .query_map([], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(strategies)
    }

    fn update(&self, id: &str, input: &StrategyInput) -> Result<Strategy, AppError> {
        input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();

        // `entry_rules`/`management_rules`/`exit_rules` (wolny tekst) celowo nie są tu
        // aktualizowane - to dane historyczne sprzed strukturalizacji zasad (sekcja "zachowaj
        // dane legacy"), nowy model czyta/zapisuje wyłącznie kolumny `*_rules_json`.
        let affected = tx.execute(
            "UPDATE strategies SET name = ?1, description = ?2, color = ?3,
                entry_rules_json = ?4, management_rules_json = ?5, tags = ?6, updated_at = ?7
             WHERE id = ?8",
            rusqlite::params![
                input.name.trim(),
                input.description,
                input.color,
                rules_json(&input.entry_rules),
                rules_json(&input.management_rules),
                tags_json(&input.tags),
                now.to_rfc3339(),
                id,
            ],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono strategii o id {id}."
            )));
        }
        tx.commit()?;
        drop(conn);

        self.get(id)
    }

    fn duplicate(&self, id: &str) -> Result<Strategy, AppError> {
        let original = self.get(id)?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let new_id = Uuid::now_v7().to_string();
        let now = Utc::now();
        let next_sort_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM strategies",
            [],
            |row| row.get(0),
        )?;

        tx.execute(
            "INSERT INTO strategies (
                id, name, description, color, entry_rules_json, management_rules_json,
                tags, sort_order, created_at, updated_at, archived_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, NULL)",
            rusqlite::params![
                new_id,
                format!("{} (kopia)", original.name),
                original.description,
                original.color,
                rules_json(&original.entry_rules),
                rules_json(&original.management_rules),
                tags_json(&original.tags),
                next_sort_order,
                now.to_rfc3339(),
            ],
        )?;
        tx.commit()?;
        drop(conn);

        self.get(&new_id)
    }

    fn archive(&self, id: &str) -> Result<Strategy, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE strategies SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnej strategii o id {id}."
            )));
        }
        self.get(id)
    }

    fn restore(&self, id: &str) -> Result<Strategy, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE strategies SET archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND archived_at IS NOT NULL",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono zarchiwizowanej strategii o id {id}."
            )));
        }
        self.get(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};

    fn repo_with_fresh_db() -> (SqliteStrategyRepository, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteStrategyRepository::new(conn), dir)
    }

    fn sample_entry_rule() -> EntryRule {
        EntryRule {
            id: "entry-1".to_string(),
            name: "Wybicie oporu".to_string(),
            description: None,
            required: true,
            archived: false,
            sort_order: 0,
        }
    }

    fn sample_input() -> StrategyInput {
        StrategyInput {
            name: "Breakout".to_string(),
            description: None,
            color: Some("#D7B45A".to_string()),
            entry_rules: vec![sample_entry_rule()],
            management_rules: vec![],
            tags: vec!["trend".to_string(), "wybicie".to_string()],
        }
    }

    #[test]
    fn starts_empty() {
        let (repo, _dir) = repo_with_fresh_db();
        assert!(repo.list(true).expect("list").is_empty());
    }

    #[test]
    fn creates_with_tags_and_entry_rules_round_tripped() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");
        assert_eq!(
            created.tags,
            vec!["trend".to_string(), "wybicie".to_string()]
        );
        assert_eq!(created.entry_rules, vec![sample_entry_rule()]);
        assert!(created.management_rules.is_empty());
        assert_eq!(created.sort_order, 0);
    }

    #[test]
    fn second_strategy_gets_next_sort_order() {
        let (repo, _dir) = repo_with_fresh_db();
        repo.create(&sample_input()).expect("create 1");
        let second = repo.create(&sample_input()).expect("create 2");
        assert_eq!(second.sort_order, 1);
    }

    #[test]
    fn update_replaces_entry_rules_without_touching_legacy_text_columns() {
        let (repo, dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");

        // Symulujemy istniejące dane legacy sprzed strukturalizacji zasad.
        let seed_conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        seed_conn
            .execute(
                "UPDATE strategies SET entry_rules = 'stary wolny tekst' WHERE id = ?1",
                [&created.id],
            )
            .expect("seed legacy text");
        drop(seed_conn);

        let mut input = sample_input();
        input.entry_rules[0].name = "Zmieniona nazwa".to_string();
        let updated = repo.update(&created.id, &input).expect("update");

        assert_eq!(updated.entry_rules[0].name, "Zmieniona nazwa");
        assert_eq!(
            updated.legacy_entry_rules_text,
            Some("stary wolny tekst".to_string())
        );
    }

    #[test]
    fn duplicate_creates_an_active_copy_with_suffix() {
        let (repo, _dir) = repo_with_fresh_db();
        let original = repo.create(&sample_input()).expect("create");
        repo.archive(&original.id).expect("archive original");

        let copy = repo.duplicate(&original.id).expect("duplicate");
        assert_eq!(copy.name, "Breakout (kopia)");
        assert!(copy.archived_at.is_none());
        assert_ne!(copy.id, original.id);
        assert_eq!(copy.entry_rules, vec![sample_entry_rule()]);
    }

    #[test]
    fn archive_then_restore_round_trip() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");
        let archived = repo.archive(&created.id).expect("archive");
        assert!(archived.archived_at.is_some());
        let restored = repo.restore(&created.id).expect("restore");
        assert!(restored.archived_at.is_none());
    }

    #[test]
    fn rejects_invalid_input_before_touching_the_database() {
        let (repo, _dir) = repo_with_fresh_db();
        let mut input = sample_input();
        input.name = "".to_string();
        assert!(matches!(repo.create(&input), Err(AppError::Validation(_))));
        assert!(repo.list(true).expect("list").is_empty());
    }
}
