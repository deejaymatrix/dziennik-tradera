use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension, Row};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::domain::instrument::InstrumentSnapshot;
use crate::domain::strategy::StrategySnapshot;
use crate::domain::strategy_checklist::StrategyChecklist;
use crate::domain::trade::{PnlSource, Trade, TradeRepository, TradeSide, TradeWrite};
use crate::domain::trade_audit::{FieldChange, TradeAuditEntry, TradeAuditRepository};
use crate::domain::trade_emotions::TradeEmotions;
use crate::domain::trade_partial_close::PartialClose;
use crate::error::AppError;

pub struct SqliteTradeRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteTradeRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const SELECT_COLUMNS: &str =
    "id, account_id, display_number, instrument_id, instrument_spec_snapshot,
     strategy_id, strategy_snapshot, status, side, opened_at, closed_at, interval, interval_id,
     session, volume, entry_price, stop_loss, take_profit, exit_price, commission, swap, other_fees,
     conversion_rate, gross_pnl, net_pnl, pnl_points, pnl_percent, pnl_r, risk_amount, risk_percent,
     plan_before, management_notes, post_trade_summary, conclusion, tags, plan_adherence_rating,
     pnl_source, pnl_override_reason, emotions_json, checklist_json, created_at, updated_at,
     deleted_at";

fn parse_decimal_opt(row: &Row, idx: &str) -> rusqlite::Result<Option<Decimal>> {
    let raw: Option<String> = row.get(idx)?;
    raw.map(|text| {
        Decimal::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })
    })
    .transpose()
}

fn parse_decimal(row: &Row, idx: &str) -> rusqlite::Result<Decimal> {
    let raw: String = row.get(idx)?;
    Decimal::from_str(&raw).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}

/// Zapisuje częściowe zamknięcia transakcji, ZASTĘPUJĄC dotychczasowe. Formularz przysyła zawsze
/// pełną, aktualną listę (dodawanie, edycja i usuwanie wpisów dzieje się u niego przed zapisem),
/// więc wymiana kompletu jest prostsza i bezpieczniejsza niż doszukiwanie się różnic. Działa w tej
/// samej transakcji SQL co zapis samej transakcji, żeby nie dało się zostawić wpisów bez
/// transakcji ani transakcji bez jej wpisów.
fn replace_partial_closes(
    tx: &rusqlite::Transaction<'_>,
    trade_id: &str,
    closes: &[PartialClose],
    now: &str,
) -> rusqlite::Result<()> {
    tx.execute(
        "DELETE FROM trade_partial_closes WHERE trade_id = ?1",
        [trade_id],
    )?;
    for (position, close) in closes.iter().enumerate() {
        tx.execute(
            "INSERT INTO trade_partial_closes
                (id, trade_id, position, closed_volume, realized_pnl, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                Uuid::now_v7().to_string(),
                trade_id,
                position as i64,
                close.closed_volume.to_string(),
                close.realized_pnl.to_string(),
                now,
            ],
        )?;
    }
    Ok(())
}

/// Dociąga częściowe zamknięcia do już wczytanych transakcji i poprawia ich status.
///
/// `map_row` liczy status z samego wiersza `trades`, więc nie wie nic o wpisach leżących w osobnej
/// tabeli - dopiero tutaj wchodzi reguła z sekcji 6.9 (pozostały lot `0` => zamknięta, więcej
/// niż `0` => otwarta). Wszystko idzie JEDNYM zapytaniem dla całej listy, żeby lista transakcji
/// nie robiła zapytania na każdą pozycję z osobna.
fn attach_partial_closes(conn: &Connection, trades: &mut [Trade]) -> rusqlite::Result<()> {
    if trades.is_empty() {
        return Ok(());
    }

    // Placeholdery generowane programowo - liczba transakcji jest zmienna, a sklejanie id
    // bezpośrednio w SQL byłoby wstrzyknięciem.
    let placeholders = std::iter::repeat_n("?", trades.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT trade_id, closed_volume, realized_pnl FROM trade_partial_closes
         WHERE trade_id IN ({placeholders}) ORDER BY trade_id, position"
    );

    let mut grouped: HashMap<String, Vec<PartialClose>> = HashMap::new();
    {
        let mut stmt = conn.prepare(&sql)?;
        let ids = trades.iter().map(|t| t.id.clone()).collect::<Vec<_>>();
        let rows = stmt.query_map(rusqlite::params_from_iter(ids), |row| {
            Ok((
                row.get::<_, String>("trade_id")?,
                PartialClose {
                    closed_volume: parse_decimal(row, "closed_volume")?,
                    realized_pnl: parse_decimal(row, "realized_pnl")?,
                },
            ))
        })?;
        for row in rows {
            let (trade_id, close) = row?;
            grouped.entry(trade_id).or_default().push(close);
        }
    }

    for trade in trades.iter_mut() {
        if let Some(closes) = grouped.remove(&trade.id) {
            trade.status = crate::domain::trade::apply_partial_closes_to_status(
                trade.status,
                &closes,
                trade.volume,
            );
            trade.partial_closes = closes;
        }
    }

    Ok(())
}

