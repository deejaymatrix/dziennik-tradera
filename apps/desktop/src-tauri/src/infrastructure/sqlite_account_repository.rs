use std::str::FromStr;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension, Row};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::domain::account::{Account, AccountRepository, NewAccount, UpdateAccount};
use crate::error::AppError;

pub struct SqliteAccountRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteAccountRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

fn parse_decimal(row: &Row, idx: &str) -> rusqlite::Result<Decimal> {
    let raw: String = row.get(idx)?;
    Decimal::from_str(&raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}

fn map_row(row: &Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        account_type: row.get("account_type")?,
        currency: row.get("currency")?,
        initial_balance: parse_decimal(row, "initial_balance")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

const SELECT_COLUMNS: &str =
    "id, name, description, account_type, currency, initial_balance, created_at, updated_at, archived_at";

fn write_audit_log(
    conn: &rusqlite::Connection,
    entity_id: &str,
    action: &str,
    now: DateTime<Utc>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, detail) VALUES (?1, 'account', ?2, ?3, ?4, NULL)",
        rusqlite::params![Uuid::now_v7().to_string(), entity_id, action, now.to_rfc3339()],
    )?;
    Ok(())
}

impl AccountRepository for SqliteAccountRepository {
    fn create(&self, input: &NewAccount) -> Result<Account, AppError> {
        input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let id = Uuid::now_v7().to_string();
        let now = Utc::now();

        tx.execute(
            "INSERT INTO accounts (id, name, description, account_type, currency, initial_balance, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, NULL)",
            rusqlite::params![
                id,
                input.name.trim(),
                input.description,
                input.account_type,
                input.currency,
                input.initial_balance.to_string(),
                now.to_rfc3339(),
            ],
        )?;
        write_audit_log(&tx, &id, "account.created", now)?;
        tx.commit()?;
        drop(conn);

        self.get(&id)
    }

