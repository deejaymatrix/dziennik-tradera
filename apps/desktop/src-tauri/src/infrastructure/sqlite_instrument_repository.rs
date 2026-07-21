use std::str::FromStr;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::domain::instrument::{
    Instrument, InstrumentListFilter, InstrumentRepository, InstrumentVersion,
    InstrumentVersionInput, InstrumentVisibilityFilter, InstrumentWithDetails, NewInstrumentInput,
};
use crate::error::AppError;

/// Instrumenty domyślnie widoczne na czystej instalacji (sekcja "Widoczność i wybór
/// instrumentów") - używane też do przywracania domyślnej widoczności.
const DEFAULT_VISIBLE_DISPLAY_SYMBOLS: [&str; 6] =
    ["EURUSD", "XAUUSD", "DJI30", "NAS100", "D40EUR", "BTCUSD"];

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

const DETAILS_SELECT: &str = "
SELECT
    i.id, i.display_symbol, i.source_symbol, i.description, i.category, i.factory_index,
    i.created_at, i.updated_at,
    v.id AS version_id, v.version_number,
    v.currency_base, v.currency_profit, v.currency_margin, v.digits, v.point, v.trade_tick_size,
    v.trade_tick_value, v.tick_value_profit, v.tick_value_loss, v.contract_size,
    v.volume_min, v.volume_max, v.volume_step, v.volume_limit,
    v.calc_mode, v.trade_mode, v.execution_mode,
    v.order_mode_flags, v.filling_mode_flags, v.expiration_mode_flags,
    v.spread_floating, v.stops_level_points, v.freeze_level_points,
    v.margin_initial, v.margin_maintenance, v.margin_hedged, v.margin_hedged_use_leg,
    v.liquidity_rate, v.margin_rate_buy_initial, v.margin_rate_buy_maintenance,
    v.margin_rate_sell_initial, v.margin_rate_sell_maintenance,
    v.swap_mode, v.swap_long, v.swap_short,
    v.swap_sunday, v.swap_monday, v.swap_tuesday, v.swap_wednesday, v.swap_thursday,
    v.swap_friday, v.swap_saturday, v.triple_swap_day, v.quote_sessions, v.trade_sessions,
    v.start_time, v.expiration_time, v.created_at AS version_created_at,
    p.is_visible, p.sort_order, p.is_favorite
FROM instruments i
JOIN instrument_versions v ON v.instrument_id = i.id AND v.is_active = 1
JOIN instrument_preferences p ON p.instrument_id = i.id
";

const VERSION_COLUMN_LIST: &str = "
    currency_base, currency_profit, currency_margin, digits, point, trade_tick_size,
    trade_tick_value, tick_value_profit, tick_value_loss, contract_size,
    volume_min, volume_max, volume_step, volume_limit,
    calc_mode, trade_mode, execution_mode,
    order_mode_flags, filling_mode_flags, expiration_mode_flags,
    spread_floating, stops_level_points, freeze_level_points,
    margin_initial, margin_maintenance, margin_hedged, margin_hedged_use_leg,
    liquidity_rate, margin_rate_buy_initial, margin_rate_buy_maintenance,
    margin_rate_sell_initial, margin_rate_sell_maintenance,
    swap_mode, swap_long, swap_short,
    swap_sunday, swap_monday, swap_tuesday, swap_wednesday, swap_thursday,
    swap_friday, swap_saturday, triple_swap_day, quote_sessions, trade_sessions,
    start_time, expiration_time
";

