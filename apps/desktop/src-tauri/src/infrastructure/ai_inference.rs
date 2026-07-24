//! Uruchamianie lokalnego modelu (Etap 1c: harness benchmarkowy; podstawa pod `AiRuntimeService`
//! z Etapu 2). Cienki wrapper nad `llama-cpp-2` (bindings do `llama.cpp`) - ładuje model z pliku
//! GGUF, koduje jeden prompt, generuje odpowiedź tokenami aż do końca zdania (EOG) albo limitu
//! `n_len`, dekoduje z powrotem do tekstu.
//!
//! Celowo BEZ zarządzania cyklem życia (anulowanie, wątek w tle, blokada "jedna analiza naraz") -
//! to zadanie `AiRuntimeService` w Etapie 2. Ten moduł to czysta funkcja "prompt na wejściu, tekst
//! na wyjściu", żeby dało się ją przetestować/zbenchmarkować bez reszty infrastruktury.

use std::path::Path;
use std::time::{Duration, Instant};

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

use crate::error::AppError;

/// Ustawienia jednego uruchomienia - rozmiar kontekstu (musi pomieścić prompt + odpowiedź) i
/// maksymalna liczba nowo wygenerowanych tokenów (twardy limit, niezależny od tego, czy model
/// sam zdecyduje się skończyć wcześniej przez token końca zdania).
#[derive(Debug, Clone, Copy)]
pub struct KonfiguracjaGenerowania {
    pub n_ctx: u32,
    pub max_nowych_tokenow: i32,
}

impl Default for KonfiguracjaGenerowania {
    fn default() -> Self {
        Self {
            n_ctx: 4096,
            max_nowych_tokenow: 768,
        }
    }
}

#[derive(Debug, Clone)]
pub struct WynikGenerowania {
    pub tekst: String,
    pub czas_ladowania: Duration,
    pub czas_generowania: Duration,
    pub tokenow_wygenerowanych: usize,
}

/// Ładuje model spod `sciezka_modelu` i generuje odpowiedź na `prompt`. Synchroniczne i
/// blokujące (CPU-bound) - wywołujący (harness benchmarkowy, docelowo `AiRuntimeService`) ma
/// odpowiadać za to, żeby to nie działo się na wątku obsługującym UI.
pub fn uruchom_prompt(
    sciezka_modelu: &Path,
    prompt: &str,
    konfiguracja: &KonfiguracjaGenerowania,
) -> Result<WynikGenerowania, AppError> {
    let poczatek_ladowania = Instant::now();

    // Inicjalizacja jest idempotentna (dokumentacja `llama-cpp-2`) - bezpieczna przy wielu
    // wywołaniach `uruchom_prompt` w tym samym procesie (kolejne kandydaci w benchmarku).
    let backend = LlamaBackend::init()
        .map_err(|e| AppError::io(format!("nie udało się zainicjalizować silnika AI: {e}")))?;

    let model_params = LlamaModelParams::default();
    let model =
        LlamaModel::load_from_file(&backend, sciezka_modelu, &model_params).map_err(|e| {
            AppError::io(format!(
                "nie udało się wczytać modelu {sciezka_modelu:?}: {e}"
            ))
        })?;

    let ctx_params =
        LlamaContextParams::default().with_n_ctx(std::num::NonZeroU32::new(konfiguracja.n_ctx));
    let mut ctx = model
        .new_context(&backend, ctx_params)
        .map_err(|e| AppError::io(format!("nie udało się utworzyć kontekstu modelu: {e}")))?;

    let czas_ladowania = poczatek_ladowania.elapsed();
    let poczatek_generowania = Instant::now();

    // Bez zastosowania szablonu czatu model dostaje surowy tekst jako "dokańczanie", nie jako
    // prawdziwą turę rozmowy - w praktyce nie wie, KIEDY się zatrzymać (nie emituje tokenu końca
    // tury) i zamiast jednej odpowiedzi generuje kolejne warianty aż do limitu tokenów. Jeśli
    // model ma zapisany własny szablon w GGUF, używamy go; brak szablonu to fallback na surowy
    // prompt (rzadki przypadek - lepiej wygenerować cokolwiek niż odmówić działania).
    let tekst_z_szablonem = match model.chat_template(None) {
        Ok(szablon) => {
            let wiadomosci = [
                LlamaChatMessage::new("user".to_string(), prompt.to_string())
                    .map_err(|e| AppError::io(format!("nie udało się zbudować wiadomości: {e}")))?,
            ];
            model
                .apply_chat_template(&szablon, &wiadomosci, true)
                .map_err(|e| {
                    AppError::io(format!("nie udało się zastosować szablonu czatu: {e}"))
                })?
        }
        Err(_) => prompt.to_string(),
    };

    let tokeny_promptu = model
        .str_to_token(&tekst_z_szablonem, AddBos::Always)
        .map_err(|e| AppError::io(format!("nie udało się zakodować promptu: {e}")))?;

    let ostatni_indeks = i32::try_from(tokeny_promptu.len().saturating_sub(1))
        .map_err(|_| AppError::io("prompt zbyt długi do zakodowania".to_string()))?;
    let mut batch = LlamaBatch::new(512, 1);
    for (i, token) in (0_i32..).zip(tokeny_promptu) {
        let ostatni = i == ostatni_indeks;
        batch
            .add(token, i, &[0], ostatni)
            .map_err(|e| AppError::io(format!("nie udało się przygotować partii tokenów: {e}")))?;
    }
    ctx.decode(&mut batch).map_err(|e| {
        AppError::io(format!(
            "nie udało się przetworzyć promptu przez model: {e}"
        ))
    })?;

    let mut sampler =
        LlamaSampler::chain_simple([LlamaSampler::dist(1234), LlamaSampler::greedy()]);
    let mut dekoder = encoding_rs::UTF_8.new_decoder();
    let mut tekst = String::new();
    let mut n_cur = batch.n_tokens();
    let mut wygenerowano = 0usize;
    let limit = n_cur + konfiguracja.max_nowych_tokenow;

    while n_cur <= limit {
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(token);

        if model.is_eog_token(token) {
            break;
        }

        let fragment = model
            .token_to_piece(token, &mut dekoder, true, None)
            .map_err(|e| {
                AppError::io(format!("nie udało się zdekodować tokenu odpowiedzi: {e}"))
            })?;
        tekst.push_str(&fragment);
        wygenerowano += 1;

        batch.clear();
        batch
            .add(token, n_cur, &[0], true)
            .map_err(|e| AppError::io(format!("nie udało się dodać tokenu do partii: {e}")))?;
        n_cur += 1;

        ctx.decode(&mut batch).map_err(|e| {
            AppError::io(format!("nie udało się wygenerować kolejnego tokenu: {e}"))
        })?;
    }

    Ok(WynikGenerowania {
        tekst,
        czas_ladowania,
        czas_generowania: poczatek_generowania.elapsed(),
        tokenow_wygenerowanych: wygenerowano,
    })
}

