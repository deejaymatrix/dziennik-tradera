//! Usługa uruchamiania lokalnego modelu AI (Etap 2 Bloku F).
//!
//! Odpowiada za CAŁY cykl życia analizy - to, czego czysta funkcja `ai_inference::generuj` celowo
//! nie robi. Ładuje model RAZ (leniwie, przy pierwszej analizie) i przetrzymuje go do ponownego
//! użycia (ładowanie to 4-19 s, nie chcemy go płacić na każdą analizę). Wymusza "jedną analizę
//! naraz" - druga próba w trakcie trwającej jest ODRZUCANA (wymóg specyfikacji "zakaz uruchamiania
//! wielu ciężkich analiz jednocześnie"; pełna kolejka to osobny, przyszły krok). Robi "waliduj +
//! ponów" - po każdej próbie sprawdza poprawność odpowiedzi i, jeśli zła, ponawia z INNYM ziarnem
//! (patrz `docs/AI_ASYSTENT_WYBOR_MODELU.md` - to zastępuje gramatykę GBNF, która crashuje silnik w
//! tej wersji `llama-cpp-2`). Obsługuje anulowanie i timeout - flaga sprawdzana przy każdym tokenie
//! w `generuj`, ustawiana z zewnątrz przez `anuluj()` (inny wątek/komenda).
//!
//! Sama logika cyklu życia (odrzucanie zajętości, pętla ponowień, sprawdzanie anulowania) jest
//! w `analizuj_z_generatorem`, która przyjmuje DOMYKAJĄCY generator - dzięki temu testy podstawiają
//! atrapę zamiast prawdziwego modelu (4 GB) i sprawdzają CAŁĄ logikę bez inferencji.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::error::AppError;
use crate::infrastructure::ai_inference::{
    generuj, generuj_czat, zaladuj_model, KonfiguracjaGenerowania,
};
use crate::infrastructure::ai_model_download::{
    model_pobrany, pobierz_i_zweryfikuj, usun_model, OpisModelu, PostepPobrania, StatusPobrania,
    KANDYDACI,
};

/// Model domyślny, gdy użytkownik nie wybrał innego (patrz `docs/AI_ASYSTENT_WYBOR_MODELU.md` -
/// Qwen2.5-7B-Instruct wygrał benchmark po uwzględnieniu strategii "waliduj + ponów").
const ID_MODELU_DOMYSLNEGO: &str = "qwen2.5-7b-instruct-q4_k_m";

/// Nazwa pliku zapamiętującego wybór modelu w katalogu modeli - jedna linia z `id` kandydata.
const PLIK_AKTYWNEGO_MODELU: &str = "aktywny-model.txt";

/// Nazwa pliku zapamiętującego, czy Asystent AI jest włączony (`1`/`0`). Brak pliku = włączony.
const PLIK_WLACZONY: &str = "ai-wlaczony.txt";

