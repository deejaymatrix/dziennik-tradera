//! Usługa uruchamiania lokalnego modelu AI (Etap 2 Bloku F).
//!
//! Odpowiada za CAŁY cykl życia analizy - to, czego czysta funkcja `ai_inference::generuj` celowo
//! nie robi:
//! - ładuje model RAZ (leniwie, przy pierwszej analizie) i przetrzymuje go do ponownego użycia
//!   (ładowanie to 4-19 s, nie chcemy go płacić na każdą analizę);
//! - "jedna analiza naraz" - druga próba w trakcie trwającej jest ODRZUCANA (wymóg specyfikacji
//!   "zakaz uruchamiania wielu ciężkich analiz jednocześnie"; pełna kolejka to osobny, przyszły
//!   krok - tu wystarczy jednoznaczne odrzucenie zamiast cichego zrównoleglenia);
//! - "waliduj + ponów" - po każdej próbie sprawdza poprawność odpowiedzi i, jeśli zła, ponawia
//!   z INNYM ziarnem (patrz `docs/AI_ASYSTENT_WYBOR_MODELU.md` - to zastępuje gramatykę GBNF,
//!   która crashuje silnik w tej wersji `llama-cpp-2`);
//! - anulowanie i timeout - flaga sprawdzana przy każdym tokenie w `generuj`, ustawiana z zewnątrz
//!   przez `anuluj()` (inny wątek/komenda).
//!
//! Sama logika cyklu życia (odrzucanie zajętości, pętla ponowień, sprawdzanie anulowania) jest
//! w `analizuj_z_generatorem`, która przyjmuje DOMYKAJĄCY generator - dzięki temu testy podstawiają
//! atrapę zamiast prawdziwego modelu (4 GB) i sprawdzają CAŁĄ logikę bez inferencji.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::error::AppError;
use crate::infrastructure::ai_inference::{generuj, zaladuj_model, KonfiguracjaGenerowania};
use crate::infrastructure::ai_model_download::{model_pobrany, OpisModelu, KANDYDACI};

/// Model produkcyjny (patrz `docs/AI_ASYSTENT_WYBOR_MODELU.md` - Qwen2.5-7B-Instruct wygrał
/// benchmark po uwzględnieniu strategii "waliduj + ponów").
const ID_MODELU_PRODUKCYJNEGO: &str = "qwen2.5-7b-instruct-q4_k_m";

/// Ile razy maksymalnie ponawiamy generowanie, jeśli odpowiedź nie przechodzi walidacji. Po
/// wyczerpaniu prób zgłaszamy błąd - lepiej powiedzieć "nie udało się", niż zapisać zły wynik.
const MAKS_PROB: u32 = 3;

/// Limit czasu na JEDNĄ próbę generowania. Qwen2.5-7B na CPU generuje ~76 s (patrz benchmark),
/// więc próg z zapasem chroni przed zawieszeniem, nie ucinając normalnej odpowiedzi.
const LIMIT_CZASU_PROBY: Duration = Duration::from_secs(240);

pub struct AiRuntimeService {
    katalog_modeli: PathBuf,
    /// Załadowany model - `None` dopóki pierwsza analiza go nie wczyta. `Box<dyn ...>`, żeby nie
    /// ciągnąć typu `ZaladowanyModel` (i zależności od `llama-cpp-2`) do sygnatur testowanych bez
    /// modelu; realny generator domyka `Arc<ZaladowanyModel>` w `analizuj_blocking`.
    zaladowany: Mutex<Option<Arc<crate::infrastructure::ai_inference::ZaladowanyModel>>>,
    /// "Jedna analiza naraz" - `true` na czas trwającej analizy. Druga próba widzi `true` i jest
    /// odrzucana. Resetowany przez strażnik RAII, więc wraca do `false` nawet przy błędzie/panice.
    zajety: AtomicBool,
    /// Flaga anulowania BIEŻĄCEJ analizy. `anuluj()` ustawia `true`; start nowej analizy resetuje
    /// ją do `false`. Współdzielona (`Arc`), bo `generuj` sprawdza ją z wnętrza pętli tokenów.
    anuluj: Arc<AtomicBool>,
}

