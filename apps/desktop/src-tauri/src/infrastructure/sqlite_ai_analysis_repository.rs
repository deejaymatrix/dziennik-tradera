use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::domain::ai_analysis::{
    AiAnalysisRepository, NowaAnaliza, StatusAnalizy, ZapisanaAnaliza,
};
use crate::error::AppError;

pub struct SqliteAiAnalysisRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteAiAnalysisRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

const KOLUMNY: &str = "id, trade_id, typ_analizy, utworzono_o, wersja_modelu, wersja_szablonu, \
     wynik_json, wynik_tekstowy, zrodlo_updated_at, status";

/// Mapuje wiersz na `ZapisanaAnaliza`. `nieaktualna` liczone przez porównanie zapisanego
/// `zrodlo_updated_at` z przekazanym bieżącym `updated_at` transakcji - dlatego to osobny
/// parametr, a nie kolumna.
fn map_row(row: &Row, aktualne_updated_at: &str) -> rusqlite::Result<ZapisanaAnaliza> {
    let status: String = row.get("status")?;
    let zrodlo_updated_at: String = row.get("zrodlo_updated_at")?;
    Ok(ZapisanaAnaliza {
        id: row.get("id")?,
        trade_id: row.get("trade_id")?,
        typ_analizy: row.get("typ_analizy")?,
        utworzono_o: row.get("utworzono_o")?,
        wersja_modelu: row.get("wersja_modelu")?,
        wersja_szablonu: row.get("wersja_szablonu")?,
        wynik_json: row.get("wynik_json")?,
        wynik_tekstowy: row.get("wynik_tekstowy")?,
        status: StatusAnalizy::z_db(&status),
        nieaktualna: zrodlo_updated_at != aktualne_updated_at,
    })
}

