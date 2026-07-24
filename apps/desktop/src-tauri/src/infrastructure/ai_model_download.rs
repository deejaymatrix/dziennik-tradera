//! Pobieranie i weryfikacja modelu lokalnego Asystenta AI (Etap 1).
//!
//! Ten sam wzorzec co [`super::update_manifest`]: `reqwest` + `AppError::io(...)` z logowaniem
//! szczegółów, testowane lokalnym serwerem TCP zamiast mocków. W odróżnieniu od tamtego modułu,
//! tu pobieramy DUŻY plik binarny (gigabajty, nie kilobajty), więc dochodzi: strumieniowanie do
//! pliku tymczasowego z bieżącym postępem, wznowienie przerwanego pobrania (`Range`), i
//! weryfikacja SHA-256 CAŁEGO pliku PRZED przeniesieniem go do docelowej nazwy - uszkodzony albo
//! sfałszowany plik nigdy nie zostaje uznany za gotowy model.
//!
//! Adresy i sumy SHA-256 kandydatów są PRZYPIĘTE w kodzie - żadnego automatycznego "najnowsza
//! wersja". Zweryfikowane bezpośrednio z plików wskaźnikowych Git LFS na Hugging Face (odczyt
//! surowego tekstu w przeglądarce, NIE podsumowanie modelu AI - suma SHA-256 musi się zgadzać
//! co do bajtu, więc nie może przejść przez żadną parafrazę).

use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Serialize, Serializer};
use sha2::{Digest, Sha256};

use crate::error::AppError;

/// Opis jednego kandydata do benchmarku (Etap 1c) - adres, przypięta suma SHA-256 i oczekiwany
/// rozmiar. Rozmiar to dodatkowe, tanie sprawdzenie PRZED liczeniem SHA-256 całego pliku (kilka
/// GB) - zła długość odpowiedzi kończy pobieranie od razu, bez czytania całej zawartości.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OpisModelu {
    pub id: &'static str,
    pub etykieta: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub rozmiar_bajtow: u64,
}

/// Kandydaci do benchmarku wyboru modelu (Etap 1c) - wszyscy na licencji Apache 2.0, format
/// GGUF, kwantyzacja Q4_K_M. `Qwen2.5-3B-Instruct` świadomie pominięty mimo wcześniejszego
/// założenia w planie - jego rzeczywista licencja na Hugging Face to `qwen-research`
/// (ograniczenia komercyjne), nie Apache 2.0; `Qwen2.5-1.5B-Instruct` (naprawdę Apache 2.0)
/// zajął jego miejsce jako mniejszy/szybszy wariant zapasowy.
pub const KANDYDACI: &[OpisModelu] = &[
    OpisModelu {
        id: "bielik-11b-v2.3-q4_k_m",
        etykieta: "Bielik-11B-v2.3-Instruct (Q4_K_M)",
        url: "https://huggingface.co/speakleash/Bielik-11B-v2.3-Instruct-GGUF/resolve/main/Bielik-11B-v2.3-Instruct.Q4_K_M.gguf",
        sha256: "ece698889c07d4a98a8fb7c9968ad7ad20961cf824c0b008895fe0506c87b834",
        rozmiar_bajtow: 6_724_050_496,
    },
    OpisModelu {
        id: "qwen2.5-7b-instruct-q4_k_m",
        etykieta: "Qwen2.5-7B-Instruct (Q4_K_M)",
        url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        sha256: "65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423",
        rozmiar_bajtow: 4_683_074_240,
    },
    OpisModelu {
        id: "qwen2.5-1.5b-instruct-q4_k_m",
        etykieta: "Qwen2.5-1.5B-Instruct (Q4_K_M)",
        url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
        sha256: "1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370",
        rozmiar_bajtow: 986_048_768,
    },
];

/// Ile czekamy na pierwszy bajt odpowiedzi. Sam transfer dużego pliku trwa długo - to jest
/// tylko limit na "serwer w ogóle nie odpowiada", nie na całe pobieranie.
const TIMEOUT_POLACZENIA: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusPobrania {
    Trwa,
    Zweryfikowano,
    Anulowano,
    Blad,
}