/// Jeden z 3 kandydatów z jego bieżącym stanem - do pokazania w wyborze modelu w Ustawieniach.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OpisModeluStatus {
    pub id: String,
    pub etykieta: String,
    pub rozmiar_bajtow: u64,
    pub pobrany: bool,
    pub aktywny: bool,
}

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
    /// Postęp pobierania modelu - odpytywany przez frontend osobną komendą (ten sam wzorzec co
    /// reszta aplikacji), aktualizowany z wnętrza `pobierz_model_blocking`.
    postep_pobierania: Arc<Mutex<PostepPobrania>>,
    /// Flaga anulowania POBIERANIA modelu (osobna od anulowania analizy).
    anuluj_pobieranie: Arc<AtomicBool>,
    /// `id` aktywnego modelu (jednego z `KANDYDACI`). Wybór zapamiętany w pliku
    /// `PLIK_AKTYWNEGO_MODELU`, więc przeżywa restart. Zmiana modelu zwalnia załadowany poprzedni.
    aktywny_model_id: Mutex<String>,
    /// Czy Asystent AI jest włączony (Ustawienia → Asystent AI). Wyłączony blokuje analizy i czat
    /// czytelnym błędem, a frontend chowa wejścia do AI. Zapamiętany w pliku, przeżywa restart.
    wlaczony: AtomicBool,
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
        let aktywny = wczytaj_aktywny_model(&katalog_modeli);
        let wlaczony = wczytaj_wlaczony(&katalog_modeli);
        Self {
            katalog_modeli,
            zaladowany: Mutex::new(None),
            zajety: AtomicBool::new(false),
            anuluj: Arc::new(AtomicBool::new(false)),
            postep_pobierania: Arc::new(Mutex::new(PostepPobrania {
                pobrano_bajtow: 0,
                calkowity_rozmiar: 0,
                status: StatusPobrania::Trwa,
            })),
            anuluj_pobieranie: Arc::new(AtomicBool::new(false)),
            aktywny_model_id: Mutex::new(aktywny),
            wlaczony: AtomicBool::new(wlaczony),
        }
    }

    /// Czy Asystent AI jest włączony. Frontend pyta o to (przez `status_modelu`), zanim pokaże
    /// przyciski analizy/czatu, a warstwa analizy blokuje operacje, gdy wyłączony.
    pub fn czy_wlaczony(&self) -> bool {
        self.wlaczony.load(Ordering::SeqCst)
    }

    /// Włącza/wyłącza Asystenta AI i zapamiętuje wybór na dysku (przeżywa restart).
    pub fn ustaw_wlaczony(&self, wlaczony: bool) -> Result<(), AppError> {
        self.wlaczony.store(wlaczony, Ordering::SeqCst);
        zapisz_wlaczony(&self.katalog_modeli, wlaczony)
    }

    /// Opis AKTYWNEGO modelu (etykieta/rozmiar do pokazania w UI).
    pub fn opis_aktywnego_modelu(&self) -> &'static OpisModelu {
        self.opis_modelu()
    }

    /// Lista 3 kandydatów z bieżącym stanem (pobrany? aktywny?) - do wyboru modelu w Ustawieniach.
    pub fn lista_modeli(&self) -> Vec<OpisModeluStatus> {
        let aktywny = self
            .aktywny_model_id
            .lock()
            .expect("mutex aktywnego modelu nie powinien być zatruty")
            .clone();
        KANDYDACI
            .iter()
            .map(|k| OpisModeluStatus {
                id: k.id.to_string(),
                etykieta: k.etykieta.to_string(),
                rozmiar_bajtow: k.rozmiar_bajtow,
                pobrany: model_pobrany(k, &self.katalog_modeli),
                aktywny: k.id == aktywny,
            })
            .collect()
    }

    /// Ustawia aktywny model (jeden z `KANDYDACI`). Zapamiętuje wybór na dysku i ZWALNIA załadowany
    /// poprzedni model, żeby kolejna analiza wczytała nowo wybrany. Odrzuca nieznane `id`.
    pub fn ustaw_model(&self, id: &str) -> Result<(), AppError> {
        if !KANDYDACI.iter().any(|k| k.id == id) {
            return Err(AppError::Validation(format!("Nieznany model AI: {id}.")));
        }
        {
            let mut aktywny = self
                .aktywny_model_id
                .lock()
                .expect("mutex aktywnego modelu nie powinien być zatruty");
            if *aktywny == id {
                return Ok(()); // nic się nie zmienia
            }
            *aktywny = id.to_string();
        }
        // Zwolnij poprzedni model z pamięci - następna analiza wczyta nowo wybrany.
        *self
            .zaladowany
            .lock()
            .expect("mutex modelu nie powinien być zatruty") = None;
        zapisz_aktywny_model(&self.katalog_modeli, id)
    }

    /// Pobiera i weryfikuje AKTYWNY model. BLOKUJĄCE (gigabajty + SHA-256) - wołać z
    /// `spawn_blocking`. Postęp odczytywalny przez `postep_pobierania()`, anulowanie przez
    /// `anuluj_pobieranie()`. Idempotentne wobec już pobranego modelu (pobiera od nowa/wznawia).
    pub fn pobierz_model_blocking(&self) -> Result<(), AppError> {
        self.anuluj_pobieranie.store(false, Ordering::SeqCst);
        pobierz_i_zweryfikuj(
            self.opis_modelu(),
            &self.katalog_modeli,
            &self.postep_pobierania,
            &self.anuluj_pobieranie,
        )
        .map(|_| ())
    }

    /// Bieżący postęp pobierania modelu (do odpytywania z frontendu).
    pub fn postep_pobierania(&self) -> PostepPobrania {
        self.postep_pobierania
            .lock()
            .expect("mutex postępu nie powinien być zatruty")
            .clone()
    }

    /// Przerywa trwające pobieranie modelu.
    pub fn anuluj_pobieranie(&self) {
        self.anuluj_pobieranie.store(true, Ordering::SeqCst);
    }

    /// Usuwa pobrany AKTYWNY model z dysku (i zwalnia go z pamięci, jeśli był załadowany).
    pub fn usun_model(&self) -> Result<(), AppError> {
        *self
            .zaladowany
            .lock()
            .expect("mutex modelu nie powinien być zatruty") = None;
        usun_model(self.opis_modelu(), &self.katalog_modeli)
    }

    /// Opis AKTYWNEGO modelu (z listy `KANDYDACI`). Wybór jest walidowany przy ustawianiu i przy
    /// wczytywaniu z pliku, więc `id` zawsze wskazuje istniejącego kandydata; gdyby jednak nie -
    /// spadamy na domyślny, zamiast panikować.
    fn opis_modelu(&self) -> &'static OpisModelu {
        let id = self
            .aktywny_model_id
            .lock()
            .expect("mutex aktywnego modelu nie powinien być zatruty")
            .clone();
        KANDYDACI
            .iter()
            .find(|k| k.id == id)
            .unwrap_or_else(domyslny_model)
    }

    /// Czy AKTYWNY model jest już pobrany i gotowy do użycia - frontend pyta o to, zanim pokaże
    /// przycisk "Przeanalizuj z AI" (bez modelu analiza i tak by się nie udała).
    pub fn model_gotowy(&self) -> bool {
        model_pobrany(self.opis_modelu(), &self.katalog_modeli)
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

    /// Generuje odpowiedź czatu na całą rozmowę (`wiadomosci` = pary `(rola, treść)`). W
    /// odróżnieniu od analizy NIE waliduje formatu ani nie ponawia - odpowiedź czatu to swobodny
    /// tekst, więc `czy_poprawny` zawsze akceptuje (jedna próba). Reszta cyklu życia (odrzucanie
    /// zajętości, reset i sprawdzanie anulowania, timeout) jest ta sama co przy analizie.
    /// BLOKUJĄCE - wołać z `spawn_blocking`. Ładuje model przy pierwszym użyciu.
    pub fn czat_blocking(&self, wiadomosci: Vec<(String, String)>) -> Result<String, AppError> {
        let zaladowany = self.zapewnij_model()?;
        self.analizuj_z_generatorem(
            |_| true,
            |ziarno, flaga_anulowania| {
                let konfiguracja = KonfiguracjaGenerowania {
                    ziarno,
                    ..KonfiguracjaGenerowania::default()
                };
                generuj_czat(
                    &zaladowany,
                    &wiadomosci,
                    &konfiguracja,
                    flaga_anulowania,
                    Some(LIMIT_CZASU_PROBY),
                )
                .map(|wynik| wynik.tekst)
            },
        )
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
        let opis = self.opis_modelu();
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

/// Domyślny kandydat, gdy nic nie wybrano albo zapamiętany wybór jest nieznany.
fn domyslny_model() -> &'static OpisModelu {
    KANDYDACI
        .iter()
        .find(|k| k.id == ID_MODELU_DOMYSLNEGO)
        .expect("domyślny model musi być na liście KANDYDACI")
}

/// Wczytuje zapamiętany wybór modelu z pliku. Zwraca `id` domyślnego, gdy pliku nie ma, jest
/// nieczytelny albo wskazuje nieznanego kandydata (np. po zmianie listy modeli między wersjami).
fn wczytaj_aktywny_model(katalog_modeli: &std::path::Path) -> String {
    let zapisany = std::fs::read_to_string(katalog_modeli.join(PLIK_AKTYWNEGO_MODELU))
        .ok()
        .map(|s| s.trim().to_string());
    match zapisany {
        Some(id) if KANDYDACI.iter().any(|k| k.id == id) => id,
        _ => ID_MODELU_DOMYSLNEGO.to_string(),
    }
}

/// Zapisuje wybór modelu do pliku (tworząc katalog, gdyby jeszcze nie istniał).
fn zapisz_aktywny_model(katalog_modeli: &std::path::Path, id: &str) -> Result<(), AppError> {
    std::fs::create_dir_all(katalog_modeli)?;
    std::fs::write(katalog_modeli.join(PLIK_AKTYWNEGO_MODELU), id)?;
    Ok(())
}

/// Wczytuje flagę włączenia AI. Domyślnie WŁĄCZONY - brak pliku albo nieczytelna treść znaczy
/// „włączony"; tylko jawne `0` wyłącza. Dzięki temu świeża instalacja od razu ma działające AI.
fn wczytaj_wlaczony(katalog_modeli: &std::path::Path) -> bool {
    match std::fs::read_to_string(katalog_modeli.join(PLIK_WLACZONY)) {
        Ok(tresc) => tresc.trim() != "0",
        Err(_) => true,
    }
}

/// Zapisuje flagę włączenia AI (`1`/`0`) do pliku (tworząc katalog, gdyby jeszcze nie istniał).
fn zapisz_wlaczony(katalog_modeli: &std::path::Path, wlaczony: bool) -> Result<(), AppError> {
    std::fs::create_dir_all(katalog_modeli)?;
    std::fs::write(
        katalog_modeli.join(PLIK_WLACZONY),
        if wlaczony { "1" } else { "0" },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usluga_testowa() -> AiRuntimeService {
        AiRuntimeService::new(std::env::temp_dir().join("dziennik-ai-runtime-test-nieistnieje"))
    }

    #[test]
    fn ai_domyslnie_wlaczony_a_wylaczenie_przezywa_restart() {
        let katalog = tempfile::tempdir().expect("katalog tymczasowy");
        let usluga = AiRuntimeService::new(katalog.path().to_path_buf());
        assert!(usluga.czy_wlaczony(), "świeża instalacja ma AI włączone");

        usluga.ustaw_wlaczony(false).expect("zapis wyłączenia");
        assert!(!usluga.czy_wlaczony());

        // Nowa usługa z tego samego katalogu wczytuje zapamiętany stan (jak po restarcie aplikacji).
        let po_restarcie = AiRuntimeService::new(katalog.path().to_path_buf());
        assert!(
            !po_restarcie.czy_wlaczony(),
            "wyłączenie musi przeżyć restart"
        );
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
