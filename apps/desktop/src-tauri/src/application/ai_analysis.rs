//! Serwis analizy transakcji przez Asystenta AI (Blok F, Etap 3) - spina wszystko w całość:
//! bierze transakcję z bazy, rozwiązuje nazwy (konto/instrument/strategia/emocje), buduje
//! deterministyczny pakiet faktów, woła model przez `AiRuntimeService` (z pętlą "waliduj + ponów")
//! i zapisuje wynik przez `AiAnalysisRepository`.
//!
//! Sam rdzeń mapowania `Trade` -> `DaneAnalizyTransakcji` jest CZYSTĄ funkcją
//! (`zbuduj_dane_transakcji`), testowaną bez bazy ani modelu.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Local, Utc};
use rust_decimal::Decimal;

use crate::application::accounts::AccountsService;
use crate::domain::ai_analysis::{
    czy_poprawna_odpowiedz, waliduj_odpowiedz, zbuduj_prompt, AiAnalysisRepository,
    DaneAnalizyTransakcji, NowaAnaliza, StatusAnalizy, ZapisanaAnaliza, WERSJA_SZABLONU_TRANSAKCJI,
};
use crate::domain::emotional_state::EmotionalStateRepository;
use crate::domain::strategy_checklist::ChecklistStatus;
use crate::domain::trade::{Trade, TradeRepository, TradeSide, TradeStatus};
use crate::error::AppError;

/// Etykieta modelu zapisywana przy analizie (identyfikuje, czym była zrobiona). Trzymana tu, a nie
/// w `AiRuntimeService`, bo to warstwa analizy decyduje, co trafia do metadanych zapisu.
const ETYKIETA_MODELU: &str = "qwen2.5-7b-instruct-q4_k_m";
const TYP_ANALIZY_TRANSAKCJI: &str = "transakcja";

/// Status modelu AI pokazywany w UI - czy gotowy oraz etykieta i rozmiar (żeby przed pobraniem
/// zapytać użytkownika o zgodę na duży plik).
#[derive(Debug, Clone, serde::Serialize)]
pub struct StatusModeluAi {
    pub gotowy: bool,
    pub etykieta: String,
    pub rozmiar_bajtow: u64,
}

pub struct AiAnalysisService {
    runtime: Arc<crate::application::ai_runtime::AiRuntimeService>,
    analizy: Arc<dyn AiAnalysisRepository>,
    trades: Arc<dyn TradeRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
    emotional_states: Arc<dyn EmotionalStateRepository + Send + Sync>,
}

impl AiAnalysisService {
    pub fn new(
        runtime: Arc<crate::application::ai_runtime::AiRuntimeService>,
        analizy: Arc<dyn AiAnalysisRepository>,
        trades: Arc<dyn TradeRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
        emotional_states: Arc<dyn EmotionalStateRepository + Send + Sync>,
    ) -> Self {
        Self {
            runtime,
            analizy,
            trades,
            accounts,
            emotional_states,
        }
    }

    /// Przerywa bieżącą analizę (przycisk "Przerwij analizę").
    pub fn anuluj(&self) {
        self.runtime.anuluj();
    }

    /// Status modelu do pokazania w UI: gotowość + etykieta + rozmiar (żeby zapytać o zgodę na
    /// pobranie przed jego rozpoczęciem).
    pub fn status_modelu(&self) -> StatusModeluAi {
        let opis = crate::application::ai_runtime::AiRuntimeService::opis_modelu_produkcyjnego();
        StatusModeluAi {
            gotowy: self.runtime.model_gotowy(),
            etykieta: opis.etykieta.to_string(),
            rozmiar_bajtow: opis.rozmiar_bajtow,
        }
    }

    /// Pobiera i weryfikuje model (BLOKUJĄCE - komenda woła na `spawn_blocking`).
    pub fn pobierz_model_blocking(&self) -> Result<(), AppError> {
        self.runtime.pobierz_model_blocking()
    }

    /// Bieżący postęp pobierania (odpytywany przez frontend).
    pub fn postep_pobierania(&self) -> crate::infrastructure::ai_model_download::PostepPobrania {
        self.runtime.postep_pobierania()
    }

    /// Przerywa pobieranie modelu.
    pub fn anuluj_pobieranie(&self) {
        self.runtime.anuluj_pobieranie();
    }

    /// Usuwa pobrany model z dysku.
    pub fn usun_model(&self) -> Result<(), AppError> {
        self.runtime.usun_model()
    }