    fn get(&self, id: &str) -> Result<Account, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let account = conn
            .query_row(
                &format!("SELECT {SELECT_COLUMNS} FROM accounts WHERE id = ?1"),
                [id],
                map_row,
            )
            .optional()?;
        account.ok_or_else(|| AppError::NotFound(format!("Nie znaleziono konta o id {id}.")))
    }

    fn list(&self, include_archived: bool) -> Result<Vec<Account>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let sql = if include_archived {
            format!("SELECT {SELECT_COLUMNS} FROM accounts ORDER BY created_at")
        } else {
            format!("SELECT {SELECT_COLUMNS} FROM accounts WHERE archived_at IS NULL ORDER BY created_at")
        };
        let mut stmt = conn.prepare(&sql)?;
        let accounts = stmt
            .query_map([], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(accounts)
    }

    fn update(&self, id: &str, input: &UpdateAccount) -> Result<Account, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();

        let existing_currency: String = tx
            .query_row(
                "SELECT currency FROM accounts WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound(format!("Nie znaleziono konta o id {id}.")))?;
        input.validate_with_existing_currency(&existing_currency)?;

        let affected = tx.execute(
            "UPDATE accounts SET name = ?1, description = ?2, account_type = ?3, currency = ?4, updated_at = ?5 WHERE id = ?6",
            rusqlite::params![input.name.trim(), input.description, input.account_type, input.currency, now.to_rfc3339(), id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono konta o id {id}."
            )));
        }
        write_audit_log(&tx, id, "account.updated", now)?;
        tx.commit()?;
        drop(conn);

        self.get(id)
    }

    fn archive(&self, id: &str) -> Result<Account, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();

        let affected = tx.execute(
            "UPDATE accounts SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
            rusqlite::params![now.to_rfc3339(), id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnego konta o id {id}."
            )));
        }
        write_audit_log(&tx, id, "account.archived", now)?;
        tx.commit()?;
        drop(conn);

        self.get(id)
    }

    fn restore(&self, id: &str) -> Result<Account, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();

        let affected = tx.execute(
            "UPDATE accounts SET archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND archived_at IS NOT NULL",
            rusqlite::params![now.to_rfc3339(), id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono zarchiwizowanego konta o id {id}."
            )));
        }
        write_audit_log(&tx, id, "account.restored", now)?;
        tx.commit()?;
        drop(conn);

        self.get(id)
    }

    fn delete_permanently(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let archived_at: Option<String> = tx
            .query_row(
                "SELECT archived_at FROM accounts WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono konta o id {id}.")))?;
        if archived_at.is_none() {
            return Err(AppError::Validation(
                "Trwale usunąć można tylko zarchiwizowane konto - najpierw je zarchiwizuj."
                    .to_string(),
            ));
        }

        tx.execute(
            "DELETE FROM attachments WHERE trade_id IN (SELECT id FROM trades WHERE account_id = ?1)",
            [id],
        )?;
        tx.execute(
            "DELETE FROM trade_executions WHERE trade_id IN (SELECT id FROM trades WHERE account_id = ?1)",
            [id],
        )?;
        tx.execute("DELETE FROM trades WHERE account_id = ?1", [id])?;
        tx.execute("DELETE FROM cash_operations WHERE account_id = ?1", [id])?;
        let affected = tx.execute("DELETE FROM accounts WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono konta o id {id}."
            )));
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use rust_decimal_macros::dec;

    fn repo_with_fresh_db() -> (
        SqliteAccountRepository,
        Arc<Mutex<Connection>>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteAccountRepository::new(conn.clone()), conn, dir)
    }

    fn sample_input() -> NewAccount {
        NewAccount {
            name: "Konto demo".to_string(),
            description: Some("Rachunek testowy".to_string()),
            account_type: Some("demo".to_string()),
            currency: "USD".to_string(),
            initial_balance: dec!(10000),
        }
    }

    #[test]
    fn creates_and_fetches_an_account() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");

        assert_eq!(created.name, "Konto demo");
        assert_eq!(created.initial_balance, dec!(10000));
        assert!(created.archived_at.is_none());

        let fetched = repo.get(&created.id).expect("get");
        assert_eq!(fetched.id, created.id);
    }

    #[test]
    fn rejects_invalid_input_before_touching_the_database() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let mut input = sample_input();
        input.name = "".to_string();

        let result = repo.create(&input);
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(repo.list(true).expect("list").is_empty());
    }

    #[test]
    fn list_excludes_archived_accounts_by_default() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");
        repo.archive(&created.id).expect("archive");

        assert!(repo.list(false).expect("list active").is_empty());
        assert_eq!(repo.list(true).expect("list all").len(), 1);
    }

    #[test]
    fn archive_then_restore_round_trip() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");

        let archived = repo.archive(&created.id).expect("archive");
        assert!(archived.archived_at.is_some());

        let restored = repo.restore(&created.id).expect("restore");
        assert!(restored.archived_at.is_none());
    }

    #[test]
    fn archiving_an_already_archived_account_is_rejected() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");
        repo.archive(&created.id).expect("first archive");

        let result = repo.archive(&created.id);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn delete_permanently_rejects_a_non_archived_account() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");

        let result = repo.delete_permanently(&created.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(repo.list(true).expect("list").len(), 1);
    }

    #[test]
    fn delete_permanently_rejects_an_unknown_account() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let result = repo.delete_permanently("nieistniejace-id");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    fn insert_trade_for_account(conn_arc: &Arc<Mutex<Connection>>, account_id: &str) -> String {
        let conn = conn_arc.lock().expect("lock");
        let id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO trades (id, account_id, display_number, status, side, created_at, updated_at)
             VALUES (?1, ?2, 1, 'draft', 'buy', ?3, ?3)",
            rusqlite::params![id, account_id, now],
        )
        .expect("insert trade");
        conn.execute(
            "INSERT INTO trade_executions (id, trade_id, kind, price, volume, executed_at, created_at)
             VALUES (?1, ?2, 'entry', '1', '1', ?3, ?3)",
            rusqlite::params![Uuid::now_v7().to_string(), id, now],
        )
        .expect("insert trade execution");
        id
    }

    #[test]
    fn delete_permanently_removes_an_archived_account_with_its_trades_and_executions() {
        let (repo, conn_arc, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input()).expect("create");
        let trade_id = insert_trade_for_account(&conn_arc, &created.id);
        repo.archive(&created.id).expect("archive");

        repo.delete_permanently(&created.id).expect("purge");

        assert!(matches!(repo.get(&created.id), Err(AppError::NotFound(_))));
        let conn = conn_arc.lock().expect("lock");
        let trade_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM trades WHERE id = ?1",
                [&trade_id],
                |row| row.get(0),
            )
            .expect("count trades");
        assert_eq!(trade_count, 0);
        let execution_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM trade_executions WHERE trade_id = ?1",
                [&trade_id],
                |row| row.get(0),
            )
            .expect("count executions");
        assert_eq!(execution_count, 0);
    }

    #[test]
    fn update_requires_an_existing_account() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let update = UpdateAccount {
            name: "Nowa nazwa".to_string(),
            description: None,
            account_type: None,
            currency: "EUR".to_string(),
        };

        let result = repo.update("nieistniejace-id", &update);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    fn insert_account_with_legacy_currency(
        conn_arc: &Arc<Mutex<Connection>>,
        currency: &str,
    ) -> String {
        let mut conn = conn_arc.lock().expect("lock");
        let tx = conn.transaction().expect("begin tx");
        let id = Uuid::now_v7().to_string();
        let now = Utc::now();
        tx.execute(
            "INSERT INTO accounts (id, name, description, account_type, currency, initial_balance, created_at, updated_at, archived_at)
             VALUES (?1, 'Konto sprzed migracji', NULL, NULL, ?2, '100', ?3, ?3, NULL)",
            rusqlite::params![id, currency, now.to_rfc3339()],
        )
        .expect("insert legacy account");
        tx.commit().expect("commit");
        id
    }

    #[test]
    fn update_preserves_unchanged_legacy_currency_without_forcing_migration() {
        let (repo, conn_arc, _dir) = repo_with_fresh_db();
        let id = insert_account_with_legacy_currency(&conn_arc, "PLN");

        let update = UpdateAccount {
            name: "Nowa nazwa".to_string(),
            description: None,
            account_type: None,
            currency: "PLN".to_string(),
        };
        let updated = repo
            .update(&id, &update)
            .expect("update should not force a currency migration");
        assert_eq!(updated.currency, "PLN");
        assert_eq!(updated.name, "Nowa nazwa");
    }

    #[test]
    fn update_rejects_changing_legacy_currency_to_another_unsupported_one() {
        let (repo, conn_arc, _dir) = repo_with_fresh_db();
        let id = insert_account_with_legacy_currency(&conn_arc, "PLN");

        let update = UpdateAccount {
            name: "Nowa nazwa".to_string(),
            description: None,
            account_type: None,
            currency: "CHF".to_string(),
        };
        let result = repo.update(&id, &update);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn a_failed_write_leaves_no_partial_account_row() {
        // Symulujemy przerwaną operację: audit_log ma CHECK/NOT NULL na action, więc wstawienie
        // złego wiersza w tej samej transakcji co utworzenie konta powinno cofnąć również insert
        // do accounts - potwierdzając atomowość zapisu.
        let (repo, conn_arc, _dir) = repo_with_fresh_db();

        {
            let mut conn = conn_arc.lock().expect("lock");
            let tx = conn.transaction().expect("begin tx");
            let id = Uuid::now_v7().to_string();
            let now = Utc::now();
            tx.execute(
                "INSERT INTO accounts (id, name, description, account_type, currency, initial_balance, created_at, updated_at, archived_at)
                 VALUES (?1, 'Nieudane konto', NULL, NULL, 'USD', '100', ?2, ?2, NULL)",
                rusqlite::params![id, now.to_rfc3339()],
            )
            .expect("insert account");

            // action = NULL narusza NOT NULL na audit_log.action - to musi zwrócić błąd.
            let audit_result = tx.execute(
                "INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, detail) VALUES (?1, 'account', ?2, NULL, ?3, NULL)",
                rusqlite::params![Uuid::now_v7().to_string(), id, now.to_rfc3339()],
            );
            assert!(audit_result.is_err());
            // tx jest upuszczany bez commit -> rollback całej transakcji.
        }

        assert!(
            repo.list(true).expect("list").is_empty(),
            "wiersz konta nie powinien przetrwać wycofanej transakcji"
        );
    }
}
