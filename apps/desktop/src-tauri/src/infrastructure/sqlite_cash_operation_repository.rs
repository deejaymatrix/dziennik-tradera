use std::str::FromStr;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, Row};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::domain::cash_operation::{
    CashOperation, CashOperationKind, CashOperationRepository, NewCashOperation,
};
use crate::error::AppError;

pub struct SqliteCashOperationRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteCashOperationRepository {
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

fn map_row(row: &Row) -> rusqlite::Result<CashOperation> {
    let kind_raw: String = row.get("kind")?;
    let kind = CashOperationKind::from_db_str(&kind_raw).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            format!("nieznany rodzaj operacji: {kind_raw}").into(),
        )
    })?;

    Ok(CashOperation {
        id: row.get("id")?,
        account_id: row.get("account_id")?,
        kind,
        amount: parse_decimal(row, "amount")?,
        occurred_at: row.get("occurred_at")?,
        note: row.get("note")?,
        created_at: row.get("created_at")?,
    })
}

const SELECT_COLUMNS: &str = "id, account_id, kind, amount, occurred_at, note, created_at";

impl CashOperationRepository for SqliteCashOperationRepository {
    fn create(&self, input: &NewCashOperation) -> Result<CashOperation, AppError> {
        input.validate()?;

        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");

        let account_exists: i64 = conn.query_row(
            "SELECT count(*) FROM accounts WHERE id = ?1",
            [&input.account_id],
            |row| row.get(0),
        )?;
        if account_exists == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono konta o id {}.",
                input.account_id
            )));
        }

        let id = Uuid::now_v7().to_string();
        let now = Utc::now();

        conn.execute(
            "INSERT INTO cash_operations (id, account_id, kind, amount, occurred_at, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                id,
                input.account_id,
                input.kind.as_db_str(),
                input.amount.to_string(),
                input.occurred_at.to_rfc3339(),
                input.note,
                now.to_rfc3339(),
            ],
        )?;
        drop(conn);

        let created = self.get(&id)?;
        Ok(created)
    }

    fn list_for_account(&self, account_id: &str) -> Result<Vec<CashOperation>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let mut stmt = conn.prepare(&format!(
            "SELECT {SELECT_COLUMNS} FROM cash_operations WHERE account_id = ?1 ORDER BY occurred_at"
        ))?;
        let operations = stmt
            .query_map([account_id], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(operations)
    }
}

impl SqliteCashOperationRepository {
    fn get(&self, id: &str) -> Result<CashOperation, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let operation = conn.query_row(
            &format!("SELECT {SELECT_COLUMNS} FROM cash_operations WHERE id = ?1"),
            [id],
            map_row,
        )?;
        Ok(operation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::account::{AccountRepository, NewAccount};
    use crate::infrastructure::sqlite_account_repository::SqliteAccountRepository;
    use rust_decimal_macros::dec;

    fn repo_with_account() -> (SqliteCashOperationRepository, String, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));

        let account_repo = SqliteAccountRepository::new(conn.clone());
        let account = account_repo
            .create(&NewAccount {
                name: "Konto testowe".to_string(),
                description: None,
                account_type: None,
                currency: "USD".to_string(),
                initial_balance: dec!(1000),
            })
            .expect("create account");

        (SqliteCashOperationRepository::new(conn), account.id, dir)
    }

    #[test]
    fn creates_a_deposit_and_lists_it() {
        let (repo, account_id, _dir) = repo_with_account();
        let created = repo
            .create(&NewCashOperation {
                account_id: account_id.clone(),
                kind: CashOperationKind::Deposit,
                amount: dec!(500),
                occurred_at: Utc::now(),
                note: Some("wpłata startowa".to_string()),
            })
            .expect("create");

        assert_eq!(created.amount, dec!(500));
        let ops = repo.list_for_account(&account_id).expect("list");
        assert_eq!(ops.len(), 1);
    }

    #[test]
    fn rejects_operation_for_unknown_account() {
        let (repo, _account_id, _dir) = repo_with_account();
        let result = repo.create(&NewCashOperation {
            account_id: "nieistniejace-konto".to_string(),
            kind: CashOperationKind::Deposit,
            amount: dec!(100),
            occurred_at: Utc::now(),
            note: None,
        });
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn rejects_invalid_input_before_touching_the_database() {
        let (repo, account_id, _dir) = repo_with_account();
        let result = repo.create(&NewCashOperation {
            account_id,
            kind: CashOperationKind::Withdrawal,
            amount: dec!(-10),
            occurred_at: Utc::now(),
            note: None,
        });
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
