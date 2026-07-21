use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::domain::attachment::{
    Attachment, AttachmentKind, AttachmentRepository, AttachmentWrite,
};
use crate::error::AppError;

pub struct SqliteAttachmentRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteAttachmentRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const SELECT_COLUMNS: &str =
    "id, trade_id, kind, file_path, url, label, sha256, size_bytes, sort_order, created_at";

fn map_row(row: &Row) -> rusqlite::Result<Attachment> {
    let kind: String = row.get("kind")?;
    Ok(Attachment {
        id: row.get("id")?,
        trade_id: row.get("trade_id")?,
        kind: AttachmentKind::from_db_str(&kind),
        file_path: row.get("file_path")?,
        url: row.get("url")?,
        label: row.get("label")?,
        sha256: row.get("sha256")?,
        size_bytes: row.get("size_bytes")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
    })
}

impl AttachmentRepository for SqliteAttachmentRepository {
    fn create(&self, input: &AttachmentWrite) -> Result<Attachment, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        let next_sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM attachments WHERE trade_id = ?1",
            [&input.trade_id],
            |row| row.get(0),
        )?;

        conn.execute(
            "INSERT INTO attachments (id, trade_id, kind, file_path, url, label, sha256, size_bytes, sort_order, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                id,
                input.trade_id,
                input.kind.as_db_str(),
                input.file_path,
                input.url,
                input.label,
                input.sha256,
                input.size_bytes,
                next_sort_order,
                now,
            ],
        )?;

        drop(conn);
        self.get(&id)
    }

    fn get(&self, id: &str) -> Result<Attachment, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        conn.query_row(
            &format!("SELECT {SELECT_COLUMNS} FROM attachments WHERE id = ?1"),
            [id],
            map_row,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono załącznika o id {id}.")))
    }

    fn list_for_trade(&self, trade_id: &str) -> Result<Vec<Attachment>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let mut stmt = conn.prepare(&format!(
            "SELECT {SELECT_COLUMNS} FROM attachments WHERE trade_id = ?1 ORDER BY sort_order"
        ))?;
        let attachments = stmt
            .query_map([trade_id], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(attachments)
    }

    fn update_label(&self, id: &str, label: Option<&str>) -> Result<Attachment, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn.execute(
            "UPDATE attachments SET label = ?1 WHERE id = ?2",
            rusqlite::params![label, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono załącznika o id {id}."
            )));
        }
        self.get(id)
    }

    fn reorder(&self, trade_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let actual_count: i64 = tx.query_row(
            "SELECT count(*) FROM attachments WHERE trade_id = ?1",
            [trade_id],
            |row| row.get(0),
        )?;
        if actual_count as usize != ordered_ids.len() {
            return Err(AppError::Validation(
                "Nowa kolejność musi obejmować wszystkie załączniki tej transakcji.".to_string(),
            ));
        }

        for (index, id) in ordered_ids.iter().enumerate() {
            let affected = tx.execute(
                "UPDATE attachments SET sort_order = ?1 WHERE id = ?2 AND trade_id = ?3",
                rusqlite::params![index as i64, id, trade_id],
            )?;
            if affected == 0 {
                return Err(AppError::Validation(format!(
                    "Załącznik o id {id} nie należy do tej transakcji."
                )));
            }
        }
        tx.commit()?;
        Ok(())
    }

    fn delete(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn.execute("DELETE FROM attachments WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono załącznika o id {id}."
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};

    fn repo_with_fresh_db() -> (
        SqliteAttachmentRepository,
        Arc<Mutex<Connection>>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteAttachmentRepository::new(conn.clone()), conn, dir)
    }

    fn seed_trade(conn_arc: &Arc<Mutex<Connection>>, trade_id: &str) {
        let conn = conn_arc.lock().expect("lock");
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
             VALUES ('acc-1', 'Konto testowe', 'USD', '1000', ?1, ?1)",
            [&now],
        )
        .expect("seed account");
        conn.execute(
            "INSERT INTO trades (id, account_id, display_number, status, side, created_at, updated_at)
             VALUES (?1, 'acc-1', 1, 'draft', 'buy', ?2, ?2)",
            rusqlite::params![trade_id, now],
        )
        .expect("seed trade");
    }

    fn screenshot_write(trade_id: &str) -> AttachmentWrite {
        AttachmentWrite {
            trade_id: trade_id.to_string(),
            kind: AttachmentKind::Screenshot,
            file_path: Some("019f0000-0000-7000-8000-000000000001.png".to_string()),
            url: None,
            label: Some("Wejście".to_string()),
            sha256: Some("abc123".to_string()),
            size_bytes: Some(1024),
        }
    }

    fn link_write(trade_id: &str) -> AttachmentWrite {
        AttachmentWrite {
            trade_id: trade_id.to_string(),
            kind: AttachmentKind::Link,
            file_path: None,
            url: Some("https://example.com/chart".to_string()),
            label: Some("TradingView".to_string()),
            sha256: None,
            size_bytes: None,
        }
    }

    #[test]
    fn creates_and_lists_attachments_in_insertion_order() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_trade(&conn, "trade-1");

        let first = repo
            .create(&screenshot_write("trade-1"))
            .expect("create screenshot");
        let second = repo.create(&link_write("trade-1")).expect("create link");

        let listed = repo.list_for_trade("trade-1").expect("list");
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].id, first.id);
        assert_eq!(listed[1].id, second.id);
        assert_eq!(listed[0].sort_order, 0);
        assert_eq!(listed[1].sort_order, 1);
        assert_eq!(listed[0].kind, AttachmentKind::Screenshot);
        assert_eq!(listed[1].kind, AttachmentKind::Link);
    }

    #[test]
    fn update_label_changes_only_the_label() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_trade(&conn, "trade-1");
        let created = repo.create(&link_write("trade-1")).expect("create");

        let updated = repo
            .update_label(&created.id, Some("Nowy opis"))
            .expect("update label");
        assert_eq!(updated.label, Some("Nowy opis".to_string()));

        let cleared = repo.update_label(&created.id, None).expect("clear label");
        assert_eq!(cleared.label, None);
    }

    #[test]
    fn reorder_rejects_a_partial_list() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_trade(&conn, "trade-1");
        let first = repo.create(&screenshot_write("trade-1")).expect("create");
        repo.create(&link_write("trade-1")).expect("create");

        let result = repo.reorder("trade-1", &[first.id]);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn reorder_updates_sort_order_for_the_trade() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_trade(&conn, "trade-1");
        let first = repo.create(&screenshot_write("trade-1")).expect("create");
        let second = repo.create(&link_write("trade-1")).expect("create");

        repo.reorder("trade-1", &[second.id.clone(), first.id.clone()])
            .expect("reorder");

        let listed = repo.list_for_trade("trade-1").expect("list");
        assert_eq!(listed[0].id, second.id);
        assert_eq!(listed[1].id, first.id);
    }

    #[test]
    fn delete_removes_the_row() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_trade(&conn, "trade-1");
        let created = repo.create(&screenshot_write("trade-1")).expect("create");

        repo.delete(&created.id).expect("delete");

        assert!(matches!(repo.get(&created.id), Err(AppError::NotFound(_))));
    }

    #[test]
    fn delete_rejects_an_unknown_id() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let result = repo.delete("nieistniejace-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}