    /// Analizuje transakcję i ZAPISUJE wynik. BLOKUJĄCE (CPU-bound przez model) - komenda ma
    /// wołać to na `spawn_blocking`, nie na wątku UI. Rzuca błędem, gdy model nie jest gotowy,
    /// analiza zostanie anulowana/przekroczy limit czasu, albo model nie zwróci poprawnej
    /// odpowiedzi po dozwolonych ponowieniach - wtedy NIC nie zapisujemy (lepiej brak analizy niż
    /// zapisana śmieciowa treść).
    pub fn analizuj_transakcje_blocking(
        &self,
        trade_id: &str,
    ) -> Result<ZapisanaAnaliza, AppError> {
        let trade = self.trades.get(trade_id)?;
        let dane = self.zbuduj_dane(&trade)?;
        let prompt = zbuduj_prompt(&dane);

        let tekst = self
            .runtime
            .analizuj_blocking(&prompt, czy_poprawna_odpowiedz)?;
        // `czy_poprawna_odpowiedz` już przepuściła tylko poprawne odpowiedzi, więc `waliduj`
        // tu nie powinno zawieść - ale nie zakładamy tego na ślepo.
        let wynik = waliduj_odpowiedz(&tekst)?;
        let wynik_json = serde_json::to_string(&wynik).map_err(|e| {
            AppError::io(format!("nie udało się zserializować wyniku analizy: {e}"))
        })?;

        self.analizy.zapisz(&NowaAnaliza {
            trade_id: trade.id.clone(),
            typ_analizy: TYP_ANALIZY_TRANSAKCJI.to_string(),
            wersja_modelu: ETYKIETA_MODELU.to_string(),
            wersja_szablonu: WERSJA_SZABLONU_TRANSAKCJI.to_string(),
            wynik_json,
            wynik_tekstowy: wynik.do_tekstu(),
            zrodlo_updated_at: trade.updated_at.to_rfc3339(),
            status: StatusAnalizy::Ok,
        })
    }

    /// Najnowsza zapisana analiza transakcji (z policzoną flagą nieaktualności względem bieżącego
    /// stanu transakcji). `None`, gdy transakcji jeszcze nie analizowano.
    pub fn ostatnia_analiza(&self, trade_id: &str) -> Result<Option<ZapisanaAnaliza>, AppError> {
        let trade = self.trades.get(trade_id)?;
        self.analizy
            .ostatnia_dla_transakcji(trade_id, &trade.updated_at.to_rfc3339())
    }

    pub fn usun_analize(&self, id: &str) -> Result<(), AppError> {
        self.analizy.usun(id)
    }

    pub fn usun_wszystkie_analizy(&self) -> Result<(), AppError> {
        self.analizy.usun_wszystkie()
    }

    /// Rozwiązuje nazwy potrzebne do pakietu faktów, a potem oddaje budowę czystej funkcji.
    fn zbuduj_dane(&self, trade: &Trade) -> Result<DaneAnalizyTransakcji, AppError> {
        // Nazwa/waluta konta - konto usunięte/zarchiwizowane nie jest błędem analizy, więc brak
        // konta po prostu zostawia pola puste zamiast przerywać.
        let (nazwa_konta, waluta_konta) = match self.accounts.get(&trade.account_id) {
            Ok(konto) => (Some(konto.account.name), Some(konto.account.currency)),
            Err(_) => (None, None),
        };

        // Mapa state_id -> nazwa emocji (uwzględniamy ukryte, bo transakcja mogła użyć emocji
        // później ukrytej, a analiza ma pokazać, co RZECZYWIŚCIE zostało zapisane).
        let nazwy_emocji: HashMap<String, String> = self
            .emotional_states
            .list(true)
            .unwrap_or_default()
            .into_iter()
            .map(|s| (s.id, s.name))
            .collect();

        Ok(zbuduj_dane_transakcji(
            trade,
            nazwa_konta,
            waluta_konta,
            &nazwy_emocji,
        ))
    }
}