/// Współdzielony, odpytywany stan pobrania - ten sam sposób raportowania postępu co reszta
/// aplikacji już używa (komendy odpytywane przez frontend), żeby nie wprowadzać nowego wzorca
/// (zdarzeń Tauri) tylko dla tej jednej funkcji.
#[derive(Debug, Clone, Serialize)]
pub struct PostepPobrania {
    pub pobrano_bajtow: u64,
    pub calkowity_rozmiar: u64,
    pub status: StatusPobrania,
}

impl PostepPobrania {
    pub fn nowy(calkowity_rozmiar: u64) -> Self {
        Self {
            pobrano_bajtow: 0,
            calkowity_rozmiar,
            status: StatusPobrania::Trwa,
        }
    }
}

/// Nazwa pliku tymczasowego dla danego modelu - osobna od docelowej, żeby nigdy nie dało się
/// pomylić częściowo pobranego pliku z gotowym, zweryfikowanym modelem.
fn nazwa_tymczasowa(opis: &OpisModelu) -> String {
    format!("{}.gguf.part", opis.id)
}

fn nazwa_docelowa(opis: &OpisModelu) -> String {
    format!("{}.gguf", opis.id)
}

/// Pobiera i weryfikuje model opisany przez `opis` do katalogu `katalog_modeli`. Wznawia
/// pobieranie, jeśli plik `.part` już częściowo istnieje z wcześniejszej, przerwanej próby.
/// Zwraca ścieżkę do zweryfikowanego pliku dopiero PO potwierdzeniu SHA-256 - żaden wywołujący
/// nie może dostać ścieżki do pliku, który nie przeszedł weryfikacji.
pub fn pobierz_i_zweryfikuj(
    opis: &OpisModelu,
    katalog_modeli: &Path,
    postep: &Mutex<PostepPobrania>,
    anuluj: &AtomicBool,
) -> Result<PathBuf, AppError> {
    pobierz_i_zweryfikuj_z_adresu(opis, opis.url, katalog_modeli, postep, anuluj)
}