#[cfg(test)]
mod benchmark_wyboru_modelu {
    //! Etap 1c: rzeczywisty benchmark kandydatów na modele (`KANDYDACI` w `ai_model_download`).
    //!
    //! Ignorowany domyślnie - pobiera do ~13 GB modeli i uruchamia prawdziwą inferencję na CPU
    //! (może trwać wiele minut na kandydata), więc NIE jest częścią zwykłego `cargo test`. Odpalać
    //! ręcznie: `cargo test --release -- --ignored benchmark_wyboru_modelu --nocapture`.
    //!
    //! Wynik i uzasadnienie wyboru trafiają do `docs/AI_ASYSTENT_WYBOR_MODELU.md` (Etap 1d) -
    //! ten test tylko DRUKUJE dane wejściowe do tej decyzji, sam niczego nie wybiera automatycznie.

    use std::sync::atomic::AtomicBool;
    use std::sync::Mutex;
    use std::time::Instant;

    use super::{uruchom_prompt, KonfiguracjaGenerowania};
    use crate::infrastructure::ai_model_download::{
        pobierz_i_zweryfikuj, PostepPobrania, KANDYDACI,
    };

    /// Realistyczny prompt PO POLSKU zbudowany z kształtu danych `TradeInspector` (pola transakcji,
    /// strategii, zasad, emocji) - ten sam typ treści, jaką Etap 3 faktycznie wyśle do modelu.
    /// Model ma odpowiedzieć WYŁĄCZNIE poprawnym JSON-em z rozdzielonymi faktami/obserwacjami/
    /// rekomendacjami - dokładnie to, czego wymaga specyfikacja Asystenta AI.
    fn prompt_testowy() -> String {
        r#"Jesteś asystentem analizującym dziennik transakcji tradera. Otrzymujesz WYŁĄCZNIE
fakty już policzone przez deterministyczny silnik aplikacji - nie licz niczego sam, tylko
interpretuj podane liczby.

Dane transakcji:
- Instrument: EURUSD, konto "Konto główne", strategia "Breakout D1"
- Kierunek: BUY, wolumen 0.50 lota
- Otwarcie: 2026-03-10 09:15, zamknięcie: 2026-03-10 11:40
- Cena wejścia: 1.08450, SL: 1.08200, TP: 1.09200, cena wyjścia: 1.08210
- Wynik netto: -125.00 USD, R: -1.02
- Zasady wejścia niespełnione: "Potwierdzenie wolumenu na wybiciu"
- Emocje przed transakcją: Pewność siebie (7/10); po transakcji: Frustracja (8/10)
- Notatka użytkownika: "Wszedłem za wcześnie, nie czekałem na retest."

Odpowiedz WYŁĄCZNIE poprawnym obiektem JSON o dokładnie takich kluczach:
{"fakty": ["..."], "obserwacje": ["..."], "rekomendacje": ["..."]}
Bez żadnego tekstu poza tym obiektem JSON."#
            .to_string()
    }

