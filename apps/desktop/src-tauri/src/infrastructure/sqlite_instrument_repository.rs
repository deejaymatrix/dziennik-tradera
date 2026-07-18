use std::str::FromStr;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::domain::instrument::{Instrument, InstrumentRepository, InstrumentSpecInput};
use crate::error::AppError;

pub struct SqliteInstrumentRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteInstrumentRepository {
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

const SELECT_COLUMNS: &str =
    "id, symbol, name, category, decimal_places, tick_size, tick_value_per_lot,
     contract_size, pip_size, quote_currency, settlement_currency, min_lot, lot_step,
     is_active, created_at, updated_at";

fn map_row(row: &Row) -> rusqlite::Result<Instrument> {
    Ok(Instrument {
        id: row.get("id")?,
        symbol: row.get("symbol")?,
        name: row.get("name")?,
        category: row.get("category")?,
        decimal_places: row.get("decimal_places")?,
        tick_size: parse_decimal(row, "tick_size")?,
        tick_value_per_lot: parse_decimal(row, "tick_value_per_lot")?,
        contract_size: parse_decimal(row, "contract_size")?,
        pip_size: parse_decimal(row, "pip_size")?,
        quote_currency: row.get("quote_currency")?,
        settlement_currency: row.get("settlement_currency")?,
        min_lot: parse_decimal(row, "min_lot")?,
        lot_step: parse_decimal(row, "lot_step")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn map_unique_violation(err: rusqlite::Error, symbol: &str) -> AppError {
    if let rusqlite::Error::SqliteFailure(ref sqlite_err, _) = err {
        if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation {
            return AppError::Validation(format!("Instrument o symbolu {symbol} już istnieje."));
        }
    }
    AppError::from(err)
}

impl InstrumentRepository for SqliteInstrumentRepository {
    fn create(&self, input: &InstrumentSpecInput) -> Result<Instrument, AppError> {
        input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let id = Uuid::now_v7().to_string();
        let now = Utc::now();

        tx.execute(
            "INSERT INTO instruments (
                id, symbol, name, category, decimal_places, tick_size, tick_value_per_lot,
                contract_size, pip_size, quote_currency, settlement_currency, min_lot, lot_step,
                is_active, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1, ?14, ?14)",
            rusqlite::params![
                id,
                input.symbol.trim(),
                input.name.trim(),
                input.category,
                input.decimal_places,
                input.tick_size.to_string(),
                input.tick_value_per_lot.to_string(),
                input.contract_size.to_string(),
                input.pip_size.to_string(),
                input.quote_currency,
                input.settlement_currency,
                input.min_lot.to_string(),
                input.lot_step.to_string(),
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| map_unique_violation(e, &input.symbol))?;
        tx.commit()?;
        drop(conn);

        self.get(&id)
    }

    fn get(&self, id: &str) -> Result<Instrument, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let instrument = conn
            .query_row(
                &format!("SELECT {SELECT_COLUMNS} FROM instruments WHERE id = ?1"),
                [id],
                map_row,
            )
            .optional()?;
        instrument
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono instrumentu o id {id}.")))
    }

    fn list(&self, include_inactive: bool) -> Result<Vec<Instrument>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let sql = if include_inactive {
            format!("SELECT {SELECT_COLUMNS} FROM instruments ORDER BY symbol")
        } else {
            format!("SELECT {SELECT_COLUMNS} FROM instruments WHERE is_active = 1 ORDER BY symbol")
        };
        let mut stmt = conn.prepare(&sql)?;
        let instruments = stmt
            .query_map([], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(instruments)
    }

    fn update(&self, id: &str, input: &InstrumentSpecInput) -> Result<Instrument, AppError> {
        input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();

        let affected = tx
            .execute(
                "UPDATE instruments SET symbol = ?1, name = ?2, category = ?3, decimal_places = ?4,
                    tick_size = ?5, tick_value_per_lot = ?6, contract_size = ?7, pip_size = ?8,
                    quote_currency = ?9, settlement_currency = ?10, min_lot = ?11, lot_step = ?12,
                    updated_at = ?13
                 WHERE id = ?14",
                rusqlite::params![
                    input.symbol.trim(),
                    input.name.trim(),
                    input.category,
                    input.decimal_places,
                    input.tick_size.to_string(),
                    input.tick_value_per_lot.to_string(),
                    input.contract_size.to_string(),
                    input.pip_size.to_string(),
                    input.quote_currency,
                    input.settlement_currency,
                    input.min_lot.to_string(),
                    input.lot_step.to_string(),
                    now.to_rfc3339(),
                    id,
                ],
            )
            .map_err(|e| map_unique_violation(e, &input.symbol))?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono instrumentu o id {id}."
            )));
        }
        tx.commit()?;
        drop(conn);

        self.get(id)
    }

    fn deactivate(&self, id: &str) -> Result<Instrument, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE instruments SET is_active = 0, updated_at = ?1 WHERE id = ?2 AND is_active = 1",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnego instrumentu o id {id}."
            )));
        }
        self.get(id)
    }

    fn activate(&self, id: &str) -> Result<Instrument, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE instruments SET is_active = 1, updated_at = ?1 WHERE id = ?2 AND is_active = 0",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono nieaktywnego instrumentu o id {id}."
            )));
        }
        self.get(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use rust_decimal_macros::dec;

    fn repo_with_fresh_db() -> (SqliteInstrumentRepository, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteInstrumentRepository::new(conn), dir)
    }

    fn sample_input(symbol: &str) -> InstrumentSpecInput {
        InstrumentSpecInput {
            symbol: symbol.to_string(),
            name: "Instrument testowy".to_string(),
            category: Some("test".to_string()),
            decimal_places: 5,
            tick_size: dec!(0.00001),
            tick_value_per_lot: dec!(1),
            contract_size: dec!(100000),
            pip_size: dec!(0.0001),
            quote_currency: "USD".to_string(),
            settlement_currency: "USD".to_string(),
            min_lot: dec!(0.01),
            lot_step: dec!(0.01),
        }
    }

    #[test]
    fn seed_migration_provides_a_starter_library() {
        let (repo, _dir) = repo_with_fresh_db();
        let instruments = repo.list(true).expect("list");
        assert!(instruments.len() >= 10);
        assert!(instruments.iter().any(|i| i.symbol == "EURUSD"));
    }

    #[test]
    fn creates_a_custom_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("TESTUSD")).expect("create");
        assert_eq!(created.symbol, "TESTUSD");
        assert!(created.is_active);
    }

    #[test]
    fn rejects_duplicate_symbol() {
        let (repo, _dir) = repo_with_fresh_db();
        repo.create(&sample_input("DUPUSD")).expect("first create");
        let result = repo.create(&sample_input("DUPUSD"));
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn deactivate_then_activate_round_trip() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("ROUNDUSD")).expect("create");

        let deactivated = repo.deactivate(&created.id).expect("deactivate");
        assert!(!deactivated.is_active);
        assert!(repo
            .list(false)
            .expect("list active")
            .iter()
            .all(|i| i.id != created.id));

        let activated = repo.activate(&created.id).expect("activate");
        assert!(activated.is_active);
    }

    #[test]
    fn update_requires_existing_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let result = repo.update("brak-takiego-id", &sample_input("WHATEVER"));
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}