/// Ta sama logika co [`pobierz_i_zweryfikuj`], ale z adresem jako osobnym parametrem - wydzielone
/// wyłącznie po to, żeby testy mogły podstawić lokalny serwer zamiast prawdziwego Hugging Face.
fn pobierz_i_zweryfikuj_z_adresu(
    opis: &OpisModelu,
    adres: &str,
    katalog_modeli: &Path,
    postep: &Mutex<PostepPobrania>,
    anuluj: &AtomicBool,
) -> Result<PathBuf, AppError> {
    std::fs::create_dir_all(katalog_modeli)?;
    let sciezka_tymczasowa = katalog_modeli.join(nazwa_tymczasowa(opis));
    let sciezka_docelowa = katalog_modeli.join(nazwa_docelowa(opis));

    {
        let mut aktualny = postep
            .lock()
            .expect("mutex postępu nie powinien być zatruty");
        *aktualny = PostepPobrania::nowy(opis.rozmiar_bajtow);
    }

    let juz_pobrano = sciezka_tymczasowa.metadata().map(|m| m.len()).unwrap_or(0);

    let klient = reqwest::blocking::Client::builder()
        .timeout(None)
        .connect_timeout(TIMEOUT_POLACZENIA)
        .build()
        .map_err(|e| AppError::io(format!("nie można utworzyć klienta HTTP: {e}")))?;

    let mut zadanie = klient.get(adres);
    if juz_pobrano > 0 && juz_pobrano < opis.rozmiar_bajtow {
        zadanie = zadanie.header(reqwest::header::RANGE, format!("bytes={juz_pobrano}-"));
    }

    let mut odpowiedz = zadanie
        .send()
        .map_err(|e| AppError::io(format!("nie udało się połączyć z serwerem modelu: {e}")))?;

    if !odpowiedz.status().is_success() {
        return Err(AppError::io(format!(
            "serwer modelu odpowiedział kodem {}",
            odpowiedz.status()
        )));
    }

    // Serwer może zignorować `Range` (np. brak wsparcia) i zacząć wysyłać od bajtu 0 mimo
    // wcześniej częściowo pobranego pliku - wtedy trzeba zacząć od zera, żeby nie doszyć
    // nowej treści za stara.
    let wznowione = odpowiedz.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let mut plik = if wznowione {
        std::fs::OpenOptions::new()
            .append(true)
            .open(&sciezka_tymczasowa)?
    } else {
        std::fs::File::create(&sciezka_tymczasowa)?
    };
    let mut pobrano_bajtow = if wznowione { juz_pobrano } else { 0 };

    let mut hasher = Sha256::new();
    if wznowione && pobrano_bajtow > 0 {
        dolicz_istniejaca_tresc_do_hasha(&sciezka_tymczasowa, &mut hasher)?;
    }

    let mut bufor = [0u8; 64 * 1024];
    loop {
        if anuluj.load(Ordering::SeqCst) {
            let mut aktualny = postep
                .lock()
                .expect("mutex postępu nie powinien być zatruty");
            aktualny.status = StatusPobrania::Anulowano;
            return Err(AppError::Validation(
                "Pobieranie modelu anulowane.".to_string(),
            ));
        }
        let n = odpowiedz
            .read(&mut bufor)
            .map_err(|e| AppError::io(format!("błąd odczytu strumienia pobierania: {e}")))?;
        if n == 0 {
            break;
        }
        plik.write_all(&bufor[..n])?;
        hasher.update(&bufor[..n]);
        pobrano_bajtow += n as u64;

        let mut aktualny = postep
            .lock()
            .expect("mutex postępu nie powinien być zatruty");
        aktualny.pobrano_bajtow = pobrano_bajtow;
    }
    plik.flush()?;
    drop(plik);

    if pobrano_bajtow != opis.rozmiar_bajtow {
        let mut aktualny = postep
            .lock()
            .expect("mutex postępu nie powinien być zatruty");
        aktualny.status = StatusPobrania::Blad;
        return Err(AppError::io(format!(
            "pobrany plik ma {pobrano_bajtow} bajtów, oczekiwano {}",
            opis.rozmiar_bajtow
        )));
    }

    let policzony_hash: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if policzony_hash != opis.sha256 {
        // Uszkodzony/sfałszowany plik NIGDY nie zostaje uznany za gotowy model - usuwamy go,
        // żeby kolejna próba zaczęła się od zera, zamiast wznawiać dopisywanie do złej treści.
        let _ = std::fs::remove_file(&sciezka_tymczasowa);
        let mut aktualny = postep
            .lock()
            .expect("mutex postępu nie powinien być zatruty");
        aktualny.status = StatusPobrania::Blad;
        return Err(AppError::io(format!(
            "suma SHA-256 pobranego pliku się nie zgadza (oczekiwano {}, otrzymano {policzony_hash})",
            opis.sha256
        )));
    }

    std::fs::rename(&sciezka_tymczasowa, &sciezka_docelowa)?;
    {
        let mut aktualny = postep
            .lock()
            .expect("mutex postępu nie powinien być zatruty");
        aktualny.status = StatusPobrania::Zweryfikowano;
    }
    Ok(sciezka_docelowa)
}

/// Przy wznowieniu trzeba doliczyć już zapisaną na dysku treść do hashera SHA-256 - suma liczy
/// się nad CAŁYM plikiem, nie tylko nad nowo dopisanym fragmentem.
fn dolicz_istniejaca_tresc_do_hasha(sciezka: &Path, hasher: &mut Sha256) -> Result<(), AppError> {
    let mut istniejacy = std::fs::File::open(sciezka)?;
    istniejacy.seek(SeekFrom::Start(0))?;
    let mut bufor = [0u8; 64 * 1024];
    loop {
        let n = istniejacy.read(&mut bufor)?;
        if n == 0 {
            break;
        }
        hasher.update(&bufor[..n]);
    }
    Ok(())
}