/// CZYSTA funkcja mapująca transakcję na pakiet danych do analizy - wszystkie nazwy już
/// rozwiązane (konto, emocje), liczby formatowane wprost ze stringów `Decimal`. Testowalna bez
/// bazy ani modelu. Deterministyczne KPI (P&L, R, ryzyko) przechodzą JAK SĄ z już policzonych pól
/// transakcji - nic tu nie jest liczone od nowa.
pub fn zbuduj_dane_transakcji(
    trade: &Trade,
    nazwa_konta: Option<String>,
    waluta_konta: Option<String>,
    nazwy_emocji: &HashMap<String, String>,
) -> DaneAnalizyTransakcji {
    let emocje = trade
        .emotions
        .as_ref()
        .map(|e| {
            e.entries
                .iter()
                .map(|wpis| {
                    let nazwa = nazwy_emocji
                        .get(&wpis.state_id)
                        .cloned()
                        .unwrap_or_else(|| wpis.state_id.clone());
                    (nazwa, wpis.intensity)
                })
                .collect()
        })
        .unwrap_or_default();

    // Wymagane zasady WEJŚCIA, które nie zostały spełnione - najmocniejszy sygnał dyscypliny.
    let zasady_niespelnione = trade
        .checklist
        .as_ref()
        .map(|c| {
            c.entry
                .iter()
                .filter(|i| i.required && i.status == ChecklistStatus::Unfulfilled)
                .map(|i| i.name.clone())
                .collect()
        })
        .unwrap_or_default();

    DaneAnalizyTransakcji {
        numer: trade.display_number,
        instrument: trade
            .instrument_spec_snapshot
            .as_ref()
            .map(|s| s.display_symbol.clone()),
        konto: nazwa_konta,
        waluta_konta,
        strategia: trade.strategy_snapshot.as_ref().map(|s| s.name.clone()),
        interwal: trade.interval.clone(),
        sesja: trade.session.clone(),
        kierunek: match trade.side {
            TradeSide::Buy => "BUY".to_string(),
            TradeSide::Sell => "SELL".to_string(),
        },
        status: match trade.status {
            TradeStatus::Draft => "szkic".to_string(),
            TradeStatus::Open => "otwarta".to_string(),
            TradeStatus::Closed => "zamknięta".to_string(),
        },
        otwarcie: trade.opened_at.map(format_czas),
        zamkniecie: trade.closed_at.map(format_czas),
        wolumen: trade.volume.map(format_liczba),
        cena_wejscia: trade.entry_price.map(format_liczba),
        stop_loss: trade.stop_loss.map(format_liczba),
        take_profit: trade.take_profit.map(format_liczba),
        cena_wyjscia: trade.exit_price.map(format_liczba),
        prowizja: Some(format_liczba(trade.commission)),
        swap: Some(format_liczba(trade.swap)),
        inne_oplaty: Some(format_liczba(trade.other_fees)),
        wynik_netto: trade.net_pnl.map(format_liczba),
        wynik_r: trade.pnl_r.map(format_liczba),
        ryzyko_kwota: trade.risk_amount.map(format_liczba),
        ryzyko_procent: trade.risk_percent.map(format_liczba),
        emocje,
        zasady_niespelnione,
        plan_przed: trade.plan_before.clone(),
        notatki_zarzadzania: trade.management_notes.clone(),
        podsumowanie: trade.post_trade_summary.clone(),
        wnioski: trade.conclusion.clone(),
    }
}

/// Czas w LOKALNEJ strefie (tak jak reszta prezentacji dat w aplikacji) - model dostaje czytelny
/// znacznik, nie surowe UTC.
fn format_czas(at: DateTime<Utc>) -> String {
    at.with_timezone(&Local)
        .format("%Y-%m-%d %H:%M")
        .to_string()
}