fn map_details_row(row: &Row) -> rusqlite::Result<InstrumentWithDetails> {
    let instrument = Instrument {
        id: row.get("id")?,
        display_symbol: row.get("display_symbol")?,
        source_symbol: row.get("source_symbol")?,
        description: row.get("description")?,
        category: row.get("category")?,
        factory_index: row.get("factory_index")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    };
    let version = InstrumentVersion {
        id: row.get("version_id")?,
        instrument_id: instrument.id.clone(),
        version_number: row.get("version_number")?,
        is_active: true,
        currency_base: row.get("currency_base")?,
        currency_profit: row.get("currency_profit")?,
        currency_margin: row.get("currency_margin")?,
        digits: row.get("digits")?,
        point: parse_decimal(row, "point")?,
        trade_tick_size: parse_decimal(row, "trade_tick_size")?,
        trade_tick_value: parse_decimal(row, "trade_tick_value")?,
        tick_value_profit: parse_decimal(row, "tick_value_profit")?,
        tick_value_loss: parse_decimal(row, "tick_value_loss")?,
        contract_size: parse_decimal(row, "contract_size")?,
        volume_min: parse_decimal(row, "volume_min")?,
        volume_max: parse_decimal(row, "volume_max")?,
        volume_step: parse_decimal(row, "volume_step")?,
        volume_limit: parse_decimal(row, "volume_limit")?,
        calc_mode: row.get("calc_mode")?,
        trade_mode: row.get("trade_mode")?,
        execution_mode: row.get("execution_mode")?,
        order_mode_flags: row.get("order_mode_flags")?,
        filling_mode_flags: row.get("filling_mode_flags")?,
        expiration_mode_flags: row.get("expiration_mode_flags")?,
        spread_floating: row.get::<_, i64>("spread_floating")? != 0,
        stops_level_points: row.get("stops_level_points")?,
        freeze_level_points: row.get("freeze_level_points")?,
        margin_initial: parse_decimal(row, "margin_initial")?,
        margin_maintenance: parse_decimal(row, "margin_maintenance")?,
        margin_hedged: parse_decimal(row, "margin_hedged")?,
        margin_hedged_use_leg: row.get::<_, i64>("margin_hedged_use_leg")? != 0,
        liquidity_rate: parse_decimal(row, "liquidity_rate")?,
        margin_rate_buy_initial: parse_decimal(row, "margin_rate_buy_initial")?,
        margin_rate_buy_maintenance: parse_decimal(row, "margin_rate_buy_maintenance")?,
        margin_rate_sell_initial: parse_decimal(row, "margin_rate_sell_initial")?,
        margin_rate_sell_maintenance: parse_decimal(row, "margin_rate_sell_maintenance")?,
        swap_mode: row.get("swap_mode")?,
        swap_long: parse_decimal(row, "swap_long")?,
        swap_short: parse_decimal(row, "swap_short")?,
        swap_sunday: parse_decimal(row, "swap_sunday")?,
        swap_monday: parse_decimal(row, "swap_monday")?,
        swap_tuesday: parse_decimal(row, "swap_tuesday")?,
        swap_wednesday: parse_decimal(row, "swap_wednesday")?,
        swap_thursday: parse_decimal(row, "swap_thursday")?,
        swap_friday: parse_decimal(row, "swap_friday")?,
        swap_saturday: parse_decimal(row, "swap_saturday")?,
        triple_swap_day: row.get("triple_swap_day")?,
        quote_sessions: row.get("quote_sessions")?,
        trade_sessions: row.get("trade_sessions")?,
        start_time: row.get("start_time")?,
        expiration_time: row.get("expiration_time")?,
        created_at: row.get("version_created_at")?,
    };
    Ok(InstrumentWithDetails {
        instrument,
        version,
        is_visible: row.get::<_, i64>("is_visible")? != 0,
        sort_order: row.get("sort_order")?,
        is_favorite: row.get::<_, i64>("is_favorite")? != 0,
    })
}

fn map_unique_violation(err: rusqlite::Error) -> AppError {
    if let rusqlite::Error::SqliteFailure(ref sqlite_err, ref message) = err {
        if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation {
            let detail = message.as_deref().unwrap_or("");
            if detail.contains("display_symbol") {
                return AppError::Validation(
                    "Instrument o takim symbolu wyświetlanym już istnieje.".to_string(),
                );
            }
            if detail.contains("source_symbol") {
                return AppError::Validation(
                    "Instrument o takim symbolu technicznym już istnieje.".to_string(),
                );
            }
            return AppError::Validation("Instrument o tych danych już istnieje.".to_string());
        }
    }
    AppError::from(err)
}