/// Usuwa zweryfikowany model (i ewentualną porzuconą treść tymczasową) z dysku - odpowiednik
/// „usuń model" w Ustawieniach. Brak pliku nie jest błędem - stan końcowy jest ten sam.
pub fn usun_model(opis: &OpisModelu, katalog_modeli: &Path) -> Result<(), AppError> {
    for nazwa in [nazwa_docelowa(opis), nazwa_tymczasowa(opis)] {
        let sciezka = katalog_modeli.join(nazwa);
        if sciezka.exists() {
            std::fs::remove_file(&sciezka)?;
        }
    }
    Ok(())
}

/// Czy zweryfikowany plik modelu już istnieje na dysku (bez ponownego liczenia SHA-256 - to by
/// znaczyło liczyć hash nad kilkoma GB przy każdym sprawdzeniu statusu; wystarczy fakt, że plik
/// nosi docelową nazwę, bo tylko udana weryfikacja w [`pobierz_i_zweryfikuj_z_adresu`] ją nadaje).
pub fn model_pobrany(opis: &OpisModelu, katalog_modeli: &Path) -> bool {
    katalog_modeli.join(nazwa_docelowa(opis)).exists()
}

/// Serializacja `Arc<Mutex<...>>` wprost jako wnętrza - żeby komenda zwracająca `PostepPobrania`
/// mogła po prostu zamknąć uchwyt w `Arc<Mutex<_>>` bez ręcznego odblokowywania w każdym miejscu.
pub fn zrzut_postepu(postep: &Arc<Mutex<PostepPobrania>>) -> PostepPobrania {
    postep
        .lock()
        .expect("mutex postępu nie powinien być zatruty")
        .clone()
}

impl Serialize for OpisModelu {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("OpisModelu", 3)?;
        state.serialize_field("id", self.id)?;
        state.serialize_field("etykieta", self.etykieta)?;
        state.serialize_field("rozmiar_bajtow", &self.rozmiar_bajtow)?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::{TcpListener, TcpStream};

    /// W produkcji dostawcę kryptografii rustls instaluje `tauri-plugin-updater` przy starcie
    /// aplikacji. Testy budują `reqwest::blocking::Client` samodzielnie i bez tego wywołania
    /// panikują z komunikatem „No rustls crypto provider is configured" - ten sam problem i
    /// to samo rozwiązanie co w `update_manifest.rs`: instalujemy RAZ na cały proces testowy.
    fn zainstaluj_dostawce_kryptografii() {
        static RAZ: std::sync::Once = std::sync::Once::new();
        RAZ.call_once(|| {
            let _ = rustls::crypto::ring::default_provider().install_default();
        });
    }

    /// Minimalny serwer HTTP na potrzeby testów, wzorem `update_manifest.rs` - nasłuchuje na
    /// losowym wolnym porcie, obsługuje żądania GET (z opcjonalnym `Range`) i serwuje treść
    /// przekazaną z góry. W odróżnieniu od manifestu, tu treść to kilkadziesiąt bajtów
    /// (nie prawdziwy model) - testy sprawdzają SAMĄ LOGIKĘ (wznowienie, weryfikację, odrzucenie
    /// złego hasha), nie prawdziwe pobieranie gigabajtów.
    fn uruchom_serwer(tresc: &'static [u8]) -> (String, u16) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind lokalnego portu");
        let port = listener.local_addr().expect("adres lokalny").port();
        let adres = format!("http://127.0.0.1:{port}/model.gguf");

        std::thread::spawn(move || {
            for polaczenie in listener.incoming() {
                let Ok(polaczenie) = polaczenie else { break };
                obsluz_polaczenie(polaczenie, tresc);
            }
        });

        (adres, port)
    }