/// Surowa wartość dziesiętna jako string - bez separatorów tysięcy, żeby model dostał jednoznaczną
/// liczbę. To NIE jest formatowanie prezentacyjne (to robi frontend); tu chodzi o wierność.
fn format_liczba(d: Decimal) -> String {
    d.normalize().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::strategy_checklist::{ChecklistItem, StrategyChecklist};
    use crate::domain::trade_emotions::{EmotionEntry, TradeEmotions};
    use rust_decimal_macros::dec;

    fn trade_bazowy() -> Trade {
        // Minimalny, ale realistyczny obiekt - budujemy przez Default nie da się (Trade nie ma
        // Default), więc konstruujemy jawnie tylko pola istotne dla testu, reszta neutralna.
        Trade {
            id: "t1".to_string(),
            account_id: "a1".to_string(),
            display_number: 42,
            instrument_id: None,
            instrument_spec_snapshot: None,
            strategy_id: None,
            strategy_snapshot: None,
            status: TradeStatus::Closed,
            side: TradeSide::Buy,
            opened_at: None,
            closed_at: None,
            interval_id: None,
            interval: Some("D1".to_string()),
            session: None,
            volume: Some(dec!(0.50)),
            entry_price: None,
            stop_loss: None,
            take_profit: None,
            exit_price: None,
            commission: dec!(0),
            swap: dec!(0),
            other_fees: dec!(0),
            conversion_rate: None,
            gross_pnl: None,
            net_pnl: Some(dec!(-125.00)),
            pnl_points: None,
            pnl_percent: None,
            pnl_r: Some(dec!(-1.02)),
            risk_amount: None,
            risk_percent: None,
            plan_before: None,
            management_notes: None,
            post_trade_summary: None,
            conclusion: Some("Wszedłem za wcześnie.".to_string()),
            tags: vec![],
            plan_adherence_rating: None,
            pnl_source: crate::domain::trade::PnlSource::Auto,
            pnl_override_reason: None,
            emotions: None,
            checklist: None,
            partial_closes: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    #[test]
    fn mapuje_kierunek_status_wynik_i_wnioski() {
        let dane = zbuduj_dane_transakcji(
            &trade_bazowy(),
            Some("Konto A".to_string()),
            Some("USD".to_string()),
            &HashMap::new(),
        );
        assert_eq!(dane.numer, 42);
        assert_eq!(dane.kierunek, "BUY");
        assert_eq!(dane.status, "zamknięta");
        assert_eq!(dane.konto.as_deref(), Some("Konto A"));
        assert_eq!(dane.waluta_konta.as_deref(), Some("USD"));
        assert_eq!(dane.wynik_netto.as_deref(), Some("-125"));
        assert_eq!(dane.wynik_r.as_deref(), Some("-1.02"));
        assert_eq!(dane.wolumen.as_deref(), Some("0.5"));
        assert_eq!(dane.wnioski.as_deref(), Some("Wszedłem za wcześnie."));
    }

    #[test]
    fn rozwiazuje_nazwy_emocji_z_mapy_a_nieznane_zostawia_jako_id() {
        let mut trade = trade_bazowy();
        trade.emotions = Some(TradeEmotions {
            entries: vec![
                EmotionEntry {
                    state_id: "e1".to_string(),
                    intensity: Some(4),
                },
                EmotionEntry {
                    state_id: "nieznane".to_string(),
                    intensity: None,
                },
            ],
        });
        let mut mapa = HashMap::new();
        mapa.insert("e1".to_string(), "Pewność siebie".to_string());

        let dane = zbuduj_dane_transakcji(&trade, None, None, &mapa);
        assert_eq!(dane.emocje.len(), 2);
        assert_eq!(dane.emocje[0], ("Pewność siebie".to_string(), Some(4)));
        // Nieznany state_id trafia jako surowe id, żeby nie zgubić informacji.
        assert_eq!(dane.emocje[1], ("nieznane".to_string(), None));
    }

    #[test]
    fn bierze_tylko_wymagane_niespelnione_zasady_wejscia() {
        let mut trade = trade_bazowy();
        trade.checklist = Some(StrategyChecklist {
            entry: vec![
                ChecklistItem {
                    rule_id: "r1".to_string(),
                    name: "Potwierdzenie wolumenu".to_string(),
                    required: true,
                    status: ChecklistStatus::Unfulfilled,
                    reason: None,
                },
                ChecklistItem {
                    rule_id: "r2".to_string(),
                    name: "Opcjonalna zasada".to_string(),
                    required: false,
                    status: ChecklistStatus::Unfulfilled,
                    reason: None,
                },
                ChecklistItem {
                    rule_id: "r3".to_string(),
                    name: "Spełniona wymagana".to_string(),
                    required: true,
                    status: ChecklistStatus::Fulfilled,
                    reason: None,
                },
            ],
            management: vec![],
        });
        let dane = zbuduj_dane_transakcji(&trade, None, None, &HashMap::new());
        // Tylko wymagana + niespełniona.
        assert_eq!(dane.zasady_niespelnione, vec!["Potwierdzenie wolumenu"]);
    }

    #[test]
    fn brak_emocji_i_checklisty_daje_puste_listy_bez_paniki() {
        let dane = zbuduj_dane_transakcji(&trade_bazowy(), None, None, &HashMap::new());
        assert!(dane.emocje.is_empty());
        assert!(dane.zasady_niespelnione.is_empty());
    }

    #[test]
    fn prowizja_swap_oplaty_zawsze_obecne_nawet_zerowe() {
        let dane = zbuduj_dane_transakcji(&trade_bazowy(), None, None, &HashMap::new());
        assert_eq!(dane.prowizja.as_deref(), Some("0"));
        assert_eq!(dane.swap.as_deref(), Some("0"));
        assert_eq!(dane.inne_oplaty.as_deref(), Some("0"));
    }
}