fn insert_version(
    tx: &rusqlite::Transaction,
    version_id: &str,
    instrument_id: &str,
    version_number: i64,
    input: &InstrumentVersionInput,
    now: &str,
) -> rusqlite::Result<()> {
    // 3 placeholdery (id, instrument_id, version_number) + literał is_active + 47 pól
    // z VERSION_COLUMN_LIST + created_at = 51 placeholderów. Generowane programowo, żeby ręczne
    // liczenie ?N przy 47-polowym zestawie parametrów nie rozjechało się z listą kolumn.
    let placeholders = (4..=51)
        .map(|n| format!("?{n}"))
        .collect::<Vec<_>>()
        .join(", ");
    tx.execute(
        &format!(
            "INSERT INTO instrument_versions (id, instrument_id, version_number, is_active, {VERSION_COLUMN_LIST}, created_at)
             VALUES (?1, ?2, ?3, 1, {placeholders})"
        ),
        rusqlite::params![
            version_id,
            instrument_id,
            version_number,
            input.currency_base,
            input.currency_profit,
            input.currency_margin,
            input.digits,
            input.point.to_string(),
            input.trade_tick_size.to_string(),
            input.trade_tick_value.to_string(),
            input.tick_value_profit.to_string(),
            input.tick_value_loss.to_string(),
            input.contract_size.to_string(),
            input.volume_min.to_string(),
            input.volume_max.to_string(),
            input.volume_step.to_string(),
            input.volume_limit.to_string(),
            input.calc_mode,
            input.trade_mode,
            input.execution_mode,
            input.order_mode_flags,
            input.filling_mode_flags,
            input.expiration_mode_flags,
            input.spread_floating as i64,
            input.stops_level_points,
            input.freeze_level_points,
            input.margin_initial.to_string(),
            input.margin_maintenance.to_string(),
            input.margin_hedged.to_string(),
            input.margin_hedged_use_leg as i64,
            input.liquidity_rate.to_string(),
            input.margin_rate_buy_initial.to_string(),
            input.margin_rate_buy_maintenance.to_string(),
            input.margin_rate_sell_initial.to_string(),
            input.margin_rate_sell_maintenance.to_string(),
            input.swap_mode,
            input.swap_long.to_string(),
            input.swap_short.to_string(),
            input.swap_sunday.to_string(),
            input.swap_monday.to_string(),
            input.swap_tuesday.to_string(),
            input.swap_wednesday.to_string(),
            input.swap_thursday.to_string(),
            input.swap_friday.to_string(),
            input.swap_saturday.to_string(),
            input.triple_swap_day,
            input.quote_sessions,
            input.trade_sessions,
            input.start_time,
            input.expiration_time,
            now,
        ],
    )?;
    Ok(())
}

impl InstrumentRepository for SqliteInstrumentRepository {
    fn create(&self, input: &NewInstrumentInput) -> Result<InstrumentWithDetails, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();
        let now_str = now.to_rfc3339();