    fn obsluz_polaczenie(mut polaczenie: TcpStream, tresc: &[u8]) {
        let mut czytnik = BufReader::new(polaczenie.try_clone().expect("klon strumienia"));
        let mut linia_startowa = String::new();
        if czytnik.read_line(&mut linia_startowa).unwrap_or(0) == 0 {
            return;
        }

        let mut zakres_od: usize = 0;
        loop {
            let mut naglowek = String::new();
            if czytnik.read_line(&mut naglowek).unwrap_or(0) == 0 {
                break;
            }
            if naglowek.trim().is_empty() {
                break;
            }
            if let Some(wartosc) = naglowek.to_lowercase().strip_prefix("range: bytes=") {
                if let Some(od) = wartosc.trim().trim_end_matches('-').split('-').next() {
                    zakres_od = od.trim().parse().unwrap_or(0);
                }
            }
        }

        let fragment = &tresc[zakres_od.min(tresc.len())..];
        let (status_linia, dodatkowe_naglowki) = if zakres_od > 0 {
            (
                "HTTP/1.1 206 Partial Content",
                format!(
                    "Content-Range: bytes {}-{}/{}\r\n",
                    zakres_od,
                    tresc.len().saturating_sub(1),
                    tresc.len()
                ),
            )
        } else {
            ("HTTP/1.1 200 OK", String::new())
        };

        let odpowiedz = format!(
            "{status_linia}\r\nContent-Length: {}\r\n{dodatkowe_naglowki}\r\n",
            fragment.len()
        );
        let _ = polaczenie.write_all(odpowiedz.as_bytes());
        let _ = polaczenie.write_all(fragment);
    }

    fn opis_testowy(tresc: &[u8], sha256: &'static str) -> OpisModelu {
        OpisModelu {
            id: "model-testowy",
            etykieta: "Model testowy",
            url: "http://nieuzywane.test/model.gguf",
            sha256,
            rozmiar_bajtow: tresc.len() as u64,
        }
    }

