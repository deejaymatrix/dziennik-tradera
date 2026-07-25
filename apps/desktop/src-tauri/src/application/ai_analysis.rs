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
use crate::application::reports::{FilteredReport, ReportFilter, ReportsService};
use crate::domain::ai_analysis::{
    czy_poprawna_odpowiedz, waliduj_odpowiedz, zbuduj_prompt, zbuduj_prompt_audytu,
    zbuduj_prompt_emocji, zbuduj_prompt_raportu, AiAnalysisRepository, AnalizaWynik,
    DaneAnalizyRaportu, DaneAnalizyTransakcji, NowaAnaliza, StatusAnalizy, ZapisanaAnaliza,
    WERSJA_SZABLONU_TRANSAKCJI,
};
use crate::domain::ai_chat::{zbuduj_wiadomosci, WiadomoscCzatu};
use crate::domain::ai_settings::UstawieniaOdpowiedziAi;
use crate::domain::emotional_state::EmotionalStateRepository;
use crate::domain::strategy_checklist::ChecklistStatus;
use crate::domain::trade::{Trade, TradeRepository, TradeSide, TradeStatus};
use crate::domain::trade_partial_close;
use crate::domain::trade_stats::{
    compute_behavior_signals, compute_emotion_avg_intensity, compute_emotion_avg_volume,
    compute_emotion_breakdown, GroupBreakdown,
};
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
    /// Czy Asystent AI jest włączony (Ustawienia → Asystent AI). Frontend chowa wejścia do AI,
    /// gdy `false`, a warstwa analizy i tak odrzuci operację czytelnym błędem.
    pub wlaczony: bool,
}

/// Jedna pozycja historii wykonanych analiz (do widoku na stronie Asystent AI). Lekki opis +
/// `wynik_json`, żeby UI mogło rozwinąć fakty/obserwacje/rekomendacje bez osobnego zapytania.
/// `etykieta_zakresu` jest już rozwiązana do czytelnej postaci ("Transakcja #N").
#[derive(Debug, Clone, serde::Serialize)]
pub struct PozycjaHistorii {
    pub id: String,
    pub typ_analizy: String,
    pub utworzono_o: String,
    pub wersja_modelu: String,
    pub status: StatusAnalizy,
    pub etykieta_zakresu: String,
    pub wynik_json: String,
}

pub struct AiAnalysisService {
    runtime: Arc<crate::application::ai_runtime::AiRuntimeService>,
    analizy: Arc<dyn AiAnalysisRepository>,
    trades: Arc<dyn TradeRepository + Send + Sync>,
    accounts: Arc<AccountsService>,
    emotional_states: Arc<dyn EmotionalStateRepository + Send + Sync>,
    /// Silnik raportów - dostarcza zagregowane, deterministyczne dane do analizy całościowej
    /// (raport/okres). Budowany z tych samych `trades`/`accounts`, więc bez dodatkowego argumentu.
    reports: ReportsService,
}

impl AiAnalysisService {
    pub fn new(
        runtime: Arc<crate::application::ai_runtime::AiRuntimeService>,
        analizy: Arc<dyn AiAnalysisRepository>,
        trades: Arc<dyn TradeRepository + Send + Sync>,
        accounts: Arc<AccountsService>,
        emotional_states: Arc<dyn EmotionalStateRepository + Send + Sync>,
    ) -> Self {
        let reports = ReportsService::new(Arc::clone(&trades), Arc::clone(&accounts));
        Self {
            runtime,
            analizy,
            trades,
            accounts,
            emotional_states,
            reports,
        }
    }

    /// Przerywa bieżącą analizę (przycisk "Przerwij analizę").
    pub fn anuluj(&self) {
        self.runtime.anuluj();
    }

    /// Status AKTYWNEGO modelu do pokazania w UI: gotowość + etykieta + rozmiar (żeby zapytać o
    /// zgodę na pobranie przed jego rozpoczęciem).
    pub fn status_modelu(&self) -> StatusModeluAi {
        let opis = self.runtime.opis_aktywnego_modelu();
        StatusModeluAi {
            gotowy: self.runtime.model_gotowy(),
            etykieta: opis.etykieta.to_string(),
            rozmiar_bajtow: opis.rozmiar_bajtow,
            wlaczony: self.runtime.czy_wlaczony(),
        }
    }

