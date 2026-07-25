//! Uruchamianie lokalnego modelu (Etap 1c: harness benchmarkowy; podstawa pod `AiRuntimeService`
//! z Etapu 2). Cienki wrapper nad `llama-cpp-2` (bindings do `llama.cpp`) - ładuje model z pliku
//! GGUF, koduje jeden prompt, generuje odpowiedź tokenami aż do końca zdania (EOG) albo limitu
//! `n_len`, dekoduje z powrotem do tekstu.
//!
//! Celowo BEZ zarządzania cyklem życia (anulowanie, wątek w tle, blokada "jedna analiza naraz") -
//! to zadanie `AiRuntimeService` w Etapie 2. Ten moduł to czysta funkcja "prompt na wejściu, tekst
//! na wyjściu", żeby dało się ją przetestować/zbenchmarkować bez reszty infrastruktury.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
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
    /// Ziarno losowości samplera - INNE ziarno na próbę pozwala ponowić generowanie po
    /// niepoprawnej odpowiedzi (np. złej składni JSON) i faktycznie dostać INNY wynik, nie
    /// identyczne powtórzenie. Zob. `qwen_7b_ponowienie_po_zlym_json_empirycznie_naprawia_niezawodnosc`.
    /// DZIAŁA tylko przy `temperatura > 0` - przy `0.0` (greedy) wynik jest deterministyczny i
    /// ziarno nie ma żadnego wpływu (odkryte empirycznie: 3 ponowienia dawały IDENTYCZNY zły JSON).
    pub ziarno: u32,
    /// Temperatura próbkowania. `0.0` = deterministyczny wybór najbardziej prawdopodobnego tokenu
    /// (najlepsze do surowego benchmarku jakości, ale ponowienie wtedy nic nie daje). `> 0.0`
    /// wprowadza losowość zależną od `ziarno`, dzięki czemu ponowienie po złej odpowiedzi ma
    /// realną szansę dać inny, poprawny wynik. Domyślnie lekka temperatura (`0.4`) - kompromis
    /// między powtarzalnością a możliwością ponowienia.
    pub temperatura: f32,
    /// Gramatyka GBNF wymuszająca dokładny kształt odpowiedzi (np. `GRAMATYKA_ANALIZY_JSON`).
    ///
    /// **NIE UŻYWAĆ - znany crash silnika w tej wersji `llama-cpp-2` (patrz dokumentacja
    /// `GRAMATYKA_ANALIZY_JSON`).** Zostawione jako gotowa integracja na przyszłość (gdyby
    /// upstream naprawił błąd), ale domyślnie `None` i żaden kod produkcyjny tego nie włącza.
    /// Bieżąca strategia niezawodności JSON-a: walidacja + ponowienie z innym `ziarno`.
    pub gramatyka_json: Option<&'static str>,
}

impl Default for KonfiguracjaGenerowania {
    fn default() -> Self {
        Self {
            ziarno: 1234,
            temperatura: 0.4,
            n_ctx: 4096,
            max_nowych_tokenow: 768,
            gramatyka_json: None,
        }
    }
}

/// Gramatyka GBNF wymuszająca dokładnie schemat analizy Asystenta AI: obiekt z TRZEMA kluczami
/// w ustalonej kolejności (`fakty`/`obserwacje`/`rekomendacje`), każdy jako tablica poprawnie
/// zescapowanych stringów JSON.
///
/// **UWAGA - ZNANY CRASH, NIE UŻYWAĆ w tej wersji `llama-cpp-2`/`llama-cpp-sys-2` (0.1.152).**
/// Zweryfikowane empirycznie (2026-07-25): użycie `LlamaSampler::grammar(...)` z TĄ gramatyką -
/// a także z werbatim, sprawdzoną ogólną gramatyką JSON z `llama-cpp-2` - powoduje twardy crash
/// procesu (`GGML_ASSERT(!stacks.empty())` w `llama-grammar.cpp:940`, oznaczone w samym kodzie
/// źródłowym komentarzem `// REVIEW` przez autorów llama.cpp) na PIERWSZYM próbkowanym tokenie,
/// niezależnie od modelu (odtworzone na Qwen2.5-7B i Qwen2.5-1.5B) i treści gramatyki. To crash
/// silnika C++, nie błąd w tej gramatyce ani w sposobie jej podpięcia - patrz
/// `docs/AI_ASYSTENT_WYBOR_MODELU.md`. Zamiast wymuszania na poziomie silnika, Etap 2 ma używać
/// walidacji + automatycznego ponowienia (`oceniona_poprawnosc_json` + retry) - patrz test
/// `qwen_7b_ponowienie_po_zlym_json_empirycznie_naprawia_niezawodnosc`.
#[allow(dead_code)]
pub const GRAMATYKA_ANALIZY_JSON: &str = r#"
root ::= "{" "\"fakty\"" ":" tablica-tekstow "," "\"obserwacje\"" ":" tablica-tekstow "," "\"rekomendacje\"" ":" tablica-tekstow "}"