    fn policz_sha256(tresc: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(tresc);
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    #[test]
    fn poprawny_plik_zostaje_zweryfikowany_i_przeniesiony_pod_docelowa_nazwe() {
        zainstaluj_dostawce_kryptografii();
        static TRESC: &[u8] = b"zawartosc-modelu-testowego-1234567890";
        let hash = Box::leak(policz_sha256(TRESC).into_boxed_str());
        let (adres, _port) = uruchom_serwer(TRESC);
        let opis = opis_testowy(TRESC, hash);
        let katalog = tempfile::tempdir().expect("katalog tymczasowy");
        let postep = Mutex::new(PostepPobrania::nowy(opis.rozmiar_bajtow));
        let anuluj = AtomicBool::new(false);

        let sciezka =
            pobierz_i_zweryfikuj_z_adresu(&opis, &adres, katalog.path(), &postep, &anuluj)
                .expect("pobranie musi się udać");

        assert!(sciezka.ends_with("model-testowy.gguf"));
        assert_eq!(std::fs::read(&sciezka).expect("odczyt pliku"), TRESC);
        assert!(!katalog.path().join(nazwa_tymczasowa(&opis)).exists());
        assert_eq!(postep.lock().unwrap().status, StatusPobrania::Zweryfikowano);
        assert!(model_pobrany(&opis, katalog.path()));
    }

    #[test]
    fn zly_hash_odrzuca_plik_i_nie_zostawia_go_pod_docelowa_nazwa() {
        zainstaluj_dostawce_kryptografii();
        static TRESC: &[u8] = b"inna-zawartosc-niz-oczekiwana";
        let (adres, _port) = uruchom_serwer(TRESC);
        let opis = opis_testowy(
            TRESC,
            "0000000000000000000000000000000000000000000000000000000000000000",
        );
        let katalog = tempfile::tempdir().expect("katalog tymczasowy");
        let postep = Mutex::new(PostepPobrania::nowy(opis.rozmiar_bajtow));
        let anuluj = AtomicBool::new(false);

        let blad = pobierz_i_zweryfikuj_z_adresu(&opis, &adres, katalog.path(), &postep, &anuluj)
            .expect_err("zła suma SHA-256 musi zostać odrzucona");

        assert!(matches!(blad, AppError::Io(_)));
        assert!(!katalog.path().join(nazwa_docelowa(&opis)).exists());
        assert!(!katalog.path().join(nazwa_tymczasowa(&opis)).exists());
        assert!(!model_pobrany(&opis, katalog.path()));
    }

    /// Symuluje przerwane pobieranie: plik `.part` z połową treści już leży na dysku, drugie
    /// wywołanie musi wysłać `Range` i DOPISAĆ resztę, a nie zacząć od nowa ani zdublować treści.
    #[test]
    fn wznawia_przerwane_pobieranie_zamiast_pobierac_od_nowa() {
        zainstaluj_dostawce_kryptografii();
        static TRESC: &[u8] =
            b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-dopelnienie-do-testu-wznowienia";
        let hash = Box::leak(policz_sha256(TRESC).into_boxed_str());
        let (adres, _port) = uruchom_serwer(TRESC);
        let opis = opis_testowy(TRESC, hash);
        let katalog = tempfile::tempdir().expect("katalog tymczasowy");

        let polowa = TRESC.len() / 2;
        std::fs::write(
            katalog.path().join(nazwa_tymczasowa(&opis)),
            &TRESC[..polowa],
        )
        .expect("zapis częściowego pliku");

        let postep = Mutex::new(PostepPobrania::nowy(opis.rozmiar_bajtow));
        let anuluj = AtomicBool::new(false);
        let sciezka =
            pobierz_i_zweryfikuj_z_adresu(&opis, &adres, katalog.path(), &postep, &anuluj)
                .expect("wznowione pobranie musi się udać");

        assert_eq!(std::fs::read(&sciezka).expect("odczyt pliku"), TRESC);
    }

    #[test]
    fn anulowanie_w_trakcie_przerywa_pobieranie_i_nie_zostawia_gotowego_pliku() {
        zainstaluj_dostawce_kryptografii();
        static TRESC: &[u8] = &[7u8; 200_000];
        let hash = Box::leak(policz_sha256(TRESC).into_boxed_str());
        let (adres, _port) = uruchom_serwer(TRESC);
        let opis = opis_testowy(TRESC, hash);
        let katalog = tempfile::tempdir().expect("katalog tymczasowy");
        let postep = Mutex::new(PostepPobrania::nowy(opis.rozmiar_bajtow));
        let anuluj = AtomicBool::new(true);

        let blad = pobierz_i_zweryfikuj_z_adresu(&opis, &adres, katalog.path(), &postep, &anuluj)
            .expect_err("anulowanie musi przerwać pobieranie błędem");

        assert!(matches!(blad, AppError::Validation(_)));
        assert!(!model_pobrany(&opis, katalog.path()));
    }

    #[test]
    fn usun_model_czysci_zarowno_gotowy_plik_jak_i_porzucona_tresc_tymczasowa() {
        static TRESC: &[u8] = b"zawartosc-do-usuniecia";
        let opis = opis_testowy(TRESC, "cokolwiek");
        let katalog = tempfile::tempdir().expect("katalog tymczasowy");
        std::fs::write(katalog.path().join(nazwa_docelowa(&opis)), TRESC).expect("zapis");
        std::fs::write(katalog.path().join(nazwa_tymczasowa(&opis)), b"resztki").expect("zapis");

        usun_model(&opis, katalog.path()).expect("usunięcie musi się udać");

        assert!(!katalog.path().join(nazwa_docelowa(&opis)).exists());
        assert!(!katalog.path().join(nazwa_tymczasowa(&opis)).exists());
    }

    /// Każdy kandydat musi mieć sumę SHA-256 zgodnej długości (64 znaki hex) - literówka przy
    /// ręcznym przepisywaniu z Hugging Face inaczej zostałaby wykryta dopiero przy pierwszym
    /// realnym pobraniu wielu gigabajtów.
    #[test]
    fn wszyscy_kandydaci_maja_poprawna_dlugosc_sha256() {
        for kandydat in KANDYDACI {
            assert_eq!(
                kandydat.sha256.len(),
                64,
                "kandydat {} ma sumę SHA-256 o złej długości",
                kandydat.id
            );
            assert!(
                kandydat.sha256.chars().all(|c| c.is_ascii_hexdigit()),
                "kandydat {} ma sumę SHA-256 zawierającą znak spoza hex",
                kandydat.id
            );
        }
    }
}