    /// Włącza/wyłącza Asystenta AI (Ustawienia → Asystent AI).
    pub fn ustaw_wlaczony(&self, wlaczony: bool) -> Result<(), AppError> {
        self.runtime.ustaw_wlaczony(wlaczony)
    }

    /// Bieżące ustawienia stylu odpowiedzi (język + szczegółowość).
    pub fn ustawienia_odpowiedzi(&self) -> UstawieniaOdpowiedziAi {
        self.runtime.ustawienia_odpowiedzi()
    }

    /// Ustawia styl odpowiedzi (język + szczegółowość) - zapamiętywane, wpływa na kolejne analizy.
    pub fn ustaw_ustawienia_odpowiedzi(
        &self,
        ustawienia: UstawieniaOdpowiedziAi,
    ) -> Result<(), AppError> {
        self.runtime.ustaw_ustawienia_odpowiedzi(ustawienia)
    }

    /// Zwraca błąd, gdy AI jest wyłączony - wspólny strażnik dla analiz i czatu, żeby wyłączenie
    /// naprawdę blokowało operacje (nie tylko chowało przyciski w UI).
    fn wymagaj_wlaczony(&self) -> Result<(), AppError> {
        if !self.runtime.czy_wlaczony() {
            return Err(AppError::Validation(
                "Asystent AI jest wyłączony. Włącz go w Ustawieniach → Asystent AI.".to_string(),
            ));
        }
        Ok(())
    }

    /// Lista 3 kandydatów z ich stanem (pobrany/aktywny) - do wyboru modelu w Ustawieniach.
    pub fn lista_modeli(&self) -> Vec<crate::application::ai_runtime::OpisModeluStatus> {
        self.runtime.lista_modeli()
    }