tablica-tekstow ::= "[" (tekst ("," tekst)*)? "]"

tekst ::= "\"" ([^"\\] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\""
"#;

#[derive(Debug, Clone)]
pub struct WynikGenerowania {
    pub tekst: String,
    pub czas_generowania: Duration,
    pub tokenow_wygenerowanych: usize,
}

/// Załadowany do pamięci silnik + model. ŁADOWANIE JEST KOSZTOWNE (4-19 s), więc robimy je RAZ
/// i przetrzymujemy w `AiRuntimeService` (Etap 2), tworząc świeży, tani kontekst na każde
/// generowanie. `LlamaModel` jest `Send + Sync` (patrz `unsafe impl` w llama-cpp-2), a
/// `LlamaBackend` to pusty strażnik (auto `Send + Sync`), więc całość da się trzymać w `Arc` i
/// współdzielić między wątkami - realne generowanie i tak serializujemy w `AiRuntimeService`
/// (wymóg "jedna analiza naraz"), więc nigdy nie używamy tego współbieżnie.
///
/// `backend` jest polem, a nie tworzonym lokalnie strażnikiem, bo `LlamaBackend::init()` zwraca
/// błąd przy DRUGIM wywołaniu w procesie (a `Drop` zwalnia silnik). Trzymając JEDEN backend przez
/// całe życie usługi, unikamy tego cyklu i nie płacimy za reinicjalizację przy każdej analizie.
pub struct ZaladowanyModel {
    // Pole nieużywane bezpośrednio, ale MUSI żyć tak długo jak `model` - `Drop` na `LlamaBackend`
    // zwalnia globalny stan silnika, po którym `model` byłby nieważny.
    _backend: LlamaBackend,
    model: LlamaModel,
}

/// Ładuje model z pliku GGUF do pamięci. Kosztowne (rozmiar modelu w RAM, 4-19 s) - wołać RAZ,
/// nie na każdą analizę.
pub fn zaladuj_model(sciezka_modelu: &Path) -> Result<ZaladowanyModel, AppError> {
    let backend = LlamaBackend::init()
        .map_err(|e| AppError::io(format!("nie udało się zainicjalizować silnika AI: {e}")))?;
    let model_params = LlamaModelParams::default();
    let model =
        LlamaModel::load_from_file(&backend, sciezka_modelu, &model_params).map_err(|e| {
            AppError::io(format!(
                "nie udało się wczytać modelu {sciezka_modelu:?}: {e}"
            ))
        })?;
    Ok(ZaladowanyModel {
        _backend: backend,
        model,
    })
}

/// Powód, dla którego generowanie skończyło się przed naturalnym końcem odpowiedzi modelu -
/// pozwala wywołującemu (usłudze) odróżnić "użytkownik anulował" od "przekroczono limit czasu"
/// od "model sam skończył/dobił do limitu tokenów", bez zgadywania z treści.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PowodPrzerwania {
    Anulowano,
    Timeout,
}

/// Generuje odpowiedź na `prompt` używając WCZEŚNIEJ załadowanego modelu. Tworzy świeży kontekst
/// (tanie względem ładowania modelu). Sprawdza `anuluj` oraz `limit_czasu` PRZY KAŻDYM tokenie -
/// dzięki temu "Przerwij analizę" i timeout działają bez zabijania procesu/wątku (pętla po prostu
/// kończy się kontrolowanym błędem). Synchroniczne i blokujące (CPU-bound) - wywołujący ma zadbać,
/// żeby to nie działo się na wątku UI (np. `spawn_blocking`).
pub fn generuj(
    zaladowany: &ZaladowanyModel,
    prompt: &str,
    konfiguracja: &KonfiguracjaGenerowania,
    anuluj: &AtomicBool,
    limit_czasu: Option<Duration>,
) -> Result<WynikGenerowania, AppError> {
    let model = &zaladowany.model;
    let poczatek_generowania = Instant::now();

    let ctx_params =
        LlamaContextParams::default().with_n_ctx(std::num::NonZeroU32::new(konfiguracja.n_ctx));
    let mut ctx = model
        .new_context(&zaladowany._backend, ctx_params)
        .map_err(|e| AppError::io(format!("nie udało się utworzyć kontekstu modelu: {e}")))?;

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

    // Kolejność w łańcuchu ma znaczenie: gramatyka (jeśli jest) zawęża dozwolony słownik NAJPIERW,
    // potem `temp`/`top_p` kształtują rozkład, a `dist` na końcu faktycznie LOSUJE token wg tego
    // rozkładu i `ziarno`. Przy `temperatura == 0.0` używamy `greedy` (deterministyczny argmax) -
    // wtedy `ziarno` nie ma znaczenia i ponowienie nic nie da (odkryte empirycznie). Przy
    // `temperatura > 0.0` różne `ziarno` dają RÓŻNE wyniki, więc ponowienie po złym JSON-ie ma sens.
    // UWAGA: `konfiguracja.gramatyka_json` w praktyce zawsze `None` - użycie tu powoduje znany
    // crash silnika w tej wersji `llama-cpp-2` (patrz dokumentacja `GRAMATYKA_ANALIZY_JSON`).
    let mut samplery: Vec<LlamaSampler> = Vec::new();
    if let Some(gramatyka) = konfiguracja.gramatyka_json {
        let sampler_gramatyki = LlamaSampler::grammar(model, gramatyka, "root")
            .map_err(|e| AppError::io(format!("nie udało się zbudować gramatyki JSON: {e}")))?;
        samplery.push(sampler_gramatyki);
    }
    if konfiguracja.temperatura > 0.0 {
        samplery.push(LlamaSampler::temp(konfiguracja.temperatura));
        samplery.push(LlamaSampler::top_p(0.95, 1));
        samplery.push(LlamaSampler::dist(konfiguracja.ziarno));
    } else {
        samplery.push(LlamaSampler::greedy());
    }
    let mut sampler = LlamaSampler::chain_simple(samplery);
    let mut dekoder = encoding_rs::UTF_8.new_decoder();
    let mut tekst = String::new();
    let mut n_cur = batch.n_tokens();
    let mut wygenerowano = 0usize;
    let limit = n_cur + konfiguracja.max_nowych_tokenow;

    while n_cur <= limit {
        // Anulowanie i timeout sprawdzane PRZED każdym kosztownym krokiem generowania - to jest
        // to, co daje "Przerwij analizę" i limit czasu bez zabijania wątku.
        if anuluj.load(Ordering::SeqCst) {
            return Err(przerwanie_do_bledu(PowodPrzerwania::Anulowano));
        }
        if let Some(limit_czasu) = limit_czasu {
            if poczatek_generowania.elapsed() >= limit_czasu {
                return Err(przerwanie_do_bledu(PowodPrzerwania::Timeout));
            }
        }

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
        czas_generowania: poczatek_generowania.elapsed(),
        tokenow_wygenerowanych: wygenerowano,
    })
}