fn parse_json_opt<T: serde::de::DeserializeOwned>(
    row: &Row,
    idx: &str,
) -> rusqlite::Result<Option<T>> {
    let raw: Option<String> = row.get(idx)?;
    raw.map(|text| {
        serde_json::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })
    })
    .transpose()
}

fn parse_tags(row: &Row, idx: &str) -> rusqlite::Result<Vec<String>> {
    let raw: Option<String> = row.get(idx)?;
    match raw {
        None => Ok(Vec::new()),
        Some(text) => serde_json::from_str(&text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        }),
    }
}

fn tags_json(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
}

fn json_opt<T: serde::Serialize>(value: &Option<T>) -> Option<String> {
    value
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default())
}

fn map_row(row: &Row) -> rusqlite::Result<Trade> {
    let side_raw: String = row.get("side")?;
    let pnl_source_raw: String = row.get("pnl_source")?;

    let instrument_id: Option<String> = row.get("instrument_id")?;
    let opened_at: Option<DateTime<Utc>> = row.get("opened_at")?;
    let closed_at: Option<DateTime<Utc>> = row.get("closed_at")?;
    let volume = parse_decimal_opt(row, "volume")?;
    let entry_price = parse_decimal_opt(row, "entry_price")?;
    let exit_price = parse_decimal_opt(row, "exit_price")?;

    // Status nigdy nie jest wczytywany z kolumny `status` jako źródło prawdy - zawsze wyliczany
    // na nowo z obecności danych (`domain::trade::compute_status`), żeby ewentualny
    // niezaktualizowany historyczny wiersz (np. sprzed tej zmiany) i tak wyświetlił się
    // poprawnie bez osobnej migracji danych.
    let status = crate::domain::trade::compute_status(
        instrument_id.is_some(),
        entry_price.is_some(),
        volume.is_some(),
        opened_at.is_some(),
        exit_price.is_some(),
        closed_at.is_some(),
    );

    Ok(Trade {
        id: row.get("id")?,
        account_id: row.get("account_id")?,
        display_number: row.get("display_number")?,
        instrument_id,
        instrument_spec_snapshot: parse_json_opt::<InstrumentSnapshot>(
            row,
            "instrument_spec_snapshot",
        )?,
        strategy_id: row.get("strategy_id")?,
        strategy_snapshot: parse_json_opt::<StrategySnapshot>(row, "strategy_snapshot")?,
        status,
        side: TradeSide::from_db_str(&side_raw),
        opened_at,
        closed_at,
        interval_id: row.get("interval_id")?,
        interval: row.get("interval")?,
        session: row.get("session")?,
        volume,
        entry_price,
        stop_loss: parse_decimal_opt(row, "stop_loss")?,
        take_profit: parse_decimal_opt(row, "take_profit")?,
        exit_price,
        commission: parse_decimal(row, "commission")?,
        swap: parse_decimal(row, "swap")?,
        other_fees: parse_decimal(row, "other_fees")?,
        conversion_rate: parse_decimal_opt(row, "conversion_rate")?,
        gross_pnl: parse_decimal_opt(row, "gross_pnl")?,
        net_pnl: parse_decimal_opt(row, "net_pnl")?,
        pnl_points: parse_decimal_opt(row, "pnl_points")?,
        pnl_percent: parse_decimal_opt(row, "pnl_percent")?,
        pnl_r: parse_decimal_opt(row, "pnl_r")?,
        risk_amount: parse_decimal_opt(row, "risk_amount")?,
        risk_percent: parse_decimal_opt(row, "risk_percent")?,
        plan_before: row.get("plan_before")?,
        management_notes: row.get("management_notes")?,
        post_trade_summary: row.get("post_trade_summary")?,
        conclusion: row.get("conclusion")?,
        tags: parse_tags(row, "tags")?,
        plan_adherence_rating: row.get("plan_adherence_rating")?,
        pnl_source: PnlSource::from_db_str(&pnl_source_raw),
        pnl_override_reason: row.get("pnl_override_reason")?,
        emotions: parse_json_opt::<TradeEmotions>(row, "emotions_json")?,
        checklist: parse_json_opt::<StrategyChecklist>(row, "checklist_json")?,
        // Częściowe zamknięcia leżą w osobnej tabeli, więc nie ma ich w tym wierszu. Dociąga je
        // (i poprawia wyliczony wyżej status) `attach_partial_closes` - jednym zapytaniem dla
        // całej listy transakcji, żeby nie robić zapytania na każdą z osobna.
        partial_closes: Vec::new(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

/// Wynik ostateczny do zapisu. Ręczna korekta wyniku została usunięta z interfejsu (sekcja 6.4),
/// więc `pnl_override` z formularza jest zawsze `None` i wynik liczy silnik z danych transakcji
/// i kosztów. Gałąź `Some` zostaje wyłącznie po to, żeby ewentualny zapis pochodzący spoza UI
/// (albo test) zachował się przewidywalnie - w normalnym użyciu nigdy nie jest osiągana.
struct ResolvedPnl {
    gross_pnl: Option<Decimal>,
    net_pnl: Option<Decimal>,
    pnl_source: PnlSource,
    pnl_override_reason: Option<String>,
}

fn resolve_pnl(write: &TradeWrite) -> ResolvedPnl {
    match &write.input.pnl_override {
        Some(override_) => ResolvedPnl {
            gross_pnl: write.calculation.gross_pnl,
            net_pnl: Some(override_.net_pnl),
            pnl_source: PnlSource::ManualOverride,
            pnl_override_reason: Some(override_.reason.clone()),
        },
        None => ResolvedPnl {
            gross_pnl: write.calculation.gross_pnl,
            net_pnl: write.calculation.net_pnl,
            pnl_source: PnlSource::Auto,
            pnl_override_reason: None,
        },
    }
}

fn opt_decimal_str(value: Option<Decimal>) -> Option<String> {
    value.map(|v| v.to_string())
}

fn opt_datetime(value: Option<DateTime<Utc>>) -> Option<String> {
    value.map(|v| v.to_rfc3339())
}

impl TradeRepository for SqliteTradeRepository {
    fn create(&self, write: &TradeWrite) -> Result<Trade, AppError> {
        write.input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let id = Uuid::now_v7().to_string();
        let now = Utc::now();
        let next_display_number: i64 = tx.query_row(
            "SELECT COALESCE(MAX(display_number), 0) + 1 FROM trades WHERE account_id = ?1",
            [&write.input.account_id],
            |row| row.get(0),
        )?;
        let pnl = resolve_pnl(write);

        tx.execute(
            "INSERT INTO trades (
                id, account_id, display_number, instrument_id, instrument_spec_snapshot,
                strategy_id, strategy_snapshot, status, side, opened_at, closed_at, interval,
                interval_id, session, volume, entry_price, stop_loss, take_profit, exit_price,
                commission, swap, other_fees, gross_pnl, net_pnl, pnl_points, pnl_percent, pnl_r,
                risk_amount, risk_percent, plan_before, management_notes, post_trade_summary,
                conclusion, tags, plan_adherence_rating, pnl_source, pnl_override_reason,
                conversion_rate, emotions_json, checklist_json, created_at, updated_at, deleted_at
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34,
                ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?41, NULL
             )",
            rusqlite::params![
                id,
                write.input.account_id,
                next_display_number,
                write.input.instrument_id,
                json_opt(&write.instrument_snapshot),
                write.input.strategy_id,
                json_opt(&write.strategy_snapshot),
                write.input.compute_status().as_db_str(),
                write.input.side.as_db_str(),
                opt_datetime(write.input.opened_at),
                opt_datetime(write.input.closed_at),
                write.interval_snapshot,
                write.input.interval_id,
                write.input.session,
                opt_decimal_str(write.input.volume),
                opt_decimal_str(write.input.entry_price),
                opt_decimal_str(write.input.stop_loss),
                opt_decimal_str(write.input.take_profit),
                opt_decimal_str(write.input.exit_price),
                write.input.commission.to_string(),
                write.input.swap.to_string(),
                write.input.other_fees.to_string(),
                opt_decimal_str(pnl.gross_pnl),
                opt_decimal_str(pnl.net_pnl),
                opt_decimal_str(write.calculation.pnl_points),
                opt_decimal_str(write.calculation.pnl_percent),
                opt_decimal_str(write.calculation.pnl_r),
                opt_decimal_str(write.calculation.risk_amount),
                opt_decimal_str(write.calculation.risk_percent),
                write.input.plan_before,
                write.input.management_notes,
                write.input.post_trade_summary,
                write.input.conclusion,
                // Nowe transakcje nigdy nie dostają tagów - formularz nie ma już tego pola
                // (sekcja "Usunięcie tagów z transakcji"). Stara kolumna zostaje wyłącznie po
                // to, żeby historyczne dane pozostały czytelne w eksporcie/diagnostyce.
                tags_json(&[]),
                write.input.plan_adherence_rating,
                pnl.pnl_source.as_db_str(),
                pnl.pnl_override_reason,
                opt_decimal_str(write.input.conversion_rate),
                json_opt(&write.input.emotions),
                json_opt(&write.input.checklist),
                now.to_rfc3339(),
            ],
        )?;
        replace_partial_closes(&tx, &id, &write.input.partial_closes, &now.to_rfc3339())?;
        tx.commit()?;
        drop(conn);

        self.get(&id)
    }

    fn get(&self, id: &str) -> Result<Trade, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let trade = conn
            .query_row(
                &format!("SELECT {SELECT_COLUMNS} FROM trades WHERE id = ?1"),
                [id],
                map_row,
            )
            .optional()?;
        let mut trade = vec![trade
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono transakcji o id {id}.")))?];
        attach_partial_closes(&conn, &mut trade)?;
        Ok(trade.remove(0))
    }

    fn list(&self, account_id: &str, include_deleted: bool) -> Result<Vec<Trade>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let sql = if include_deleted {
            format!(
                "SELECT {SELECT_COLUMNS} FROM trades WHERE account_id = ?1 ORDER BY display_number DESC"
            )
        } else {
            format!(
                "SELECT {SELECT_COLUMNS} FROM trades WHERE account_id = ?1 AND deleted_at IS NULL \
                 ORDER BY display_number DESC"
            )
        };
        let mut stmt = conn.prepare(&sql)?;
        let mut trades = stmt
            .query_map([account_id], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        // `stmt` pożycza `conn`, a `attach_partial_closes` potrzebuje go dla własnego zapytania.
        drop(stmt);
        attach_partial_closes(&conn, &mut trades)?;
        Ok(trades)
    }

    fn update(
        &self,
        id: &str,
        write: &TradeWrite,
        expected_updated_at: Option<DateTime<Utc>>,
    ) -> Result<Trade, AppError> {
        write.input.validate()?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now();
        let pnl = resolve_pnl(write);
        let expected_updated_at_str = expected_updated_at.map(|ts| ts.to_rfc3339());

        let affected = tx.execute(
            // `tags` celowo nie jest tu aktualizowane - formularz nie ma już tego pola (sekcja
            // "Usunięcie tagów z transakcji"), więc edycja nigdy nie nadpisuje/nie kasuje
            // ewentualnych historycznych tagów zapisanych przed tą zmianą. Warunek na `?39` to
            // wykrywanie konfliktu wersji (sekcja "Tryb odczytu i przycisk Edytuj") - gdy
            // wywołujący poda oczekiwaną `updated_at`, edycja trafiona tylko jeśli nikt inny
            // nie zmienił transakcji od czasu jej wczytania.
            "UPDATE trades SET
                instrument_id = ?1, instrument_spec_snapshot = ?2, strategy_id = ?3,
                strategy_snapshot = ?4, status = ?5, side = ?6, opened_at = ?7, closed_at = ?8,
                interval = ?9, interval_id = ?10, session = ?11, volume = ?12, entry_price = ?13,
                stop_loss = ?14, take_profit = ?15, exit_price = ?16, commission = ?17,
                swap = ?18, other_fees = ?19, gross_pnl = ?20, net_pnl = ?21, pnl_points = ?22,
                pnl_percent = ?23, pnl_r = ?24, risk_amount = ?25, risk_percent = ?26,
                plan_before = ?27, management_notes = ?28, post_trade_summary = ?29,
                conclusion = ?30, plan_adherence_rating = ?31, pnl_source = ?32,
                pnl_override_reason = ?33, conversion_rate = ?34, emotions_json = ?35,
                checklist_json = ?36, updated_at = ?37
             WHERE id = ?38 AND deleted_at IS NULL AND (?39 IS NULL OR updated_at = ?39)",
            rusqlite::params![
                write.input.instrument_id,
                json_opt(&write.instrument_snapshot),
                write.input.strategy_id,
                json_opt(&write.strategy_snapshot),
                write.input.compute_status().as_db_str(),
                write.input.side.as_db_str(),
                opt_datetime(write.input.opened_at),
                opt_datetime(write.input.closed_at),
                write.interval_snapshot,
                write.input.interval_id,
                write.input.session,
                opt_decimal_str(write.input.volume),
                opt_decimal_str(write.input.entry_price),
                opt_decimal_str(write.input.stop_loss),
                opt_decimal_str(write.input.take_profit),
                opt_decimal_str(write.input.exit_price),
                write.input.commission.to_string(),
                write.input.swap.to_string(),
                write.input.other_fees.to_string(),
                opt_decimal_str(pnl.gross_pnl),
                opt_decimal_str(pnl.net_pnl),
                opt_decimal_str(write.calculation.pnl_points),
                opt_decimal_str(write.calculation.pnl_percent),
                opt_decimal_str(write.calculation.pnl_r),
                opt_decimal_str(write.calculation.risk_amount),
                opt_decimal_str(write.calculation.risk_percent),
                write.input.plan_before,
                write.input.management_notes,
                write.input.post_trade_summary,
                write.input.conclusion,
                write.input.plan_adherence_rating,
                pnl.pnl_source.as_db_str(),
                pnl.pnl_override_reason,
                opt_decimal_str(write.input.conversion_rate),
                json_opt(&write.input.emotions),
                json_opt(&write.input.checklist),
                now.to_rfc3339(),
                id,
                expected_updated_at_str,
            ],
        )?;
        if affected == 0 {
            let still_exists: Option<String> = tx
                .query_row(
                    "SELECT updated_at FROM trades WHERE id = ?1 AND deleted_at IS NULL",
                    rusqlite::params![id],
                    |row| row.get(0),
                )
                .optional()?;
            return Err(match still_exists {
                Some(_) => AppError::Conflict(
                    "Transakcja została zmieniona w międzyczasie (np. w innym oknie). Otwórz ją \
                     ponownie, żeby zobaczyć aktualne dane, i wprowadź zmiany jeszcze raz."
                        .to_string(),
                ),
                None => AppError::NotFound(format!("Nie znaleziono transakcji o id {id}.")),
            });
        }
        replace_partial_closes(&tx, id, &write.input.partial_closes, &now.to_rfc3339())?;
        tx.commit()?;
        drop(conn);

        self.get(id)
    }

    fn soft_delete(&self, id: &str) -> Result<Trade, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE trades SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnej transakcji o id {id}."
            )));
        }
        self.get(id)
    }

    fn restore(&self, id: &str) -> Result<Trade, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let now = Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE trades SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NOT NULL",
            rusqlite::params![now, id],
        )?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono usuniętej transakcji o id {id}."
            )));
        }
        self.get(id)
    }

    fn delete_permanently(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;

        let deleted_at: Option<String> = tx
            .query_row("SELECT deleted_at FROM trades WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono transakcji o id {id}.")))?;
        if deleted_at.is_none() {
            return Err(AppError::Validation(
                "Trwale usunąć można tylko usuniętą transakcję - najpierw ją usuń.".to_string(),
            ));
        }

        tx.execute("DELETE FROM attachments WHERE trade_id = ?1", [id])?;
        tx.execute("DELETE FROM trade_executions WHERE trade_id = ?1", [id])?;
        tx.execute("DELETE FROM trade_partial_closes WHERE trade_id = ?1", [id])?;
        tx.execute("DELETE FROM trades WHERE id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    }
}

