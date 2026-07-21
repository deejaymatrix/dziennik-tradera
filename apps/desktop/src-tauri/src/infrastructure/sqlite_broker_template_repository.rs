use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, Transaction};
use uuid::Uuid;

use crate::domain::broker_template::{
    BrokerTemplate, BrokerTemplateRepository, NewTemplate, TemplateSource,
};
use crate::error::AppError;

pub struct SqliteBrokerTemplateRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteBrokerTemplateRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const SELECT: &str = "SELECT t.id, t.name, t.broker_name, t.account_type, t.source, \
    t.import_format_version, t.account_id, t.created_at, t.updated_at, t.archived_at, \
    (SELECT count(*) FROM instruments i WHERE i.template_id = t.id) AS instrument_count \
    FROM broker_instrument_templates t";

fn map_row(row: &Row) -> rusqlite::Result<BrokerTemplate> {
    let source: String = row.get("source")?;
    Ok(BrokerTemplate {
        id: row.get("id")?,
        name: row.get("name")?,
        broker_name: row.get("broker_name")?,
        account_type: row.get("account_type")?,
        source: TemplateSource::from_db_str(&source),
        import_format_version: row.get("import_format_version")?,
        account_id: row.get("account_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
        instrument_count: row.get("instrument_count")?,
    })
}

fn name_conflict_as_validation(err: rusqlite::Error, name: &str) -> AppError {
    if let rusqlite::Error::SqliteFailure(sql_err, _) = &err {
        if sql_err.code == rusqlite::ErrorCode::ConstraintViolation {
            return AppError::Validation(format!(
                "Szablon o nazwie \"{name}\" już istnieje - wybierz inną nazwę."
            ));
        }
    }
    err.into()
}

/// Lista kolumn tabeli poza wykluczonymi - do głębokiej kopii wierszy bez ręcznego
/// utrzymywania listy kolumn (schemat instrumentów ma dziesiątki pól i rośnie w migracjach).
fn columns_except(
    tx: &Transaction,
    table: &str,
    exclude: &[&str],
) -> Result<Vec<String>, AppError> {
    let mut stmt = tx.prepare(&format!("PRAGMA table_info({table})"))?;
    let all = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(all
        .into_iter()
        .filter(|c| !exclude.contains(&c.as_str()))
        .collect())
}

impl BrokerTemplateRepository for SqliteBrokerTemplateRepository {
    fn list(&self, include_archived: bool) -> Result<Vec<BrokerTemplate>, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let sql = if include_archived {
            format!("{SELECT} ORDER BY t.created_at")
        } else {
            format!("{SELECT} WHERE t.archived_at IS NULL ORDER BY t.created_at")
        };
        let mut stmt = conn.prepare(&sql)?;
        let templates = stmt
            .query_map([], map_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(templates)
    }

    fn get(&self, id: &str) -> Result<BrokerTemplate, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        conn.query_row(&format!("{SELECT} WHERE t.id = ?1"), [id], map_row)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono szablonu o id {id}.")))
    }

    fn create(&self, input: &NewTemplate) -> Result<BrokerTemplate, AppError> {
        input.validate()?;
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO broker_instrument_templates
                 (id, name, broker_name, account_type, source, import_format_version, account_id, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, 'user_created', NULL, NULL, ?5, ?5, NULL)",
            rusqlite::params![id, input.name.trim(), input.broker_name.trim(), input.account_type, now],
        )
        .map_err(|e| name_conflict_as_validation(e, input.name.trim()))?;
        drop(conn);
        self.get(&id)
    }

    fn rename(&self, id: &str, name: &str) -> Result<BrokerTemplate, AppError> {
        if name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa szablonu nie może być pusta.".to_string(),
            ));
        }
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn
            .execute(
                "UPDATE broker_instrument_templates SET name = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![name.trim(), Utc::now().to_rfc3339(), id],
            )
            .map_err(|e| name_conflict_as_validation(e, name.trim()))?;
        drop(conn);
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono szablonu o id {id}."
            )));
        }
        self.get(id)
    }

    fn duplicate(&self, id: &str, new_name: &str) -> Result<BrokerTemplate, AppError> {
        if new_name.trim().is_empty() {
            return Err(AppError::Validation(
                "Nazwa szablonu nie może być pusta.".to_string(),
            ));
        }
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();
        let new_template_id = Uuid::now_v7().to_string();

        let exists: i64 = tx.query_row(
            "SELECT count(*) FROM broker_instrument_templates WHERE id = ?1",
            [id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono szablonu o id {id}."
            )));
        }

        // Kopia nagłówka szablonu: source = 'duplicated', bez przypisanego konta.
        tx.execute(
            "INSERT INTO broker_instrument_templates
                 (id, name, broker_name, account_type, source, import_format_version, account_id, created_at, updated_at, archived_at)
             SELECT ?1, ?2, broker_name, account_type, 'duplicated', import_format_version, NULL, ?3, ?3, NULL
             FROM broker_instrument_templates WHERE id = ?4",
            rusqlite::params![new_template_id, new_name.trim(), now, id],
        )
        .map_err(|e| name_conflict_as_validation(e, new_name.trim()))?;

        // Głęboka kopia instrumentów: lista kolumn brana dynamicznie z PRAGMA, żeby kopia nie
        // rozjechała się cicho z przyszłymi migracjami dodającymi kolumny.
        let instrument_cols =
            columns_except(&tx, "instruments", &["id", "template_id"])?.join(", ");
        let old_instrument_ids: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM instruments WHERE template_id = ?1")?;
            let ids = stmt
                .query_map([id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            ids
        };
        let version_cols =
            columns_except(&tx, "instrument_versions", &["id", "instrument_id"])?.join(", ");
        for old_id in &old_instrument_ids {
            let new_id = Uuid::now_v7().to_string();
            tx.execute(
                &format!(
                    "INSERT INTO instruments (id, template_id, {instrument_cols})
                     SELECT ?1, ?2, {instrument_cols} FROM instruments WHERE id = ?3"
                ),
                rusqlite::params![new_id, new_template_id, old_id],
            )?;
            // Tylko AKTYWNA rewizja parametrów - kopia zaczyna własną historię od wersji 1.
            tx.execute(
                &format!(
                    "INSERT INTO instrument_versions (id, instrument_id, {version_cols})
                     SELECT ?1, ?2, {version_cols} FROM instrument_versions
                     WHERE instrument_id = ?3 AND is_active = 1"
                ),
                rusqlite::params![Uuid::now_v7().to_string(), new_id, old_id],
            )?;
            tx.execute(
                "INSERT INTO instrument_preferences (instrument_id, is_visible, sort_order, is_favorite)
                 SELECT ?1, is_visible, sort_order, is_favorite FROM instrument_preferences WHERE instrument_id = ?2",
                rusqlite::params![new_id, old_id],
            )?;
        }

        tx.commit()?;
        drop(conn);
        self.get(&new_template_id)
    }

    fn assign_to_account(&self, template_id: &str, account_id: &str) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();

        let assigned_to: Option<Option<String>> = tx
            .query_row(
                "SELECT account_id FROM broker_instrument_templates WHERE id = ?1 AND archived_at IS NULL",
                [template_id],
                |r| r.get(0),
            )
            .optional()?;
        let Some(current_assignment) = assigned_to else {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnego szablonu o id {template_id}."
            )));
        };
        if let Some(other_account) = &current_assignment {
            if other_account != account_id {
                return Err(AppError::Validation(
                    "Ten szablon jest już przypisany do innego konta - najpierw utwórz jego kopię (Duplikuj szablon).".to_string(),
                ));
            }
            tx.commit()?;
            return Ok(());
        }

        // Atomowe "Zastąp szablon konta": odpięcie dotychczasowego + przypięcie nowego.
        tx.execute(
            "UPDATE broker_instrument_templates SET account_id = NULL, updated_at = ?1 WHERE account_id = ?2",
            rusqlite::params![now, account_id],
        )?;
        tx.execute(
            "UPDATE broker_instrument_templates SET account_id = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![account_id, now, template_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    fn unassign(&self, template_id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn.execute(
            "UPDATE broker_instrument_templates SET account_id = NULL, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![Utc::now().to_rfc3339(), template_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono szablonu o id {template_id}."
            )));
        }
        Ok(())
    }

    fn archive(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let assigned: Option<Option<String>> = conn
            .query_row(
                "SELECT account_id FROM broker_instrument_templates WHERE id = ?1 AND archived_at IS NULL",
                [id],
                |r| r.get(0),
            )
            .optional()?;
        let Some(account_id) = assigned else {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono aktywnego szablonu o id {id}."
            )));
        };
        if account_id.is_some() {
            return Err(AppError::Validation(
                "Szablon jest przypisany do konta - najpierw zastąp szablon tego konta innym."
                    .to_string(),
            ));
        }
        let active_count: i64 = conn.query_row(
            "SELECT count(*) FROM broker_instrument_templates WHERE archived_at IS NULL",
            [],
            |r| r.get(0),
        )?;
        if active_count <= 1 {
            return Err(AppError::Validation(
                "Nie można usunąć ostatniego aktywnego szablonu - aplikacja musi mieć co najmniej jeden.".to_string(),
            ));
        }
        conn.execute(
            "UPDATE broker_instrument_templates SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    }

    fn restore(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn
            .execute(
                "UPDATE broker_instrument_templates SET archived_at = NULL, updated_at = ?1
                 WHERE id = ?2 AND archived_at IS NOT NULL",
                rusqlite::params![Utc::now().to_rfc3339(), id],
            )
            .map_err(|e| {
                if let rusqlite::Error::SqliteFailure(sql_err, _) = &e {
                    if sql_err.code == rusqlite::ErrorCode::ConstraintViolation {
                        return AppError::Validation(
                            "Aktywny szablon o tej nazwie już istnieje - zmień nazwę jednego z nich przed przywróceniem.".to_string(),
                        );
                    }
                }
                e.into()
            })?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono zarchiwizowanego szablonu o id {id}."
            )));
        }
        Ok(())
    }

    fn delete_permanently(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let archived_at: Option<Option<String>> = tx
            .query_row(
                "SELECT archived_at FROM broker_instrument_templates WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .optional()?;
        let Some(archived_at) = archived_at else {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono szablonu o id {id}."
            )));
        };
        if archived_at.is_none() {
            return Err(AppError::Validation(
                "Trwale usunąć można tylko szablon z Kosza - najpierw go tam przenieś.".to_string(),
            ));
        }

        // Transakcje historyczne zachowują zamrożone migawki (instrument_spec_snapshot w
        // wierszu transakcji) - zerujemy tylko żywe odniesienie, żeby FK nie zablokował
        // usunięcia i żadna migawka nie zginęła.
        tx.execute(
            "UPDATE trades SET instrument_id = NULL
             WHERE instrument_id IN (SELECT id FROM instruments WHERE template_id = ?1)",
            [id],
        )?;
        tx.execute(
            "DELETE FROM instrument_preferences
             WHERE instrument_id IN (SELECT id FROM instruments WHERE template_id = ?1)",
            [id],
        )?;
        tx.execute(
            "DELETE FROM instrument_versions
             WHERE instrument_id IN (SELECT id FROM instruments WHERE template_id = ?1)",
            [id],
        )?;
        tx.execute("DELETE FROM instruments WHERE template_id = ?1", [id])?;
        tx.execute(
            "DELETE FROM broker_instrument_templates WHERE id = ?1",
            [id],
        )?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};

    fn repo_with_fresh_db() -> (
        SqliteBrokerTemplateRepository,
        Arc<Mutex<Connection>>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        let conn = Arc::new(Mutex::new(conn));
        (SqliteBrokerTemplateRepository::new(conn.clone()), conn, dir)
    }

    fn seed_account(conn: &Arc<Mutex<Connection>>, id: &str) {
        conn.lock()
            .unwrap()
            .execute(
                "INSERT INTO accounts (id, name, currency, initial_balance, created_at, updated_at)
             VALUES (?1, 'Konto', 'USD', '1000', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [id],
            )
            .expect("seed account");
    }

    fn quomarkets(repo: &SqliteBrokerTemplateRepository) -> BrokerTemplate {
        repo.list(false)
            .expect("list")
            .into_iter()
            .find(|t| t.name == "QuoMarkets RAW")
            .expect("szablon startowy istnieje")
    }

    #[test]
    fn migration_seeds_quomarkets_raw_with_all_350_instruments() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let template = quomarkets(&repo);
        assert_eq!(template.instrument_count, 350);
        assert_eq!(template.source, TemplateSource::BrokerImport);
        assert_eq!(template.account_id, None, "świeża baza nie ma kont");
    }

    #[test]
    fn create_rejects_duplicate_name_among_active_templates() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let result = repo.create(&NewTemplate {
            name: "QuoMarkets RAW".into(),
            broker_name: "X".into(),
            account_type: None,
        });
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn duplicate_makes_a_deep_independent_copy() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        let original = quomarkets(&repo);
        let copy = repo
            .duplicate(&original.id, "IC Markets RAW")
            .expect("duplicate");
        assert_eq!(copy.instrument_count, 350);
        assert_eq!(copy.source, TemplateSource::Duplicated);
        assert_eq!(copy.account_id, None);

        // Zmiana instrumentu w kopii nie dotyka oryginału (izolacja parametrów).
        conn.lock()
            .unwrap()
            .execute(
                "UPDATE instruments SET display_symbol = 'ZMIENIONY'
             WHERE template_id = ?1 AND display_symbol = 'EURUSD'",
                [&copy.id],
            )
            .expect("update copy");
        let original_still_there: i64 = conn.lock().unwrap().query_row(
            "SELECT count(*) FROM instruments WHERE template_id = ?1 AND display_symbol = 'EURUSD'",
            [&original.id], |r| r.get(0),
        ).expect("count");
        assert_eq!(original_still_there, 1);

        // Kopia przenosi tylko AKTYWNE rewizje - po jednej na instrument.
        let copy_versions: i64 = conn.lock().unwrap().query_row(
            "SELECT count(*) FROM instrument_versions v JOIN instruments i ON i.id = v.instrument_id
             WHERE i.template_id = ?1", [&copy.id], |r| r.get(0),
        ).expect("count versions");
        assert_eq!(copy_versions, 350);
    }

    #[test]
    fn assign_replaces_the_accounts_previous_template_atomically() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let first = quomarkets(&repo);
        repo.assign_to_account(&first.id, "acc-1")
            .expect("assign first");
        assert_eq!(
            repo.get(&first.id).unwrap().account_id,
            Some("acc-1".into())
        );

        let second = repo
            .duplicate(&first.id, "Drugi szablon")
            .expect("duplicate");
        repo.assign_to_account(&second.id, "acc-1")
            .expect("replace");
        assert_eq!(
            repo.get(&second.id).unwrap().account_id,
            Some("acc-1".into())
        );
        assert_eq!(
            repo.get(&first.id).unwrap().account_id,
            None,
            "stary odpięty"
        );
    }

    #[test]
    fn assign_rejects_a_template_already_bound_to_another_account() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        seed_account(&conn, "acc-2");
        let template = quomarkets(&repo);
        repo.assign_to_account(&template.id, "acc-1")
            .expect("assign");
        let result = repo.assign_to_account(&template.id, "acc-2");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn archive_guards_last_active_and_assigned_templates() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        let template = quomarkets(&repo);
        assert!(
            matches!(repo.archive(&template.id), Err(AppError::Validation(_))),
            "ostatni aktywny szablon nie do usunięcia"
        );

        let copy = repo.duplicate(&template.id, "Zapasowy").expect("duplicate");
        seed_account(&conn, "acc-1");
        repo.assign_to_account(&template.id, "acc-1")
            .expect("assign");
        assert!(
            matches!(repo.archive(&template.id), Err(AppError::Validation(_))),
            "przypisany szablon nie do usunięcia"
        );

        repo.archive(&copy.id)
            .expect("nieprzypisany i nieostatni - można");
        assert!(repo.get(&copy.id).unwrap().archived_at.is_some());
    }

    #[test]
    fn restore_rejects_name_conflict_with_an_active_template() {
        let (repo, _conn, _dir) = repo_with_fresh_db();
        let original = quomarkets(&repo);
        let copy = repo.duplicate(&original.id, "Kopia").expect("duplicate");
        repo.archive(&copy.id).expect("archive");
        repo.create(&NewTemplate {
            name: "Kopia".into(),
            broker_name: "Y".into(),
            account_type: None,
        })
        .expect("nazwa wolna po archiwizacji");
        assert!(matches!(
            repo.restore(&copy.id),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn delete_permanently_unlinks_trades_but_keeps_their_rows_and_snapshots() {
        let (repo, conn, _dir) = repo_with_fresh_db();
        seed_account(&conn, "acc-1");
        let original = quomarkets(&repo);
        let copy = repo
            .duplicate(&original.id, "Do skasowania")
            .expect("duplicate");

        let instrument_id: String = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT id FROM instruments WHERE template_id = ?1 LIMIT 1",
                [&copy.id],
                |r| r.get(0),
            )
            .expect("instrument z kopii");
        conn.lock().unwrap().execute(
            "INSERT INTO trades (id, account_id, display_number, instrument_id, status, side, created_at, updated_at)
             VALUES ('trade-1', 'acc-1', 1, ?1, 'draft', 'buy', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [&instrument_id],
        ).expect("seed trade");

        assert!(
            matches!(
                repo.delete_permanently(&copy.id),
                Err(AppError::Validation(_))
            ),
            "tylko zarchiwizowany szablon"
        );
        repo.archive(&copy.id).expect("archive");
        repo.delete_permanently(&copy.id).expect("purge");

        let (trade_count, unlinked): (i64, Option<String>) = conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*), max(instrument_id) FROM trades WHERE id = 'trade-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .expect("trade survives");
        assert_eq!(trade_count, 1);
        assert_eq!(unlinked, None);
        assert!(matches!(repo.get(&copy.id), Err(AppError::NotFound(_))));
    }
}