        let instrument_id = Uuid::now_v7().to_string();
        // B1 (szablony brokerów): każdy instrument należy do szablonu, a unikalność symboli
        // działa per szablon. Do czasu przewleczenia jawnego kontekstu szablonu przez UI (B2)
        // nowe instrumenty użytkownika trafiają do domyślnego (najstarszego aktywnego) szablonu
        // - dokładnie tam, gdzie migracja 0010 umieściła cały dotychczasowy katalog.
        tx.execute(
            "INSERT INTO instruments (id, display_symbol, source_symbol, description, category, factory_index, created_at, updated_at, template_id, canonical_symbol, variant, origin)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6,
                     (SELECT id FROM broker_instrument_templates WHERE archived_at IS NULL ORDER BY created_at LIMIT 1),
                     ?2, 'STANDARD', 'user_created')",
            rusqlite::params![
                instrument_id,
                input.display_symbol.trim(),
                input.source_symbol.trim(),
                input.description.trim(),
                input.category,
                now_str,
            ],
        )
        .map_err(map_unique_violation)?;

        let version_id = Uuid::now_v7().to_string();
        insert_version(
            &tx,
            &version_id,
            &instrument_id,
            1,
            &input.parameters,
            &now_str,
        )?;

        let next_sort_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM instrument_preferences",
            [],
            |row| row.get(0),
        )?;
        tx.execute(
            "INSERT INTO instrument_preferences (instrument_id, is_visible, sort_order, is_favorite)
             VALUES (?1, 1, ?2, 0)",
            rusqlite::params![instrument_id, next_sort_order],
        )?;

        tx.commit()?;
        drop(conn);

        self.get(&instrument_id)
    }

    fn get(&self, id: &str) -> Result<InstrumentWithDetails, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let details = conn
            .query_row(
                &format!("{DETAILS_SELECT} WHERE i.id = ?1"),
                [id],
                map_details_row,
            )
            .optional()?;
        details.ok_or_else(|| AppError::NotFound(format!("Nie znaleziono instrumentu o id {id}.")))
    }

    fn list(&self, filter: &InstrumentListFilter) -> Result<Vec<InstrumentWithDetails>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");

        let mut conditions: Vec<String> = Vec::new();
        let mut params: Vec<String> = Vec::new();

        match filter.visibility {
            InstrumentVisibilityFilter::Visible => conditions.push("p.is_visible = 1".to_string()),
            InstrumentVisibilityFilter::Hidden => conditions.push("p.is_visible = 0".to_string()),
            InstrumentVisibilityFilter::All => {}
        }
        if let Some(category) = &filter.category {
            params.push(category.clone());
            conditions.push(format!("i.category = ?{}", params.len()));
        }
        if let Some(search) = &filter.search {
            let trimmed = search.trim();
            if !trimmed.is_empty() {
                let pattern = format!(
                    "%{}%",
                    trimmed
                        .replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_")
                );
                let mut placeholders = Vec::new();
                for _ in 0..4 {
                    params.push(pattern.clone());
                    placeholders.push(format!("?{}", params.len()));
                }
                conditions.push(format!(
                    "(i.display_symbol LIKE {0} ESCAPE '\\' OR i.source_symbol LIKE {1} ESCAPE '\\' OR i.description LIKE {2} ESCAPE '\\' OR i.category LIKE {3} ESCAPE '\\')",
                    placeholders[0], placeholders[1], placeholders[2], placeholders[3]
                ));
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };
        let sql =
            format!("{DETAILS_SELECT} {where_clause} ORDER BY p.sort_order, i.display_symbol");

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params.iter()), map_details_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    fn update_version(
        &self,
        instrument_id: &str,
        input: &InstrumentVersionInput,
    ) -> Result<InstrumentWithDetails, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let exists: i64 = tx.query_row(
            "SELECT count(*) FROM instruments WHERE id = ?1",
            [instrument_id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono instrumentu o id {instrument_id}."
            )));
        }

        let next_version: i64 = tx.query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM instrument_versions WHERE instrument_id = ?1",
            [instrument_id],
            |row| row.get(0),
        )?;
        tx.execute(
            "UPDATE instrument_versions SET is_active = 0 WHERE instrument_id = ?1 AND is_active = 1",
            [instrument_id],
        )?;

        let now = Utc::now().to_rfc3339();
        let version_id = Uuid::now_v7().to_string();
        insert_version(&tx, &version_id, instrument_id, next_version, input, &now)
            .map_err(map_unique_violation)?;

        tx.execute(
            "UPDATE instruments SET updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, instrument_id],
        )?;

        tx.commit()?;
        drop(conn);

        self.get(instrument_id)
    }

    fn reset_to_factory(&self, instrument_id: &str) -> Result<InstrumentWithDetails, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let factory_index: Option<i64> = tx
            .query_row(
                "SELECT factory_index FROM instruments WHERE id = ?1",
                [instrument_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| {
                AppError::NotFound(format!("Nie znaleziono instrumentu o id {instrument_id}."))
            })?;
        if factory_index.is_none() {
            return Err(AppError::Validation(
                "Ten instrument nie pochodzi z fabrycznego katalogu, więc nie ma wartości fabrycznych do przywrócenia."
                    .to_string(),
            ));
        }

        let next_version: i64 = tx.query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM instrument_versions WHERE instrument_id = ?1",
            [instrument_id],
            |row| row.get(0),
        )?;
        tx.execute(
            "UPDATE instrument_versions SET is_active = 0 WHERE instrument_id = ?1 AND is_active = 1",
            [instrument_id],
        )?;

        let now = Utc::now().to_rfc3339();
        let new_version_id = Uuid::now_v7().to_string();
        tx.execute(
            &format!(
                "INSERT INTO instrument_versions (id, instrument_id, version_number, is_active, {VERSION_COLUMN_LIST}, created_at)
                 SELECT ?1, instrument_id, ?2, 1, {VERSION_COLUMN_LIST}, ?3
                 FROM instrument_versions WHERE instrument_id = ?4 AND version_number = 1"
            ),
            rusqlite::params![new_version_id, next_version, now, instrument_id],
        )?;
        tx.execute(
            "UPDATE instruments SET updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, instrument_id],
        )?;

        tx.commit()?;
        drop(conn);

        self.get(instrument_id)
    }

    fn set_visibility(&self, instrument_id: &str, is_visible: bool) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn.execute(
            "UPDATE instrument_preferences SET is_visible = ?1 WHERE instrument_id = ?2",
            rusqlite::params![is_visible as i64, instrument_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono instrumentu o id {instrument_id}."
            )));
        }
        Ok(())
    }

    fn set_visibility_bulk(
        &self,
        instrument_ids: &[String],
        is_visible: bool,
    ) -> Result<(), AppError> {
        if instrument_ids.is_empty() {
            return Ok(());
        }
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let placeholders = instrument_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 2))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "UPDATE instrument_preferences SET is_visible = ?1 WHERE instrument_id IN ({placeholders})"
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(is_visible as i64)];
        for id in instrument_ids {
            params.push(Box::new(id.clone()));
        }
        let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())?;
        Ok(())
    }

    fn reorder(&self, ordered_instrument_ids: &[String]) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        for (index, id) in ordered_instrument_ids.iter().enumerate() {
            tx.execute(
                "UPDATE instrument_preferences SET sort_order = ?1 WHERE instrument_id = ?2",
                rusqlite::params![index as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    fn reset_to_default_visibility(&self) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let placeholders = DEFAULT_VISIBLE_DISPLAY_SYMBOLS
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let params: Vec<&dyn rusqlite::ToSql> = DEFAULT_VISIBLE_DISPLAY_SYMBOLS
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();

        conn.execute(
            &format!(
                "UPDATE instrument_preferences
                 SET is_visible = CASE WHEN instrument_id IN (
                     SELECT id FROM instruments WHERE display_symbol IN ({placeholders})
                 ) THEN 1 ELSE 0 END
                 WHERE instrument_id IN (SELECT id FROM instruments WHERE factory_index IS NOT NULL)"
            ),
            params.as_slice(),
        )?;
        conn.execute(
            "UPDATE instrument_preferences
             SET sort_order = (SELECT factory_index FROM instruments WHERE instruments.id = instrument_preferences.instrument_id)
             WHERE instrument_id IN (SELECT id FROM instruments WHERE factory_index IS NOT NULL)",
            [],
        )?;
        Ok(())
    }

    fn delete(&self, instrument_id: &str) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let factory_index: Option<i64> = tx
            .query_row(
                "SELECT factory_index FROM instruments WHERE id = ?1",
                [instrument_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| {
                AppError::NotFound(format!("Nie znaleziono instrumentu o id {instrument_id}."))
            })?;
        if factory_index.is_some() {
            return Err(AppError::Validation(
                "Instrumentów z fabrycznego katalogu nie można usunąć - można je wyłącznie ukryć."
                    .to_string(),
            ));
        }

        let used_in_trades: i64 = tx.query_row(
            "SELECT count(*) FROM trades WHERE instrument_id = ?1",
            [instrument_id],
            |row| row.get(0),
        )?;
        if used_in_trades > 0 {
            return Err(AppError::Validation(
                "Nie można usunąć instrumentu, który jest już użyty w co najmniej jednej transakcji."
                    .to_string(),
            ));
        }

        tx.execute(
            "DELETE FROM instrument_preferences WHERE instrument_id = ?1",
            [instrument_id],
        )?;
        tx.execute(
            "DELETE FROM instrument_versions WHERE instrument_id = ?1",
            [instrument_id],
        )?;
        tx.execute("DELETE FROM instruments WHERE id = ?1", [instrument_id])?;

        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use rust_decimal_macros::dec;

    fn repo_with_fresh_db() -> (SqliteInstrumentRepository, tempfile::TempDir) {
        let (repo, _conn, dir) = repo_with_fresh_db_and_conn();
        (repo, dir)
    }

    fn repo_with_fresh_db_and_conn() -> (
        SqliteInstrumentRepository,
        Arc<Mutex<Connection>>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteInstrumentRepository::new(conn.clone()), conn, dir)
    }

    fn sample_params() -> InstrumentVersionInput {
        InstrumentVersionInput {
            currency_base: "USD".to_string(),
            currency_profit: "USD".to_string(),
            currency_margin: "USD".to_string(),
            digits: 5,
            point: dec!(0.00001),
            trade_tick_size: dec!(0.00001),
            trade_tick_value: dec!(1),
            tick_value_profit: dec!(1),
            tick_value_loss: dec!(1),
            contract_size: dec!(100000),
            volume_min: dec!(0.01),
            volume_max: dec!(100),
            volume_step: dec!(0.01),
            volume_limit: dec!(0),
            calc_mode: "SYMBOL_CALC_MODE_FOREX".to_string(),
            trade_mode: "SYMBOL_TRADE_MODE_FULL".to_string(),
            execution_mode: "SYMBOL_TRADE_EXECUTION_MARKET".to_string(),
            order_mode_flags: 63,
            filling_mode_flags: 1,
            expiration_mode_flags: 15,
            spread_floating: true,
            stops_level_points: 0,
            freeze_level_points: 0,
            margin_initial: dec!(0),
            margin_maintenance: dec!(0),
            margin_hedged: dec!(0),
            margin_hedged_use_leg: false,
            liquidity_rate: dec!(0),
            margin_rate_buy_initial: dec!(1),
            margin_rate_buy_maintenance: dec!(1),
            margin_rate_sell_initial: dec!(1),
            margin_rate_sell_maintenance: dec!(1),
            swap_mode: "SYMBOL_SWAP_MODE_POINTS".to_string(),
            swap_long: dec!(0),
            swap_short: dec!(0),
            swap_sunday: dec!(1),
            swap_monday: dec!(1),
            swap_tuesday: dec!(1),
            swap_wednesday: dec!(1),
            swap_thursday: dec!(1),
            swap_friday: dec!(1),
            swap_saturday: dec!(1),
            triple_swap_day: "ENUM_DAY_OF_WEEK::7".to_string(),
            quote_sessions: "Mon:00:00-23:55".to_string(),
            trade_sessions: "Mon:00:00-23:55".to_string(),
            start_time: None,
            expiration_time: None,
        }
    }

    fn sample_input(display_symbol: &str) -> NewInstrumentInput {
        NewInstrumentInput {
            display_symbol: display_symbol.to_string(),
            source_symbol: format!("{display_symbol}.custom"),
            description: "Instrument testowy".to_string(),
            category: "Forex".to_string(),
            parameters: sample_params(),
        }
    }

    #[test]
    fn seed_migration_provides_exactly_350_factory_instruments() {
        let (repo, _dir) = repo_with_fresh_db();
        let instruments = repo
            .list(&InstrumentListFilter {
                visibility: InstrumentVisibilityFilter::All,
                ..Default::default()
            })
            .expect("list");
        assert_eq!(instruments.len(), 350);
        assert!(instruments
            .iter()
            .any(|i| i.instrument.display_symbol == "EURUSD"));
    }

    #[test]
    fn exactly_six_instruments_are_visible_by_default() {
        let (repo, _dir) = repo_with_fresh_db();
        let visible = repo
            .list(&InstrumentListFilter {
                visibility: InstrumentVisibilityFilter::Visible,
                ..Default::default()
            })
            .expect("list visible");
        assert_eq!(visible.len(), 6);
        let symbols: Vec<_> = visible
            .iter()
            .map(|i| i.instrument.display_symbol.clone())
            .collect();
        for expected in DEFAULT_VISIBLE_DISPLAY_SYMBOLS {
            assert!(
                symbols.contains(&expected.to_string()),
                "brak {expected} wśród widocznych"
            );
        }
    }

    #[test]
    fn search_finds_by_symbol_description_and_category() {
        let (repo, _dir) = repo_with_fresh_db();
        let by_symbol = repo
            .list(&InstrumentListFilter {
                search: Some("EURUSD".to_string()),
                ..Default::default()
            })
            .expect("search symbol");
        assert!(by_symbol
            .iter()
            .any(|i| i.instrument.display_symbol == "EURUSD"));

        let by_category = repo
            .list(&InstrumentListFilter {
                category: Some("Kryptowaluty".to_string()),
                ..Default::default()
            })
            .expect("search category");
        assert_eq!(by_category.len(), 80);
    }

    #[test]
    fn creates_a_custom_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("TESTUSD")).expect("create");
        assert_eq!(created.instrument.display_symbol, "TESTUSD");
        assert_eq!(created.version.version_number, 1);
        assert!(created.is_visible);
        assert!(created.instrument.factory_index.is_none());
    }

    #[test]
    fn deletes_a_custom_instrument_not_used_by_any_trade() {
        let (repo, conn, _dir) = repo_with_fresh_db_and_conn();
        let created = repo.create(&sample_input("DELUSD")).expect("create");

        repo.delete(&created.instrument.id).expect("delete");

        assert!(matches!(
            repo.get(&created.instrument.id),
            Err(AppError::NotFound(_))
        ));
        let version_count: i64 = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM instrument_versions WHERE instrument_id = ?1",
                [&created.instrument.id],
                |row| row.get(0),
            )
            .expect("count versions");
        assert_eq!(
            version_count, 0,
            "wersje usuniętego instrumentu też muszą zniknąć"
        );
    }

    #[test]
    fn rejects_deleting_a_factory_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let eurusd = repo
            .list(&InstrumentListFilter {
                search: Some("EURUSD".to_string()),
                ..Default::default()
            })
            .expect("find eurusd")
            .into_iter()
            .find(|i| i.instrument.display_symbol == "EURUSD")
            .expect("EURUSD musi istnieć w katalogu");

        let result = repo.delete(&eurusd.instrument.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(
            repo.get(&eurusd.instrument.id).is_ok(),
            "fabryczny instrument musi przetrwać"
        );
    }

    #[test]
    fn rejects_deleting_a_custom_instrument_used_by_a_trade() {
        let (repo, conn, _dir) = repo_with_fresh_db_and_conn();
        let created = repo.create(&sample_input("USEDUSD")).expect("create");

        {
            let conn = conn.lock().unwrap();
            conn.execute(
                "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
                 VALUES ('acc-1', 'Konto testowe', 'USD', '10000', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            )
            .expect("insert account");
            conn.execute(
                "INSERT INTO trades (id, account_id, display_number, instrument_id, status, side, created_at, updated_at)
                 VALUES ('trade-1', 'acc-1', 1, ?1, 'draft', 'buy', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [&created.instrument.id],
            )
            .expect("insert trade");
        }

        let result = repo.delete(&created.instrument.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(
            repo.get(&created.instrument.id).is_ok(),
            "instrument użyty w transakcji musi przetrwać"
        );
    }

    #[test]
    fn rejects_duplicate_display_symbol() {
        let (repo, _dir) = repo_with_fresh_db();
        repo.create(&sample_input("DUPUSD")).expect("first create");
        let result = repo.create(&sample_input("DUPUSD"));
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_version_creates_a_new_version_without_losing_history() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("VERUSD")).expect("create");

        let mut new_params = sample_params();
        new_params.tick_value_profit = dec!(2);
        new_params.tick_value_loss = dec!(2);
        let updated = repo
            .update_version(&created.instrument.id, &new_params)
            .expect("update version");

        assert_eq!(updated.version.version_number, 2);
        assert_eq!(updated.version.tick_value_profit, dec!(2));
    }

    #[test]
    fn reset_to_factory_restores_original_version_one_values() {
        let (repo, _dir) = repo_with_fresh_db();
        let eurusd = repo
            .list(&InstrumentListFilter {
                search: Some("EURUSD".to_string()),
                ..Default::default()
            })
            .expect("find eurusd")
            .into_iter()
            .find(|i| i.instrument.display_symbol == "EURUSD")
            .expect("EURUSD musi istnieć w katalogu");
        let original_tick_value = eurusd.version.tick_value_profit;

        let mut changed = sample_params();
        changed.tick_value_profit = dec!(999);
        changed.tick_value_loss = dec!(999);
        repo.update_version(&eurusd.instrument.id, &changed)
            .expect("update");

        let reset = repo
            .reset_to_factory(&eurusd.instrument.id)
            .expect("reset to factory");
        assert_eq!(reset.version.tick_value_profit, original_tick_value);
        assert_eq!(reset.version.version_number, 3);
    }

    #[test]
    fn reset_to_factory_rejects_non_factory_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("NOFACTORY")).expect("create");
        let result = repo.reset_to_factory(&created.instrument.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn set_visibility_hides_and_shows_an_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("VISUSD")).expect("create");
        repo.set_visibility(&created.instrument.id, false)
            .expect("hide");
        let hidden = repo.get(&created.instrument.id).expect("get");
        assert!(!hidden.is_visible);

        repo.set_visibility(&created.instrument.id, true)
            .expect("show");
        let shown = repo.get(&created.instrument.id).expect("get");
        assert!(shown.is_visible);
    }

    #[test]
    fn hiding_an_instrument_never_deletes_it() {
        let (repo, _dir) = repo_with_fresh_db();
        let created = repo.create(&sample_input("KEEPUSD")).expect("create");
        repo.set_visibility(&created.instrument.id, false)
            .expect("hide");
        let still_there = repo.get(&created.instrument.id).expect("get after hide");
        assert_eq!(still_there.instrument.display_symbol, "KEEPUSD");
    }

    #[test]
    fn reset_to_default_visibility_restores_exactly_six_factory_defaults() {
        let (repo, _dir) = repo_with_fresh_db();
        repo.set_visibility_bulk(
            &[repo
                .list(&InstrumentListFilter {
                    search: Some("EURUSD".to_string()),
                    ..Default::default()
                })
                .expect("find")
                .into_iter()
                .find(|i| i.instrument.display_symbol == "EURUSD")
                .expect("EURUSD")
                .instrument
                .id],
            false,
        )
        .expect("hide eurusd");

        repo.reset_to_default_visibility().expect("reset");

        let visible = repo
            .list(&InstrumentListFilter {
                visibility: InstrumentVisibilityFilter::Visible,
                ..Default::default()
            })
            .expect("list visible");
        assert_eq!(visible.len(), 6);
        assert!(visible
            .iter()
            .any(|i| i.instrument.display_symbol == "EURUSD"));
    }

    #[test]
    fn update_version_requires_existing_instrument() {
        let (repo, _dir) = repo_with_fresh_db();
        let result = repo.update_version("brak-takiego-id", &sample_params());
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}