/// Wpisy dziennika zmian transakcji dzielą tabelę `audit_log` z resztą encji (patrz
/// `sqlite_account_repository.rs::write_audit_log`) - `entity_type = 'trade'`, a `detail`
/// niesie tu, w odróżnieniu od kont, realną treść zmiany (lista pól ze starą/nową wartością),
/// bo to właśnie tego wymaga "lokalny dziennik zmian pól" z karty transakcji.
impl TradeAuditRepository for SqliteTradeRepository {
    fn record_change(
        &self,
        trade_id: &str,
        changes: &[FieldChange],
    ) -> Result<TradeAuditEntry, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let id = Uuid::now_v7().to_string();
        let now = Utc::now();
        let detail = serde_json::to_string(changes)
            .expect("serializacja Vec<FieldChange> do JSON nie może się nie powieść");
        conn.execute(
            "INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, detail)
             VALUES (?1, 'trade', ?2, 'trade.updated', ?3, ?4)",
            rusqlite::params![id, trade_id, now.to_rfc3339(), detail],
        )?;
        Ok(TradeAuditEntry {
            id,
            trade_id: trade_id.to_string(),
            changed_at: now,
            changes: changes.to_vec(),
        })
    }

    fn list_for_trade(&self, trade_id: &str) -> Result<Vec<TradeAuditEntry>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let mut stmt = conn.prepare(
            "SELECT id, occurred_at, detail FROM audit_log
             WHERE entity_type = 'trade' AND entity_id = ?1 AND action = 'trade.updated'
             ORDER BY occurred_at DESC",
        )?;
        let entries = stmt
            .query_map(rusqlite::params![trade_id], |row| {
                let id: String = row.get(0)?;
                let occurred_at: String = row.get(1)?;
                let detail: String = row.get(2)?;
                Ok((id, occurred_at, detail))
            })?
            .map(|row| {
                let (id, occurred_at, detail) = row?;
                let changed_at = DateTime::parse_from_rfc3339(&occurred_at)
                    .map(|dt| dt.with_timezone(&Utc))
                    .map_err(|e| {
                        rusqlite::Error::FromSqlConversionFailure(
                            0,
                            rusqlite::types::Type::Text,
                            Box::new(e),
                        )
                    })?;
                let changes: Vec<FieldChange> = serde_json::from_str(&detail).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
                Ok(TradeAuditEntry {
                    id,
                    trade_id: trade_id.to_string(),
                    changed_at,
                    changes,
                })
            })
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::trade::{TradeInput, TradeStatus};
    use crate::domain::trade_calculations::TradeCalculation;
    use rust_decimal_macros::dec;

    fn repo_with_fresh_db() -> (
        SqliteTradeRepository,
        Arc<Mutex<Connection>>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteTradeRepository::new(conn.clone()), conn, dir)
    }

    fn seed_account(conn: &Mutex<Connection>, id: &str) {
        conn.lock().unwrap().execute(
            "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
             VALUES (?1, 'Konto testowe', 'USD', '10000', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [id],
        ).expect("seed account");
    }

    /// Zwraca id dowolnego instrumentu z fabrycznego katalogu 350 - używane w testach, które
    /// potrzebują tylko poprawnego klucza obcego, a nie konkretnej matematyki instrumentu.
    fn any_instrument_id(conn: &Mutex<Connection>) -> String {
        conn.lock()
            .unwrap()
            .query_row(
                "SELECT id FROM instruments WHERE display_symbol = 'EURUSD'",
                [],
                |row| row.get(0),
            )
            .expect("EURUSD musi istnieć w fabrycznym katalogu")
    }

    fn draft_write(account_id: &str) -> TradeWrite {
        TradeWrite {
            input: TradeInput {
                account_id: account_id.to_string(),
                instrument_id: None,
                strategy_id: None,
                side: TradeSide::Buy,
                opened_at: None,
                closed_at: None,
                interval_id: None,
                session: None,
                volume: None,
                entry_price: None,
                stop_loss: None,
                take_profit: None,
                exit_price: None,
                commission: dec!(0),
                swap: dec!(0),
                other_fees: dec!(0),
                conversion_rate: None,
                plan_before: None,
                management_notes: None,
                post_trade_summary: None,
                conclusion: None,
                plan_adherence_rating: None,
                pnl_override: None,
                emotions: None,
                checklist: None,
                partial_closes: vec![],
            },
            calculation: TradeCalculation::default(),
            instrument_snapshot: None,
            strategy_snapshot: None,
            interval_snapshot: None,
        }
    }

    #[test]
    fn creates_a_draft_with_auto_incrementing_display_number_per_account() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");

        let first = repo.create(&draft_write("acc-1")).expect("create 1");
        let second = repo.create(&draft_write("acc-1")).expect("create 2");

        assert_eq!(first.display_number, 1);
        assert_eq!(second.display_number, 2);
        assert!(
            first.tags.is_empty(),
            "nowe transakcje nigdy nie dostają tagów - pole usunięte z formularza"
        );
        assert_eq!(first.status, TradeStatus::Draft);
    }

    /// Buduje transakcję z kompletem danych otwarcia (czyli taką, która nie jest szkicem),
    /// z zadanym lotem i listą częściowych zamknięć.
    fn open_write_with_partials(
        account_id: &str,
        instrument_id: &str,
        volume: Decimal,
        partial_closes: Vec<PartialClose>,
    ) -> TradeWrite {
        let mut write = draft_write(account_id);
        write.input.instrument_id = Some(instrument_id.to_string());
        write.input.entry_price = Some(dec!(1.10000));
        write.input.volume = Some(volume);
        write.input.opened_at = Some("2026-03-01T10:00:00Z".parse().unwrap());
        write.input.partial_closes = partial_closes;
        write
    }

    #[test]
    fn czesciowe_zamkniecia_przezywaja_zapis_i_odczyt() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let instrument_id = any_instrument_id(&conn);

        let created = repo
            .create(&open_write_with_partials(
                "acc-1",
                &instrument_id,
                dec!(1.0),
                vec![
                    PartialClose {
                        closed_volume: dec!(0.3),
                        realized_pnl: dec!(45.10),
                    },
                    PartialClose {
                        closed_volume: dec!(0.2),
                        realized_pnl: dec!(-12.40),
                    },
                ],
            ))
            .expect("create");

        assert_eq!(created.partial_closes.len(), 2);
        assert_eq!(created.partial_closes[0].closed_volume, dec!(0.3));
        assert_eq!(created.partial_closes[1].realized_pnl, dec!(-12.40));
        assert_eq!(
            created.status,
            TradeStatus::Open,
            "pozostało 0.5 lota, więc pozycja wciąż jest otwarta"
        );

        // Kolejność wpisów musi być stabilna także przy ponownym odczycie z bazy.
        let read_back = repo.get(&created.id).expect("get");
        assert_eq!(read_back.partial_closes, created.partial_closes);

        let listed = repo.list("acc-1", false).expect("list");
        assert_eq!(listed[0].partial_closes.len(), 2);
    }

    #[test]
    fn zamkniecie_calego_lota_czesciowymi_ustawia_status_zamkniety() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let instrument_id = any_instrument_id(&conn);

        let created = repo
            .create(&open_write_with_partials(
                "acc-1",
                &instrument_id,
                dec!(1.0),
                vec![
                    PartialClose {
                        closed_volume: dec!(0.4),
                        realized_pnl: dec!(20),
                    },
                    PartialClose {
                        closed_volume: dec!(0.6),
                        realized_pnl: dec!(-5),
                    },
                ],
            ))
            .expect("create");

        assert_eq!(
            created.status,
            TradeStatus::Closed,
            "pozostały lot 0 domyka transakcję nawet bez ceny i daty zamknięcia"
        );
    }

    #[test]
    fn edycja_zastepuje_wpisy_zamiast_je_dokladac() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let instrument_id = any_instrument_id(&conn);

        let created = repo
            .create(&open_write_with_partials(
                "acc-1",
                &instrument_id,
                dec!(1.0),
                vec![PartialClose {
                    closed_volume: dec!(0.3),
                    realized_pnl: dec!(45),
                }],
            ))
            .expect("create");

        let updated = repo
            .update(
                &created.id,
                &open_write_with_partials(
                    "acc-1",
                    &instrument_id,
                    dec!(1.0),
                    vec![PartialClose {
                        closed_volume: dec!(0.5),
                        realized_pnl: dec!(70),
                    }],
                ),
                None,
            )
            .expect("update");

        assert_eq!(
            updated.partial_closes.len(),
            1,
            "edycja wymienia komplet wpisów - stary nie może zostać obok nowego"
        );
        assert_eq!(updated.partial_closes[0].closed_volume, dec!(0.5));
    }

    #[test]
    fn odrzuca_sume_zamknietych_lotow_wieksza_niz_lot_transakcji() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let instrument_id = any_instrument_id(&conn);

        let result = repo.create(&open_write_with_partials(
            "acc-1",
            &instrument_id,
            dec!(1.0),
            vec![PartialClose {
                closed_volume: dec!(1.5),
                realized_pnl: dec!(10),
            }],
        ));

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn editing_a_trade_never_wipes_legacy_tags_saved_before_the_field_was_removed() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");
        {
            let conn = conn.lock().unwrap();
            conn.execute(
                "UPDATE trades SET tags = '[\"breakout\",\"news\"]' WHERE id = ?1",
                [&created.id],
            )
            .expect("simulate legacy tags predating this field's removal from the form");
        }

        let updated = repo
            .update(&created.id, &draft_write("acc-1"), None)
            .expect("update");

        assert_eq!(
            updated.tags,
            vec!["breakout".to_string(), "news".to_string()],
            "edycja przez nowy formularz (bez pola Tagi) nie może po cichu skasować historycznych tagów"
        );
    }

    #[test]
    fn separate_accounts_number_trades_independently() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        seed_account(&conn, "acc-2");

        let a = repo.create(&draft_write("acc-1")).expect("create acc-1");
        let b = repo.create(&draft_write("acc-2")).expect("create acc-2");

        assert_eq!(a.display_number, 1);
        assert_eq!(b.display_number, 1);
    }

    #[test]
    fn update_recomputes_stored_pnl_fields() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");

        let mut write = draft_write("acc-1");
        write.input.instrument_id = Some(any_instrument_id(&conn));
        write.input.entry_price = Some(dec!(1.1));
        write.input.exit_price = Some(dec!(1.15));
        write.input.volume = Some(dec!(1));
        write.input.opened_at = Some(Utc::now());
        write.input.closed_at = Some(Utc::now());
        write.calculation = TradeCalculation {
            gross_pnl: Some(dec!(500)),
            net_pnl: Some(dec!(495)),
            pnl_points: Some(dec!(5000)),
            ..TradeCalculation::default()
        };

        let updated = repo.update(&created.id, &write, None).expect("update");
        assert_eq!(updated.status, TradeStatus::Closed);
        assert_eq!(updated.net_pnl, Some(dec!(495)));
        assert_eq!(updated.pnl_source, PnlSource::Auto);
    }

    #[test]
    fn manual_override_takes_precedence_over_calculated_net_pnl() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");

        let mut write = draft_write("acc-1");
        write.input.pnl_override = Some(crate::domain::trade::ManualPnlOverride {
            net_pnl: dec!(123.45),
            reason: "Korekta po weryfikacji wyciągu brokera.".to_string(),
        });
        write.calculation = TradeCalculation {
            net_pnl: Some(dec!(999)),
            ..TradeCalculation::default()
        };

        let updated = repo.update(&created.id, &write, None).expect("update");
        assert_eq!(updated.net_pnl, Some(dec!(123.45)));
        assert_eq!(updated.pnl_source, PnlSource::ManualOverride);
        assert!(updated.pnl_override_reason.is_some());
    }

    #[test]
    fn soft_delete_then_restore_round_trip() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");

        let deleted = repo.soft_delete(&created.id).expect("soft delete");
        assert!(deleted.deleted_at.is_some());
        assert!(repo
            .list("acc-1", false)
            .expect("list active")
            .iter()
            .all(|t| t.id != created.id));
        assert!(repo
            .list("acc-1", true)
            .expect("list all")
            .iter()
            .any(|t| t.id == created.id));

        let restored = repo.restore(&created.id).expect("restore");
        assert!(restored.deleted_at.is_none());
    }

    #[test]
    fn delete_permanently_rejects_a_trade_that_is_not_soft_deleted() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");

        let result = repo.delete_permanently(&created.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_permanently_removes_a_soft_deleted_trade_and_its_executions() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO trade_executions (id, trade_id, kind, price, volume, executed_at, created_at)
                 VALUES ('exec-1', ?1, 'entry', '1', '1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [&created.id],
            )
            .expect("insert execution");
        repo.soft_delete(&created.id).expect("soft delete");

        repo.delete_permanently(&created.id).expect("purge");

        assert!(matches!(repo.get(&created.id), Err(AppError::NotFound(_))));
        let execution_count: i64 = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM trade_executions WHERE trade_id = ?1",
                [&created.id],
                |row| row.get(0),
            )
            .expect("count executions");
        assert_eq!(execution_count, 0);
    }

    #[test]
    fn update_rejects_a_soft_deleted_trade() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");
        repo.soft_delete(&created.id).expect("soft delete");

        let result = repo.update(&created.id, &draft_write("acc-1"), None);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn update_rejects_a_stale_expected_updated_at_as_a_conflict() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");
        let stale_updated_at = created.updated_at;

        // Symulujemy zmianę wprowadzoną w międzyczasie (np. w innym oknie) - ta aktualizacja
        // przechodzi bez kontroli wersji, więc `updated_at` w bazie idzie do przodu.
        repo.update(&created.id, &draft_write("acc-1"), None)
            .expect("first update succeeds");

        let result = repo.update(&created.id, &draft_write("acc-1"), Some(stale_updated_at));
        assert!(matches!(result, Err(AppError::Conflict(_))));
    }

    #[test]
    fn update_succeeds_when_expected_updated_at_matches_current_value() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let created = repo.create(&draft_write("acc-1")).expect("create");

        let result = repo.update(&created.id, &draft_write("acc-1"), Some(created.updated_at));
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_invalid_input_before_touching_the_database() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");

        let mut write = draft_write("acc-1");
        // Sama data zamknięcia bez reszty danych pozycji (instrument/cena wejścia/wolumen) jest
        // nieprawidłowa - to jedyny sposób na wywołanie błędu walidacji w nowym modelu, gdzie
        // status nie jest już polem wybieranym przez użytkownika.
        write.input.closed_at = Some(Utc::now());

        let result = repo.create(&write);
        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(repo.list("acc-1", true).expect("list").is_empty());
    }

    /// Obowiązkowy test z sekcji 9: „przywrócenie transakcji z kosza odtwarza częściowe
    /// zamknięcia". Miękkie usunięcie ustawia tylko `deleted_at` i nie rusza osobnej tabeli
    /// wpisów - to założenie musi być pilnowane, bo przy zmianie sposobu usuwania łatwo je
    /// zgubić razem z danymi użytkownika.
    #[test]
    fn przywrocenie_transakcji_z_kosza_odtwarza_czesciowe_zamkniecia() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let instrument_id = any_instrument_id(&conn);

        let created = repo
            .create(&open_write_with_partials(
                "acc-1",
                &instrument_id,
                dec!(1.0),
                vec![
                    PartialClose {
                        closed_volume: dec!(0.3),
                        realized_pnl: dec!(45),
                    },
                    PartialClose {
                        closed_volume: dec!(0.2),
                        realized_pnl: dec!(-12),
                    },
                ],
            ))
            .expect("create");

        repo.soft_delete(&created.id).expect("do kosza");
        let restored = repo.restore(&created.id).expect("przywrócenie");

        assert_eq!(restored.partial_closes, created.partial_closes);
        assert_eq!(restored.status, TradeStatus::Open, "pozostało 0.5 lota");
        assert!(restored.deleted_at.is_none());
    }
}