impl AiAnalysisRepository for SqliteAiAnalysisRepository {
    fn zapisz(&self, nowa: &NowaAnaliza) -> Result<ZapisanaAnaliza, AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        let id = Uuid::now_v7().to_string();
        let utworzono_o = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO trade_ai_analyses (id, trade_id, typ_analizy, utworzono_o, wersja_modelu, \
             wersja_szablonu, wynik_json, wynik_tekstowy, zrodlo_updated_at, status) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                id,
                nowa.trade_id,
                nowa.typ_analizy,
                utworzono_o,
                nowa.wersja_modelu,
                nowa.wersja_szablonu,
                nowa.wynik_json,
                nowa.wynik_tekstowy,
                nowa.zrodlo_updated_at,
                nowa.status.do_db(),
            ],
        )?;
        // Świeżo zapisana analiza jest z definicji aktualna - podajemy jej własne
        // `zrodlo_updated_at` jako "bieżące", więc `nieaktualna` wyjdzie `false`.
        conn.query_row(
            &format!("SELECT {KOLUMNY} FROM trade_ai_analyses WHERE id = ?1"),
            [&id],
            |row| map_row(row, &nowa.zrodlo_updated_at),
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("Nie znaleziono zapisanej analizy o id {id}.")))
    }

    fn ostatnia_dla_transakcji(
        &self,
        trade_id: &str,
        aktualne_updated_at: &str,
    ) -> Result<Option<ZapisanaAnaliza>, AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        // Najnowsza wg `utworzono_o`; `id` (UUID v7, rosnące w czasie) jako rozstrzygnięcie remisu,
        // gdyby dwie analizy miały identyczny znacznik czasu.
        conn.query_row(
            &format!(
                "SELECT {KOLUMNY} FROM trade_ai_analyses WHERE trade_id = ?1 \
                 ORDER BY utworzono_o DESC, id DESC LIMIT 1"
            ),
            [trade_id],
            |row| map_row(row, aktualne_updated_at),
        )
        .optional()
        .map_err(AppError::from)
    }

    fn usun(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        conn.execute("DELETE FROM trade_ai_analyses WHERE id = ?1", [id])?;
        Ok(())
    }

    fn usun_wszystkie(&self) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|zatruty| zatruty.into_inner());
        conn.execute("DELETE FROM trade_ai_analyses", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Baza w pamięci tylko z tabelą analiz - nie potrzebujemy pełnego schematu ani prawdziwej
    /// transakcji (klucz obcy nie jest wymuszany bez `PRAGMA foreign_keys`), bo testujemy WYŁĄCZNIE
    /// zapis/odczyt/usuwanie analiz i liczenie flagi `nieaktualna`.
    fn repo_testowe() -> SqliteAiAnalysisRepository {
        let conn = Connection::open_in_memory().expect("baza w pamięci");
        conn.execute_batch(
            "CREATE TABLE trade_ai_analyses (
                id TEXT PRIMARY KEY,
                trade_id TEXT NOT NULL,
                typ_analizy TEXT NOT NULL,
                utworzono_o TEXT NOT NULL,
                wersja_modelu TEXT NOT NULL,
                wersja_szablonu TEXT NOT NULL,
                wynik_json TEXT NOT NULL,
                wynik_tekstowy TEXT NOT NULL,
                zrodlo_updated_at TEXT NOT NULL,
                status TEXT NOT NULL
            );",
        )
        .expect("tabela analiz");
        SqliteAiAnalysisRepository::new(Arc::new(Mutex::new(conn)))
    }

    fn nowa(trade_id: &str, zrodlo_updated_at: &str) -> NowaAnaliza {
        NowaAnaliza {
            trade_id: trade_id.to_string(),
            typ_analizy: "transakcja".to_string(),
            wersja_modelu: "qwen2.5-7b".to_string(),
            wersja_szablonu: "transakcja-v1".to_string(),
            wynik_json: r#"{"fakty":[],"obserwacje":[],"rekomendacje":[]}"#.to_string(),
            wynik_tekstowy: "Fakty:\n(brak)\n".to_string(),
            zrodlo_updated_at: zrodlo_updated_at.to_string(),
            status: StatusAnalizy::Ok,
        }
    }

    #[test]
    fn swiezo_zapisana_analiza_nie_jest_nieaktualna() {
        let repo = repo_testowe();
        let zapisana = repo
            .zapisz(&nowa("t1", "2026-03-10T12:00:00Z"))
            .expect("zapis");
        assert!(!zapisana.nieaktualna);
        assert_eq!(zapisana.trade_id, "t1");
        assert_eq!(zapisana.status, StatusAnalizy::Ok);
        assert!(!zapisana.id.is_empty());
    }

    #[test]
    fn analiza_jest_nieaktualna_gdy_updated_at_transakcji_sie_zmienil() {
        let repo = repo_testowe();
        repo.zapisz(&nowa("t1", "2026-03-10T12:00:00Z"))
            .expect("zapis");
        // Ta sama analiza odczytana przy INNYM bieżącym `updated_at` transakcji -> nieaktualna.
        let odczyt = repo
            .ostatnia_dla_transakcji("t1", "2026-03-11T09:00:00Z")
            .expect("odczyt")
            .expect("jest analiza");
        assert!(odczyt.nieaktualna);
    }

    #[test]
    fn ta_sama_wartosc_updated_at_oznacza_aktualna() {
        let repo = repo_testowe();
        repo.zapisz(&nowa("t1", "2026-03-10T12:00:00Z"))
            .expect("zapis");
        let odczyt = repo
            .ostatnia_dla_transakcji("t1", "2026-03-10T12:00:00Z")
            .expect("odczyt")
            .expect("jest analiza");
        assert!(!odczyt.nieaktualna);
    }

    #[test]
    fn ostatnia_dla_transakcji_bierze_najnowsza() {
        let repo = repo_testowe();
        repo.zapisz(&NowaAnaliza {
            wynik_tekstowy: "stara".to_string(),
            ..nowa("t1", "2026-03-10T12:00:00Z")
        })
        .expect("pierwszy zapis");
        // UUID v7 rośnie w czasie, więc drugi zapis jest "nowszy" nawet przy tym samym znaczniku.
        let druga = repo
            .zapisz(&NowaAnaliza {
                wynik_tekstowy: "nowa".to_string(),
                ..nowa("t1", "2026-03-10T12:00:00Z")
            })
            .expect("drugi zapis");
        let odczyt = repo
            .ostatnia_dla_transakcji("t1", "2026-03-10T12:00:00Z")
            .expect("odczyt")
            .expect("jest analiza");
        assert_eq!(odczyt.id, druga.id);
        assert_eq!(odczyt.wynik_tekstowy, "nowa");
    }

    #[test]
    fn brak_analizy_dla_transakcji_daje_none() {
        let repo = repo_testowe();
        let odczyt = repo
            .ostatnia_dla_transakcji("nieistnieje", "2026-03-10T12:00:00Z")
            .expect("odczyt bez błędu");
        assert!(odczyt.is_none());
    }

    #[test]
    fn usun_kasuje_pojedyncza_analize_nie_ruszajac_innych() {
        let repo = repo_testowe();
        let a = repo.zapisz(&nowa("t1", "u")).expect("zapis a");
        repo.zapisz(&nowa("t2", "u")).expect("zapis b");
        repo.usun(&a.id).expect("usunięcie a");
        assert!(repo
            .ostatnia_dla_transakcji("t1", "u")
            .expect("odczyt")
            .is_none());
        assert!(repo
            .ostatnia_dla_transakcji("t2", "u")
            .expect("odczyt")
            .is_some());
    }

    #[test]
    fn usun_wszystkie_czysci_cala_tabele() {
        let repo = repo_testowe();
        repo.zapisz(&nowa("t1", "u")).expect("zapis");
        repo.zapisz(&nowa("t2", "u")).expect("zapis");
        repo.usun_wszystkie().expect("czyszczenie");
        assert!(repo
            .ostatnia_dla_transakcji("t1", "u")
            .expect("odczyt")
            .is_none());
        assert!(repo
            .ostatnia_dla_transakcji("t2", "u")
            .expect("odczyt")
            .is_none());
    }

    #[test]
    fn status_przechodzi_przez_zapis_i_odczyt() {
        let repo = repo_testowe();
        repo.zapisz(&NowaAnaliza {
            status: StatusAnalizy::Anulowana,
            ..nowa("t1", "u")
        })
        .expect("zapis");
        let odczyt = repo
            .ostatnia_dla_transakcji("t1", "u")
            .expect("odczyt")
            .expect("jest");
        assert_eq!(odczyt.status, StatusAnalizy::Anulowana);
    }
}