/// Anulowanie i timeout to POPRAWNE, oczekiwane zakończenia (użytkownik przerwał / minął limit),
/// nie awarie - zwracamy je jako `AppError::Validation`, którego komunikat trafia w całości do
/// użytkownika (nie jest chowany jak techniczne `Io`/`Database`).
fn przerwanie_do_bledu(powod: PowodPrzerwania) -> AppError {
    match powod {
        PowodPrzerwania::Anulowano => AppError::Validation("Analiza AI przerwana.".to_string()),
        PowodPrzerwania::Timeout => {
            AppError::Validation("Analiza AI przekroczyła limit czasu.".to_string())
        }
    }
}

/// Ładuje model i generuje odpowiedź jednym wywołaniem - wyłącznie na potrzeby benchmarku
/// (`benchmark_wyboru_modelu`), gdzie ładujemy każdego kandydata świeżo. Kod produkcyjny używa
/// `zaladuj_model` + `generuj` osobno, żeby nie płacić za ładowanie modelu przy każdej analizie.
#[cfg(test)]
fn uruchom_prompt(
    sciezka_modelu: &Path,
    prompt: &str,
    konfiguracja: &KonfiguracjaGenerowania,
) -> Result<WynikGenerowania, AppError> {
    let zaladowany = zaladuj_model(sciezka_modelu)?;
    generuj(
        &zaladowany,
        prompt,
        konfiguracja,
        &AtomicBool::new(false),
        None,
    )
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

    /// Naprawa niezawodności JSON-a Qwen2.5-7B (który w poprzednim benchmarku raz złamał składnię
    /// - niezescapowany cudzysłów wewnątrz stringa). Wymuszanie gramatyki GBNF na poziomie
    /// silnika okazało się NIEBEZPIECZNE (crashuje proces - patrz dokumentacja
    /// `GRAMATYKA_ANALIZY_JSON`), więc zamiast tego: waliduj wynik i ponów z INNYM ziarnem
    /// samplera, jeśli JSON jest niepoprawny. Inne ziarno naprawdę daje INNY wynik (zob.
    /// `KonfiguracjaGenerowania::ziarno`), więc ponowienie ma realną szansę się udać, zamiast
    /// deterministycznie powtórzyć ten sam błąd.
    ///
    /// Ten test uruchamia model do `MAKSYMALNA_LICZBA_PROB` razy i sprawdza, że przynajmniej
    /// jedna próba dała poprawny JSON - to jest empiryczna weryfikacja strategii "waliduj +
    /// ponów", nie tylko deklaracja, że powinna działać.
    #[test]
    #[ignore = "wymaga już pobranego Qwen2.5-7B (uruchom najpierw benchmark_kandydatow) - odpalać ręcznie"]
    fn qwen_7b_ponowienie_po_zlym_json_empirycznie_naprawia_niezawodnosc() {
        zainstaluj_dostawce_kryptografii();
        let katalog_modeli = std::env::temp_dir().join("dziennik-tradera-ai-benchmark");
        let kandydat = KANDYDACI
            .iter()
            .find(|k| k.id == "qwen2.5-7b-instruct-q4_k_m")
            .expect("Qwen2.5-7B musi być w KANDYDACI");
        let prompt = prompt_testowy();

        let postep = Mutex::new(PostepPobrania::nowy(kandydat.rozmiar_bajtow));
        let anuluj = AtomicBool::new(false);
        let sciezka = pobierz_i_zweryfikuj(kandydat, &katalog_modeli, &postep, &anuluj)
            .expect("Qwen2.5-7B musi być już pobrany/zweryfikowany");

        const MAKSYMALNA_LICZBA_PROB: u32 = 3;
        let mut udalo_sie = false;

        for numer_proby in 1..=MAKSYMALNA_LICZBA_PROB {
            let konfiguracja = KonfiguracjaGenerowania {
                ziarno: 1000 + numer_proby,
                ..KonfiguracjaGenerowania::default()
            };
            let wynik = uruchom_prompt(&sciezka, &prompt, &konfiguracja).unwrap_or_else(|e| {
                panic!("próba {numer_proby}: generowanie nie powiodło się: {e}")
            });
            let poprawny = oceniona_poprawnosc_json(&wynik.tekst);
            println!(
                "--- próba {numer_proby}/{MAKSYMALNA_LICZBA_PROB} (ziarno {}) - poprawny JSON: {poprawny} ---\n{}\n",
                konfiguracja.ziarno, wynik.tekst
            );
            if poprawny {
                udalo_sie = true;
                break;
            }
        }

        assert!(
            udalo_sie,
            "żadna z {MAKSYMALNA_LICZBA_PROB} prób nie dała poprawnego JSON-a - strategia \
             \"waliduj + ponów\" nie wystarcza, potrzeba innego podejścia"
        );
    }
}
