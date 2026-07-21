use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row, Transaction};
use uuid::Uuid;

use crate::domain::trading_rules::{
    normalize_question, TradingRule, TradingRuleCategory, TradingRulesRepository,
    TradingRulesState, TradingRulesWrite,
};
use crate::error::AppError;

pub struct SqliteTradingRulesRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteTradingRulesRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const CATEGORY_COLUMNS: &str = "id, name, is_builtin, sort_order, created_at, updated_at";
const RULE_COLUMNS: &str = "id, category_id, question, answer, is_builtin, template_question, \
                            hidden, sort_order, created_at, updated_at, archived_at";

fn map_category(row: &Row) -> rusqlite::Result<TradingRuleCategory> {
    Ok(TradingRuleCategory {
        id: row.get("id")?,
        name: row.get("name")?,
        is_builtin: row.get::<_, i64>("is_builtin")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn map_rule(row: &Row) -> rusqlite::Result<TradingRule> {
    Ok(TradingRule {
        id: row.get("id")?,
        category_id: row.get("category_id")?,
        question: row.get("question")?,
        answer: row.get("answer")?,
        is_builtin: row.get::<_, i64>("is_builtin")? != 0,
        template_question: row.get("template_question")?,
        hidden: row.get::<_, i64>("hidden")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

fn read_state(conn: &Connection) -> Result<TradingRulesState, AppError> {
    let mut cat_stmt = conn.prepare(&format!(
        "SELECT {CATEGORY_COLUMNS} FROM trading_rule_categories ORDER BY sort_order"
    ))?;
    let categories = cat_stmt
        .query_map([], map_category)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut rule_stmt = conn.prepare(&format!(
        "SELECT {RULE_COLUMNS} FROM trading_rules ORDER BY category_id, sort_order"
    ))?;
    let rules = rule_stmt
        .query_map([], map_rule)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(TradingRulesState { categories, rules })
}

/// Autorytatywna kontrola duplikatów przy zapisie (sekcja "Usuwanie powtórzeń"): dwa pytania o
/// identycznej znormalizowanej treści w tej samej kategorii są odrzucane - frontend ostrzega
/// wcześniej i proponuje scalenie, ale to backend gwarantuje regułę.
fn reject_duplicate_questions(write: &TradingRulesWrite) -> Result<(), AppError> {
    let mut seen: std::collections::HashSet<(usize, String)> = std::collections::HashSet::new();
    for rule in &write.rules {
        if rule.archived {
            continue;
        }
        let key = (rule.category_index, normalize_question(&rule.question));
        if !seen.insert(key) {
            return Err(AppError::Validation(format!(
                "Pytanie \"{}\" występuje w tej kategorii więcej niż raz - połącz je albo zmień \
                 treść jednego z nich.",
                rule.question.trim()
            )));
        }
    }
    Ok(())
}

fn apply_write(tx: &Transaction, write: &TradingRulesWrite) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();

    // 1. Kategorie: aktualizacja istniejących / wstawienie nowych; kolejność = pozycja na liście.
    let mut category_ids: Vec<String> = Vec::with_capacity(write.categories.len());
    for (index, category) in write.categories.iter().enumerate() {
        match &category.id {
            Some(id) => {
                let affected = tx.execute(
                    "UPDATE trading_rule_categories SET name = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4",
                    rusqlite::params![category.name.trim(), index as i64, now, id],
                )?;
                if affected == 0 {
                    return Err(AppError::NotFound(format!(
                        "Nie znaleziono kategorii o id {id}."
                    )));
                }
                category_ids.push(id.clone());
            }
            None => {
                let id = Uuid::now_v7().to_string();
                tx.execute(
                    "INSERT INTO trading_rule_categories (id, name, is_builtin, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, 0, ?3, ?4, ?4)",
                    rusqlite::params![id, category.name.trim(), index as i64, now],
                )?;
                category_ids.push(id);
            }
        }
    }

    // 2. Pytania nieobecne na liście zapisu zostały usunięte w trybie edycji - ale NIGDY nie
    // kasujemy w ten sposób pytań zarchiwizowanych (są w Koszu, nie w formularzu; ich trwałe
    // usunięcie należy wyłącznie do Kosza).
    let kept_ids: Vec<String> = write.rules.iter().filter_map(|r| r.id.clone()).collect();
    let placeholders = std::iter::repeat_n("?", kept_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let delete_sql = if kept_ids.is_empty() {
        "DELETE FROM trading_rules WHERE archived_at IS NULL".to_string()
    } else {
        format!(
            "DELETE FROM trading_rules WHERE archived_at IS NULL AND id NOT IN ({placeholders})"
        )
    };
    tx.execute(&delete_sql, rusqlite::params_from_iter(kept_ids.iter()))?;

    // 3. Pytania: aktualizacja/wstawienie, kolejność per kategoria z pozycji na liście.
    let mut per_category_order: std::collections::HashMap<usize, i64> =
        std::collections::HashMap::new();
    for rule in &write.rules {
        let order_slot = per_category_order.entry(rule.category_index).or_insert(0);
        let sort_order = *order_slot;
        *order_slot += 1;
        let category_id = &category_ids[rule.category_index];
        let answer = rule
            .answer
            .as_deref()
            .map(str::trim)
            .filter(|a| !a.is_empty());
        let archived_at_value: Option<String> = rule.archived.then(|| now.clone());

        match &rule.id {
            Some(id) => {
                // `archived_at = COALESCE(archived_at, ?)`: świeża archiwizacja dostaje datę
                // teraz, ale ponowny zapis już zarchiwizowanego pytania nie przesuwa jej.
                let affected = tx.execute(
                    "UPDATE trading_rules SET category_id = ?1, question = ?2, answer = ?3, hidden = ?4,
                         sort_order = ?5, updated_at = ?6,
                         archived_at = CASE WHEN ?7 THEN COALESCE(archived_at, ?6) ELSE NULL END
                     WHERE id = ?8",
                    rusqlite::params![
                        category_id,
                        rule.question.trim(),
                        answer,
                        rule.hidden as i64,
                        sort_order,
                        now,
                        rule.archived,
                        id
                    ],
                )?;
                if affected == 0 {
                    return Err(AppError::NotFound(format!(
                        "Nie znaleziono pytania o id {id}."
                    )));
                }
            }
            None => {
                tx.execute(
                    "INSERT INTO trading_rules (id, category_id, question, answer, is_builtin, template_question, hidden, sort_order, created_at, updated_at, archived_at)
                     VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, ?6, ?7, ?7, ?8)",
                    rusqlite::params![
                        Uuid::now_v7().to_string(),
                        category_id,
                        rule.question.trim(),
                        answer,
                        rule.hidden as i64,
                        sort_order,
                        now,
                        archived_at_value
                    ],
                )?;
            }
        }
    }
    Ok(())
}

impl TradingRulesRepository for SqliteTradingRulesRepository {
    fn get(&self) -> Result<TradingRulesState, AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        read_state(&conn)
    }

    fn save(&self, write: &TradingRulesWrite) -> Result<TradingRulesState, AppError> {
        write.validate()?;
        reject_duplicate_questions(write)?;

        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        apply_write(&tx, write)?;
        tx.commit()?;
        read_state(&conn)
    }

    fn restore_templates(&self) -> Result<TradingRulesState, AppError> {
        let mut conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();
        // Odtwarza pytania wbudowane: treść wraca do szablonu, ukrycie/archiwizacja są cofane.
        // Odpowiedzi (`answer`) i pytania własne użytkownika pozostają NIETKNIĘTE.
        tx.execute(
            "UPDATE trading_rules SET question = template_question, hidden = 0, archived_at = NULL, updated_at = ?1
             WHERE is_builtin = 1 AND template_question IS NOT NULL
               AND (question != template_question OR hidden != 0 OR archived_at IS NOT NULL)",
            [&now],
        )?;
        tx.commit()?;
        read_state(&conn)
    }

    fn restore_rule(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let affected = conn.execute(
            "UPDATE trading_rules SET archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND archived_at IS NOT NULL",
            rusqlite::params![Utc::now().to_rfc3339(), id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Nie znaleziono zarchiwizowanego pytania o id {id}."
            )));
        }
        Ok(())
    }

    fn delete_rule_permanently(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .expect("mutex bazy danych zatruty (poprzedni panik)");
        let archived_at: Option<String> = conn
            .query_row(
                "SELECT archived_at FROM trading_rules WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono pytania o id {id}.")))?;
        if archived_at.is_none() {
            return Err(AppError::Validation(
                "Trwale usunąć można tylko zarchiwizowane pytanie - najpierw je zarchiwizuj."
                    .to_string(),
            ));
        }
        conn.execute("DELETE FROM trading_rules WHERE id = ?1", [id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection, migrations};
    use crate::domain::trading_rules::{TradingRuleCategoryWrite, TradingRuleWrite};

    fn repo_with_fresh_db() -> (SqliteTradingRulesRepository, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut conn = connection::open(&dir.path().join("db.sqlite3")).expect("open");
        migrations::run_migrations(&mut conn, &dir.path().join("backups")).expect("migrate");
        (
            SqliteTradingRulesRepository::new(Arc::new(Mutex::new(conn))),
            dir,
        )
    }

    /// Buduje zapis 1:1 z aktualnego stanu (nic nie zmienia) - punkt wyjścia dla testów.
    fn write_from_state(state: &TradingRulesState) -> TradingRulesWrite {
        TradingRulesWrite {
            categories: state
                .categories
                .iter()
                .map(|c| TradingRuleCategoryWrite {
                    id: Some(c.id.clone()),
                    name: c.name.clone(),
                })
                .collect(),
            rules: state
                .rules
                .iter()
                .filter(|r| r.archived_at.is_none())
                .map(|r| TradingRuleWrite {
                    id: Some(r.id.clone()),
                    category_index: state
                        .categories
                        .iter()
                        .position(|c| c.id == r.category_id)
                        .expect("kategoria istnieje"),
                    question: r.question.clone(),
                    answer: r.answer.clone(),
                    hidden: r.hidden,
                    archived: false,
                })
                .collect(),
        }
    }

    #[test]
    fn seed_provides_six_builtin_categories_and_forty_template_questions_with_empty_answers() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        assert_eq!(state.categories.len(), 6);
        assert_eq!(state.rules.len(), 40);
        assert!(state.categories.iter().all(|c| c.is_builtin));
        assert!(state
            .rules
            .iter()
            .all(|r| r.is_builtin && r.answer.is_none() && r.template_question.is_some()));
        assert_eq!(state.categories[0].name, "Podstawy");
    }

    #[test]
    fn save_updates_answers_without_touching_anything_else() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let mut write = write_from_state(&state);
        write.rules[0].answer = Some("Handluję od 9 do 12.".to_string());

        let saved = repo.save(&write).expect("save");
        assert_eq!(
            saved.rules[0].answer,
            Some("Handluję od 9 do 12.".to_string())
        );
        assert_eq!(saved.rules.len(), 40);
        assert_eq!(saved.categories.len(), 6);
    }

    #[test]
    fn save_adds_a_custom_category_with_a_custom_question() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let mut write = write_from_state(&state);
        write.categories.push(TradingRuleCategoryWrite {
            id: None,
            name: "Moje własne".to_string(),
        });
        write.rules.push(TradingRuleWrite {
            id: None,
            category_index: 6,
            question: "Czy sprawdziłem kalendarz makro?".to_string(),
            answer: Some("Tak, codziennie rano.".to_string()),
            hidden: false,
            archived: false,
        });

        let saved = repo.save(&write).expect("save");
        assert_eq!(saved.categories.len(), 7);
        let custom_category = &saved.categories[6];
        assert_eq!(custom_category.name, "Moje własne");
        assert!(!custom_category.is_builtin);
        let custom_rule = saved
            .rules
            .iter()
            .find(|r| r.category_id == custom_category.id)
            .expect("własne pytanie istnieje");
        assert!(!custom_rule.is_builtin);
        assert_eq!(custom_rule.template_question, None);
    }

    #[test]
    fn save_rejects_two_questions_that_normalize_to_the_same_text_in_one_category() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let mut write = write_from_state(&state);
        write.rules.push(TradingRuleWrite {
            id: None,
            category_index: 0,
            question: "  w JAKICH godzinach   handluję?".to_string(),
            answer: None,
            hidden: false,
            archived: false,
        });

        let result = repo.save(&write);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn save_archives_a_question_and_keeps_it_out_of_normal_deletes() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let mut write = write_from_state(&state);
        write.rules[0].archived = true;

        let saved = repo.save(&write).expect("save with archive");
        let archived = saved
            .rules
            .iter()
            .find(|r| r.archived_at.is_some())
            .expect("jest");
        assert_eq!(archived.question, "W jakich godzinach handluję?");

        // Kolejny zapis, już bez zarchiwizowanego pytania na liście - NIE może go skasować
        // (żyje w Koszu, nie w formularzu).
        let write_again = write_from_state(&saved);
        assert_eq!(write_again.rules.len(), 39);
        let saved_again = repo.save(&write_again).expect("save again");
        assert!(saved_again.rules.iter().any(|r| r.archived_at.is_some()));
        assert_eq!(saved_again.rules.len(), 40);
    }

    #[test]
    fn save_permanently_removes_a_question_dropped_from_the_list() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let mut write = write_from_state(&state);
        write.rules.remove(5);

        let saved = repo.save(&write).expect("save");
        assert_eq!(saved.rules.len(), 39);
    }

    #[test]
    fn restore_templates_restores_question_text_but_never_answers_or_custom_rules() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let mut write = write_from_state(&state);
        write.rules[0].question = "Zupełnie zmienione pytanie?".to_string();
        write.rules[0].answer = Some("Moja odpowiedź zostaje.".to_string());
        write.rules[1].archived = true;
        write.rules.push(TradingRuleWrite {
            id: None,
            category_index: 0,
            question: "Moje własne pytanie?".to_string(),
            answer: Some("Własna odpowiedź.".to_string()),
            hidden: false,
            archived: false,
        });
        repo.save(&write).expect("save modifications");

        let restored = repo.restore_templates().expect("restore templates");

        let first = restored
            .rules
            .iter()
            .find(|r| r.template_question.as_deref() == Some("W jakich godzinach handluję?"))
            .expect("szablon istnieje");
        assert_eq!(first.question, "W jakich godzinach handluję?");
        assert_eq!(first.answer, Some("Moja odpowiedź zostaje.".to_string()));
        assert!(restored
            .rules
            .iter()
            .all(|r| r.archived_at.is_none() || !r.is_builtin));
        let custom = restored
            .rules
            .iter()
            .find(|r| r.question == "Moje własne pytanie?")
            .expect("własne pytanie nietknięte");
        assert_eq!(custom.answer, Some("Własna odpowiedź.".to_string()));
    }

    #[test]
    fn restore_rule_and_delete_permanently_follow_the_trash_contract() {
        let (repo, _dir) = repo_with_fresh_db();
        let state = repo.get().expect("get");
        let rule_id = state.rules[0].id.clone();

        // Trwałe usunięcie niezarchiwizowanego pytania jest zablokowane.
        assert!(matches!(
            repo.delete_rule_permanently(&rule_id),
            Err(AppError::Validation(_))
        ));

        let mut write = write_from_state(&state);
        write.rules[0].archived = true;
        repo.save(&write).expect("archive");

        repo.restore_rule(&rule_id).expect("restore from trash");
        let after_restore = repo.get().expect("get");
        assert!(after_restore
            .rules
            .iter()
            .find(|r| r.id == rule_id)
            .expect("istnieje")
            .archived_at
            .is_none());

        let mut write2 = write_from_state(&after_restore);
        write2.rules[0].archived = true;
        repo.save(&write2).expect("archive again");
        repo.delete_rule_permanently(&rule_id).expect("purge");
        assert_eq!(repo.get().expect("get").rules.len(), 39);
    }
}