/// Strażnik RAII zdejmujący flagę "zajęty" przy wyjściu z analizy - gwarantuje, że nawet wczesny
/// `return` z błędem czy panika w środku nie zostawią usługi w stanie "zajęta na zawsze".
struct StrraznikZajetosci<'a>(&'a AtomicBool);

impl Drop for StrraznikZajetosci<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl AiRuntimeService {
    pub fn new(katalog_modeli: PathBuf) -> Self {
        Self {
            katalog_modeli,
            zaladowany: Mutex::new(None),
            zajety: AtomicBool::new(false),
            anuluj: Arc::new(AtomicBool::new(false)),
        }
    }

    fn opis_modelu() -> &'static OpisModelu {
        KANDYDACI
            .iter()
            .find(|k| k.id == ID_MODELU_PRODUKCYJNEGO)
            .expect("model produkcyjny musi być na liście KANDYDACI")
    }

    /// Czy model produkcyjny jest już pobrany i gotowy do użycia - frontend pyta o to, zanim
    /// pokaże przycisk "Przeanalizuj z AI" (bez modelu analiza i tak by się nie udała).
    pub fn model_gotowy(&self) -> bool {
        model_pobrany(Self::opis_modelu(), &self.katalog_modeli)
    }

    /// Ustawia flagę anulowania bieżącej analizy. Bezpieczne do wołania z innego wątku/komendy w
    /// trakcie trwającej analizy - `generuj` sprawdza flagę przy każdym tokenie i kończy się
    /// kontrolowanym błędem. Bezczynne, jeśli żadna analiza nie trwa.
    pub fn anuluj(&self) {
        self.anuluj.store(true, Ordering::SeqCst);
    }

    /// Analizuje `prompt`, ponawiając z innym ziarnem aż `czy_poprawny` zaakceptuje odpowiedź albo
    /// wyczerpiemy `MAKS_PROB`. BLOKUJĄCE (CPU-bound) - wołać z `spawn_blocking`, nie z wątku UI.
    /// Ładuje model przy pierwszym użyciu.
    pub fn analizuj_blocking(
        &self,
        prompt: &str,
        czy_poprawny: impl Fn(&str) -> bool,
    ) -> Result<String, AppError> {
        let zaladowany = self.zapewnij_model()?;
        self.analizuj_z_generatorem(czy_poprawny, |ziarno, flaga_anulowania| {
            let konfiguracja = KonfiguracjaGenerowania {
                ziarno,
                ..KonfiguracjaGenerowania::default()
            };
            generuj(
                &zaladowany,
                prompt,
                &konfiguracja,
                flaga_anulowania,
                Some(LIMIT_CZASU_PROBY),
            )
            .map(|wynik| wynik.tekst)
        })
    }

    /// Ładuje model, jeśli jeszcze nie jest w pamięci, i zwraca współdzielony uchwyt. Idempotentne
    /// - kolejne wywołania oddają ten sam, raz załadowany model.
    fn zapewnij_model(
        &self,
    ) -> Result<Arc<crate::infrastructure::ai_inference::ZaladowanyModel>, AppError> {
        let mut slot = self
            .zaladowany
            .lock()
            .expect("mutex modelu nie powinien być zatruty");
        if let Some(istniejacy) = slot.as_ref() {
            return Ok(Arc::clone(istniejacy));
        }
        let opis = Self::opis_modelu();
        if !model_pobrany(opis, &self.katalog_modeli) {
            return Err(AppError::Validation(
                "Model AI nie jest jeszcze pobrany. Pobierz go w Ustawieniach → Asystent AI."
                    .to_string(),
            ));
        }
        let sciezka = self.katalog_modeli.join(format!("{}.gguf", opis.id));
        let zaladowany = Arc::new(zaladuj_model(&sciezka)?);
        *slot = Some(Arc::clone(&zaladowany));
        Ok(zaladowany)
    }

    /// CZYSTA logika cyklu życia analizy, bez zależności od prawdziwego modelu - `generuj_probe`
    /// domyka albo realną inferencję (`analizuj_blocking`), albo atrapę (testy). Odpowiada za:
    /// odrzucenie, gdy inna analiza trwa; reset flagi anulowania na starcie; pętlę ponowień z
    /// rosnącym ziarnem; sprawdzanie anulowania między próbami.
    fn analizuj_z_generatorem<G>(
        &self,
        czy_poprawny: impl Fn(&str) -> bool,
        mut generuj_probe: G,
    ) -> Result<String, AppError>
    where
        G: FnMut(u32, &AtomicBool) -> Result<String, AppError>,
    {
        // "Jedna analiza naraz": atomowo zajmij usługę; jeśli już zajęta - odrzuć.
        if self
            .zajety
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(AppError::Validation(
                "Inna analiza AI właśnie trwa. Poczekaj na jej zakończenie albo ją przerwij."
                    .to_string(),
            ));
        }
        let _straznik = StrraznikZajetosci(&self.zajety);

        // Nowa analiza zaczyna z czystą flagą anulowania - inaczej anulowanie POPRZEDNIEJ
        // (albo wcześniejsze `anuluj()` "na zapas") od razu ubiłoby tę.
        self.anuluj.store(false, Ordering::SeqCst);

        let mut ostatni_blad: Option<AppError> = None;
        for numer_proby in 0..MAKS_PROB {
            if self.anuluj.load(Ordering::SeqCst) {
                return Err(AppError::Validation("Analiza AI przerwana.".to_string()));
            }
            // Różne ziarno na próbę - inaczej ponowienie dałoby identyczny wynik (patrz dokumentacja
            // `KonfiguracjaGenerowania::ziarno`).
            let ziarno = 1000 + numer_proby;
            match generuj_probe(ziarno, &self.anuluj) {
                Ok(tekst) if czy_poprawny(&tekst) => return Ok(tekst),
                Ok(_) => {
                    // Odpowiedź wygenerowana, ale nie przeszła walidacji - ponów z innym ziarnem.
                    ostatni_blad = Some(AppError::Validation(
                        "Model AI zwrócił odpowiedź w nieprawidłowym formacie.".to_string(),
                    ));
                }
                // Błąd generowania (w tym anulowanie/timeout) - przerywamy CAŁĄ analizę, nie
                // ponawiamy: anulowania nie ma sensu ponawiać, a twardy błąd silnika i tak się
                // powtórzy.
                Err(blad) => return Err(blad),
            }
        }
        Err(ostatni_blad.unwrap_or_else(|| {
            AppError::Validation("Nie udało się uzyskać poprawnej odpowiedzi AI.".to_string())
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usluga_testowa() -> AiRuntimeService {
        AiRuntimeService::new(std::env::temp_dir().join("dziennik-ai-runtime-test-nieistnieje"))
    }

    #[test]
    fn zwraca_pierwsza_poprawna_odpowiedz_bez_zbednych_prob() {
        let usluga = usluga_testowa();
        let mut wywolania = 0;
        let wynik = usluga
            .analizuj_z_generatorem(
                |t| t == "dobry",
                |_ziarno, _anuluj| {
                    wywolania += 1;
                    Ok("dobry".to_string())
                },
            )
            .expect("poprawna odpowiedź");
        assert_eq!(wynik, "dobry");
        assert_eq!(
            wywolania, 1,
            "poprawna pierwsza próba nie powinna być ponawiana"
        );
    }

    #[test]
    fn ponawia_po_zlej_odpowiedzi_i_zwraca_pozniejsza_poprawna() {
        let usluga = usluga_testowa();
        let mut wywolania = 0;
        let wynik = usluga
            .analizuj_z_generatorem(
                |t| t == "dobry",
                |ziarno, _anuluj| {
                    wywolania += 1;
                    // Pierwsza próba zła, druga dobra - i sprawdzamy, że ziarno faktycznie rośnie.
                    if wywolania == 1 {
                        assert_eq!(ziarno, 1000);
                        Ok("zly".to_string())
                    } else {
                        assert_eq!(ziarno, 1001);
                        Ok("dobry".to_string())
                    }
                },
            )
            .expect("druga próba jest poprawna");
        assert_eq!(wynik, "dobry");
        assert_eq!(wywolania, 2);
    }

    #[test]
    fn po_wyczerpaniu_prob_zglasza_blad_a_nie_zly_wynik() {
        let usluga = usluga_testowa();
        let mut wywolania = 0;
        let blad = usluga
            .analizuj_z_generatorem(
                |_t| false, // nic nigdy nie przechodzi walidacji
                |_ziarno, _anuluj| {
                    wywolania += 1;
                    Ok("zawsze zly".to_string())
                },
            )
            .expect_err("po MAKS_PROB nieudanych prób musi być błąd");
        assert!(matches!(blad, AppError::Validation(_)));
        assert_eq!(wywolania, MAKS_PROB, "powinno wykorzystać wszystkie próby");
    }

    #[test]
    fn blad_generowania_przerywa_od_razu_bez_ponawiania() {
        let usluga = usluga_testowa();
        let mut wywolania = 0;
        let blad = usluga
            .analizuj_z_generatorem(
                |_t| true,
                |_ziarno, _anuluj| {
                    wywolania += 1;
                    Err(AppError::io("silnik padł"))
                },
            )
            .expect_err("twardy błąd generowania przerywa analizę");
        assert!(matches!(blad, AppError::Io(_)));
        assert_eq!(wywolania, 1, "twardego błędu silnika nie ponawiamy");
    }

    #[test]
    fn druga_analiza_w_trakcie_pierwszej_jest_odrzucana() {
        let usluga = usluga_testowa();
        // W trakcie pierwszej analizy (z wnętrza generatora) próbujemy odpalić drugą - musi zostać
        // odrzucona przez flagę "zajęty".
        let wynik = usluga.analizuj_z_generatorem(
            |t| t == "ok",
            |_ziarno, _anuluj| {
                let druga = usluga.analizuj_z_generatorem(|_| true, |_z, _a| Ok("x".to_string()));
                assert!(
                    matches!(druga, Err(AppError::Validation(_))),
                    "druga równoległa analiza musi być odrzucona"
                );
                Ok("ok".to_string())
            },
        );
        assert_eq!(wynik.expect("pierwsza analiza kończy się poprawnie"), "ok");
        // Po zakończeniu pierwszej usługa znów jest wolna - kolejna analiza przechodzi.
        let po = usluga.analizuj_z_generatorem(|_| true, |_z, _a| Ok("znowu".to_string()));
        assert_eq!(po.expect("po zwolnieniu usługa znów działa"), "znowu");
    }

    #[test]
    fn anulowanie_przed_pierwsza_proba_konczy_analize_bledem() {
        let usluga = usluga_testowa();
        let mut wywolania = 0;
        // Generator ustawia flagę anulowania W TRAKCIE pierwszej próby (symulacja `anuluj()` z
        // innego wątku). Pętla po tej próbie widzi anulowanie i NIE ponawia.
        let blad = usluga
            .analizuj_z_generatorem(
                |_t| false,
                |_ziarno, anuluj| {
                    wywolania += 1;
                    anuluj.store(true, Ordering::SeqCst);
                    Ok("zly".to_string())
                },
            )
            .expect_err("anulowanie musi zakończyć analizę błędem");
        assert!(matches!(blad, AppError::Validation(_)));
        assert_eq!(wywolania, 1, "po anulowaniu nie ma kolejnych prób");
    }

    #[test]
    fn analizuj_blocking_bez_pobranego_modelu_daje_czytelny_blad() {
        let usluga = usluga_testowa(); // katalog nie istnieje => model nie pobrany
        let blad = usluga
            .analizuj_blocking("cokolwiek", |_| true)
            .expect_err("bez modelu analiza musi się nie udać");
        assert!(matches!(blad, AppError::Validation(_)));
    }
}