    /// Ustawia aktywny model AI (jeden z trzech kandydatów).
    pub fn ustaw_model(&self, id: &str) -> Result<(), AppError> {
        self.runtime.ustaw_model(id)
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
        self.wymagaj_wlaczony()?;
        let trade = self.trades.get(trade_id)?;
        let dane = self.zbuduj_dane(&trade)?;
        let prompt = format!(
            "{}\n\n{}",
            zbuduj_prompt(&dane),
            self.runtime.instrukcja_stylu()
        );

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

    /// Analiza CAŁOŚCIOWA (raport/okres): bierze zagregowane, deterministyczne dane z silnika
    /// raportów dla `filter` i każe modelowi znaleźć wzorce w całym zakresie. `zakres_opis` to
    /// ludzki opis zakresu (np. "Konto Główne · EURUSD · 2026-03") do pokazania i do promptu.
    /// NIE zapisujemy tego wyniku (raporty są przeglądowe/przemijające, w przeciwieństwie do analiz
    /// pojedynczych transakcji) - zwracamy go do pokazania. BLOKUJĄCE - wołać z `spawn_blocking`.
    pub fn analizuj_raport_blocking(
        &self,
        filter: ReportFilter,
        zakres_opis: String,
    ) -> Result<AnalizaWynik, AppError> {
        self.wymagaj_wlaczony()?;
        let raport = self.reports.get_filtered_report(filter)?;
        if raport.stats.closed_trades == 0 {
            return Err(AppError::Validation(
                "Brak zamkniętych transakcji w wybranym zakresie - nie ma czego analizować."
                    .to_string(),
            ));
        }
        let dane = zbuduj_dane_raportu(&raport, zakres_opis);
        let prompt = format!(
            "{}\n\n{}",
            zbuduj_prompt_raportu(&dane),
            self.runtime.instrukcja_stylu()
        );
        let tekst = self
            .runtime
            .analizuj_blocking(&prompt, czy_poprawna_odpowiedz)?;
        waliduj_odpowiedz(&tekst)
    }

    /// Czat po WŁASNYCH danych: model odpowiada na `pytanie` (z uwzględnieniem `historia`) wyłącznie
    /// na podstawie zagregowanych, deterministycznych danych zakresu `filter` (te same co raport).
    /// `zakres_opis` to ludzki opis zakresu, wpleciony w pakiet danych. Odpowiedź to swobodny tekst
    /// i NIE jest zapisywana (czat jest przemijający). BLOKUJĄCE - wołać z `spawn_blocking`.
    pub fn czat_blocking(
        &self,
        filter: ReportFilter,
        zakres_opis: String,
        historia: Vec<WiadomoscCzatu>,
        pytanie: String,
    ) -> Result<String, AppError> {
        self.wymagaj_wlaczony()?;
        let raport = self.reports.get_filtered_report(filter)?;
        let pakiet = zbuduj_dane_raportu(&raport, zakres_opis).pakiet_danych();
        let wiadomosci = zbuduj_wiadomosci(
            &pakiet,
            &self.runtime.instrukcja_stylu(),
            &historia,
            &pytanie,
        );
        self.runtime.czat_blocking(wiadomosci)
    }

    /// Dedykowana analiza EMOCJONALNA konta: deterministyczne zestawienie emocja↔wynik
    /// (`compute_emotion_breakdown` - ta sama matematyka net co raporty) trafia do modelu, który
    /// szuka zależności. `zakres_opis` to ludzki opis (np. "Konto Główne · cała historia"). Wynik
    /// NIE jest zapisywany (jak analiza raportu). BLOKUJĄCE - wołać z `spawn_blocking`.
    pub fn analizuj_emocje_blocking(
        &self,
        account_id: &str,
        zakres_opis: String,
    ) -> Result<AnalizaWynik, AppError> {
        self.wymagaj_wlaczony()?;
        let trades = self.trades.list(account_id, false)?;
        let nazwy_emocji = self.mapa_nazw_emocji();
        let wg_emocji = compute_emotion_breakdown(&trades, &nazwy_emocji);
        if wg_emocji.is_empty() {
            return Err(AppError::Validation(
                "Brak transakcji z zapisanymi emocjami w tym zakresie - nie ma czego analizować."
                    .to_string(),
            ));
        }
        let natezenia = compute_emotion_avg_intensity(&trades);
        let wolumeny = compute_emotion_avg_volume(&trades);
        let dane_json = emocje_do_json(&wg_emocji, &natezenia, &wolumeny);
        let prompt = format!(
            "{}\n\n{}",
            zbuduj_prompt_emocji(&zakres_opis, &dane_json),
            self.runtime.instrukcja_stylu()
        );
        let tekst = self
            .runtime
            .analizuj_blocking(&prompt, czy_poprawna_odpowiedz)?;
        waliduj_odpowiedz(&tekst)
    }

    /// Dedykowany AUDYT ZACHOWANIA konta: deterministyczne sygnały (overtrading, dyscyplina, handel
    /// po stracie) z `compute_behavior_signals` trafiają do modelu, który je interpretuje i wskazuje
    /// kroki poprawy. Wynik NIE jest zapisywany. BLOKUJĄCE - wołać z `spawn_blocking`.
    pub fn audyt_zachowania_blocking(
        &self,
        account_id: &str,
        zakres_opis: String,
    ) -> Result<AnalizaWynik, AppError> {
        self.wymagaj_wlaczony()?;
        let trades = self.trades.list(account_id, false)?;
        let sygnaly = compute_behavior_signals(&trades);
        if sygnaly.total_closed == 0 {
            return Err(AppError::Validation(
                "Brak zamkniętych transakcji do audytu w tym zakresie.".to_string(),
            ));
        }
        let sygnaly_json =
            serde_json::to_string_pretty(&sygnaly).unwrap_or_else(|_| "{}".to_string());
        let prompt = format!(
            "{}\n\n{}",
            zbuduj_prompt_audytu(&zakres_opis, &sygnaly_json),
            self.runtime.instrukcja_stylu()
        );
        let tekst = self
            .runtime
            .analizuj_blocking(&prompt, czy_poprawna_odpowiedz)?;
        waliduj_odpowiedz(&tekst)
    }

    /// Mapa `state_id -> nazwa emocji` (z ukrytymi - transakcja mogła użyć później ukrytej emocji,
    /// a analiza ma pokazać, co RZECZYWIŚCIE zapisano). Wspólna dla analizy transakcji i emocji.
    fn mapa_nazw_emocji(&self) -> HashMap<String, String> {
        self.emotional_states
            .list(true)
            .unwrap_or_default()
            .into_iter()
            .map(|s| (s.id, s.name))
            .collect()
    }

    /// Najnowsza zapisana analiza transakcji (z policzoną flagą nieaktualności względem bieżącego
    /// stanu transakcji). `None`, gdy transakcji jeszcze nie analizowano.
    pub fn ostatnia_analiza(&self, trade_id: &str) -> Result<Option<ZapisanaAnaliza>, AppError> {
        let trade = self.trades.get(trade_id)?;
        self.analizy
            .ostatnia_dla_transakcji(trade_id, &trade.updated_at.to_rfc3339())
    }

    /// Historia wykonanych analiz (najnowsze pierwsze, do `limit`), z etykietą zakresu rozwiązaną
    /// do czytelnej postaci. Transakcja usunięta/w koszu nie jest błędem - taki wpis dostaje
    /// etykietę informującą o tym, zamiast wywalać całą listę.
    pub fn historia_analiz(&self, limit: usize) -> Result<Vec<PozycjaHistorii>, AppError> {
        let analizy = self.analizy.lista(limit)?;
        let mut wynik = Vec::with_capacity(analizy.len());
        for a in analizy {
            let etykieta_zakresu = match self.trades.get(&a.trade_id) {
                Ok(trade) => format!("Transakcja #{}", trade.display_number),
                Err(_) => "Transakcja usunięta lub w koszu".to_string(),
            };
            wynik.push(PozycjaHistorii {
                id: a.id,
                typ_analizy: a.typ_analizy,
                utworzono_o: a.utworzono_o,
                wersja_modelu: a.wersja_modelu,
                status: a.status,
                etykieta_zakresu,
                wynik_json: a.wynik_json,
            });
        }
        Ok(wynik)
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

        let nazwy_emocji = self.mapa_nazw_emocji();

        Ok(zbuduj_dane_transakcji(
            trade,
            nazwa_konta,
            waluta_konta,
            &nazwy_emocji,
        ))
    }
}

/// Zamienia deterministyczne rozbicie emocja↔wynik na czytelny JSON dla modelu. Liczby przechodzą
/// JAK SĄ z `compute_emotion_breakdown`/`compute_emotion_avg_intensity`/`compute_emotion_avg_volume`
/// (już policzone), tu tylko formatowanie do stringów. `natezenia`/`wolumeny` (state_id -> średnie
/// natężenie 1-5 / średni wolumen) dołączane po kluczu.
fn emocje_do_json(
    wg_emocji: &[GroupBreakdown],
    natezenia: &HashMap<String, Decimal>,
    wolumeny: &HashMap<String, Decimal>,
) -> String {
    let tablica: Vec<serde_json::Value> = wg_emocji
        .iter()
        .map(|g| {
            serde_json::json!({
                "emocja": g.label,
                "liczba_transakcji": g.trade_count,
                "wygrane": g.win_count,
                "przegrane": g.loss_count,
                "win_rate": g.win_rate.map(|w| format!("{}%", w.round_dp(1).normalize())),
                "wynik_netto": g.net_pnl.normalize().to_string(),
                "srednie_natezenie": natezenia.get(&g.key).map(|n| n.round_dp(1).normalize().to_string()),
                "sredni_wolumen": wolumeny.get(&g.key).map(|w| w.round_dp(2).normalize().to_string()),
            })
        })
        .collect();
    serde_json::to_string_pretty(&tablica).unwrap_or_else(|_| "[]".to_string())
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

    // Częściowe zamknięcia - liczby JUŻ POLICZONE (sumatory), tylko sumujemy istniejące wpisy.
    let (liczba_czesciowych, wolumen_czesciowo_zamkniety, wynik_czesciowych) =
        if trade.partial_closes.is_empty() {
            (None, None, None)
        } else {
            (
                Some(trade.partial_closes.len() as i64),
                Some(format_liczba(trade_partial_close::closed_volume(
                    &trade.partial_closes,
                ))),
                Some(format_liczba(trade_partial_close::realized_pnl(
                    &trade.partial_closes,
                ))),
            )
        };

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
        liczba_czesciowych,
        wolumen_czesciowo_zamkniety,
        wynik_czesciowych,
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

/// Zamienia breakdown (`by_strategy`/`by_instrument`/...) na pary `(etykieta, wynik_netto)` -
/// wszystkie wpisy, bo breakdowny są małe (garść strategii/instrumentów, do 12 miesięcy).
fn breakdown_na_pary(grupy: &[GroupBreakdown]) -> Vec<(String, String)> {
    grupy
        .iter()
        .map(|g| (g.label.clone(), format_liczba(g.net_pnl)))
        .collect()
}

/// CZYSTA funkcja mapująca `FilteredReport` (zagregowane, deterministyczne dane silnika raportów)
/// na pakiet do analizy całościowej. Nic nie liczy od nowa - przenosi już policzone KPI i
/// breakdowny. Testowalna bez bazy ani modelu.
pub fn zbuduj_dane_raportu(raport: &FilteredReport, zakres_opis: String) -> DaneAnalizyRaportu {
    let s = &raport.stats;
    DaneAnalizyRaportu {
        zakres_opis,
        liczba_transakcji: s.closed_trades,
        zyskowne: s.win_count,
        stratne: s.loss_count,
        win_rate: s.win_rate.map(|d| format!("{}%", format_liczba(d))),
        wynik_netto: Some(format_liczba(s.net_pnl)),
        profit_factor: s.profit_factor.map(format_liczba),
        sredni_wynik_trade: s.expectancy.map(format_liczba),
        max_drawdown: s.max_drawdown.map(format_liczba),
        laczna_prowizja: Some(format_liczba(s.total_commission)),
        najlepsza_transakcja: s.best_trade.map(format_liczba),
        najgorsza_transakcja: s.worst_trade.map(format_liczba),
        wg_strategii: breakdown_na_pary(&raport.by_strategy),
        wg_instrumentu: breakdown_na_pary(&raport.by_instrument),
        wg_interwalu: breakdown_na_pary(&raport.by_interval),
        wg_dnia_tygodnia: breakdown_na_pary(&raport.by_day_of_week),
        wg_kierunku: breakdown_na_pary(&raport.by_side),
        wg_miesiaca: breakdown_na_pary(&raport.calendar_months),
    }
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

    fn grupa(label: &str, net_pnl: rust_decimal::Decimal) -> GroupBreakdown {
        GroupBreakdown {
            key: label.to_string(),
            label: label.to_string(),
            trade_count: 1,
            win_count: 1,
            loss_count: 0,
            win_rate: Some(dec!(100)),
            net_pnl,
        }
    }

    fn raport_pusty() -> FilteredReport {
        FilteredReport {
            stats: crate::domain::trade_stats::compute_stats(&[]),
            equity_curve: vec![],
            calendar: vec![],
            by_strategy: vec![],
            by_instrument: vec![],
            by_interval: vec![],
            monthly: vec![],
            yearly: vec![],
            quarterly: vec![],
            calendar_months: vec![],
            by_day_of_week: vec![],
            by_four_hour: vec![],
            by_side: vec![],
            top_best_trades: vec![],
            top_worst_trades: vec![],
            pnl_distribution: vec![],
            month_calendar: vec![],
            period_balance: crate::application::reports::PeriodBalanceSummaryDto {
                starting_balance: dec!(1000),
                ending_balance: dec!(1000),
                net_cash_flow: dec!(0),
                return_percent: None,
                max_drawdown: dec!(0),
                max_drawdown_percent: None,
            },
        }
    }

    #[test]
    fn dane_raportu_przenosza_zakres_kpi_i_breakdowny() {
        let mut raport = raport_pusty();
        raport.by_strategy = vec![grupa("Breakout D1", dec!(420)), grupa("Scalp", dec!(-80))];
        raport.by_side = vec![grupa("BUY", dec!(500))];

        let dane = zbuduj_dane_raportu(&raport, "Konto Główne · 2026".to_string());
        assert_eq!(dane.zakres_opis, "Konto Główne · 2026");
        // Pusty raport: 0 zamkniętych transakcji, wynik netto "0".
        assert_eq!(dane.liczba_transakcji, 0);
        assert_eq!(dane.wynik_netto.as_deref(), Some("0"));
        // Breakdowny przeniesione jako pary (etykieta, wynik).
        assert_eq!(
            dane.wg_strategii,
            vec![
                ("Breakout D1".to_string(), "420".to_string()),
                ("Scalp".to_string(), "-80".to_string()),
            ]
        );
        assert_eq!(
            dane.wg_kierunku,
            vec![("BUY".to_string(), "500".to_string())]
        );
        // Nieustawione breakdowny zostają puste.
        assert!(dane.wg_instrumentu.is_empty());
    }
}