    /// Sprawdza, czy odpowiedź modelu da się sparsować jako JSON z dokładnie wymaganymi trzema
    /// kluczami, każdy będący tablicą - to jest "stabilność JSON-a" z kryteriów benchmarku.
    fn oceniona_poprawnosc_json(tekst: &str) -> bool {
        let Some(poczatek) = tekst.find('{') else {
            return false;
        };
        let Some(koniec) = tekst.rfind('}') else {
            return false;
        };
        if koniec <= poczatek {
            return false;
        }
        let Ok(wartosc) = serde_json::from_str::<serde_json::Value>(&tekst[poczatek..=koniec])
        else {
            return false;
        };
        let Some(obiekt) = wartosc.as_object() else {
            return false;
        };
        ["fakty", "obserwacje", "rekomendacje"]
            .iter()
            .all(|klucz| obiekt.get(*klucz).is_some_and(|w| w.is_array()))
    }

    /// Ten sam wymóg co w `ai_model_download`/`update_manifest` - `reqwest::blocking::Client`
    /// wymaga zainstalowanego dostawcy kryptografii rustls przed pierwszym użyciem w procesie.
    fn zainstaluj_dostawce_kryptografii() {
        static RAZ: std::sync::Once = std::sync::Once::new();
        RAZ.call_once(|| {
            let _ = rustls::crypto::ring::default_provider().install_default();
        });
    }

    #[test]
    #[ignore = "pobiera do ~13 GB modeli i uruchamia realną inferencję na CPU - odpalać ręcznie"]
    fn benchmark_kandydatow() {
        zainstaluj_dostawce_kryptografii();
        let katalog_modeli = std::env::temp_dir().join("dziennik-tradera-ai-benchmark");
        let prompt = prompt_testowy();

        println!(
            "\n=== Benchmark wyboru modelu Asystenta AI ({} kandydatów) ===\n",
            KANDYDACI.len()
        );

        for kandydat in KANDYDACI {
            println!("--- {} ({}) ---", kandydat.etykieta, kandydat.id);

            let postep = Mutex::new(PostepPobrania::nowy(kandydat.rozmiar_bajtow));
            let anuluj = AtomicBool::new(false);
            let poczatek_pobrania = Instant::now();
            let sciezka = match pobierz_i_zweryfikuj(kandydat, &katalog_modeli, &postep, &anuluj) {
                Ok(sciezka) => sciezka,
                Err(blad) => {
                    println!("  POMINIĘTY - pobieranie nie powiodło się: {blad}");
                    continue;
                }
            };
            println!(
                "  pobrano/zweryfikowano w {:?}",
                poczatek_pobrania.elapsed()
            );

            let konfiguracja = KonfiguracjaGenerowania::default();
            match uruchom_prompt(&sciezka, &prompt, &konfiguracja) {
                Ok(wynik) => {
                    let poprawny_json = oceniona_poprawnosc_json(&wynik.tekst);
                    let tokeny_na_sekunde = if wynik.czas_generowania.as_secs_f64() > 0.0 {
                        wynik.tokenow_wygenerowanych as f64 / wynik.czas_generowania.as_secs_f64()
                    } else {
                        0.0
                    };
                    println!("  czas ładowania: {:?}", wynik.czas_ladowania);
                    println!(
                        "  czas generowania: {:?} ({} tokenów, {:.1} tok/s)",
                        wynik.czas_generowania, wynik.tokenow_wygenerowanych, tokeny_na_sekunde
                    );
                    println!("  poprawny JSON wg schematu: {poprawny_json}");
                    println!(
                        "  rozmiar pliku modelu (przybliżenie RAM): {} MB",
                        kandydat.rozmiar_bajtow / 1_000_000
                    );
                    println!(
                        "  --- surowa odpowiedź ---\n{}\n--- koniec odpowiedzi ---",
                        wynik.tekst
                    );
                }
                Err(blad) => println!("  BŁĄD generowania: {blad}"),
            }
            println!();
        }
    }
}
