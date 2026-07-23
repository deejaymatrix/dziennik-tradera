//! Lekkie sprawdzanie manifestu aktualizacji (Cel 1.8).
//!
//! Wtyczka `tauri-plugin-updater` pobiera manifest i weryfikuje podpis za każdym razem, gdy
//! zawoła się `check()`. Przy sprawdzaniu co dziesięć minut, na każdej instalacji, to niepotrzebny
//! ruch: w zdecydowanej większości przypadków manifest się nie zmienił.
//!
//! Ten moduł robi ŻĄDANIE WARUNKOWE - wysyła `If-None-Match` z zapamiętanym `ETag` i kończy się
//! na odpowiedzi `304 Not Modified`, bez pobierania treści. Dopiero gdy manifest naprawdę się
//! zmienił, aplikacja woła wtyczkę, która wykonuje pełne sprawdzenie z weryfikacją podpisu.
//!
//! **Ten moduł niczego nie instaluje i nie weryfikuje podpisów.** Jest wyłącznie tanim
//! sygnałem „czy w ogóle jest o czym rozmawiać". Instalacja i weryfikacja pozostają w całości
//! po stronie wtyczki - dzięki temu żadna decyzja bezpieczeństwa nie zależy od tego kodu.
//!
//! Warstwa dostawcy jest odseparowana: adres manifestu jest jedną stałą, więc zmiana GitHub
//! Releases na własną domenę (np. magazyn obiektowy) to zmiana adresu, nie przebudowa logiki.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Adres manifestu aktualizacji.
///
/// MUSI być zgodny z `plugins.updater.endpoints` w `tauri.conf.json` - to wtyczka faktycznie
/// pobiera i weryfikuje aktualizację, a ten moduł tylko podgląda ten sam plik. Rozjazd oznaczałby,
/// że aplikacja sprawdza jeden adres, a aktualizuje się z innego. Pilnuje tego test na końcu pliku.
pub const ADRES_MANIFESTU: &str =
    "https://github.com/deejaymatrix/dziennik-tradera/releases/latest/download/latest.json";

/// Nazwa platformy w manifeście. Celowo tylko Windows x64 - inne platformy nie są wydawane.
pub const PLATFORMA: &str = "windows-x86_64";

/// Ile czekamy na odpowiedź serwera. Sprawdzanie aktualizacji nie może w żadnym wypadku
/// spowalniać pracy w aplikacji, więc próg jest niski - nieudane sprawdzenie po prostu
/// powtórzy się przy następnym cyklu.
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct WpisPlatformy {
    pub signature: String,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ManifestAktualizacji {
    pub version: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub pub_date: Option<String>,
    pub platforms: std::collections::HashMap<String, WpisPlatformy>,
}

impl ManifestAktualizacji {
    /// Wpis dla Windows x64. `None`, gdy manifest go nie ma - taki manifest jest dla tej
    /// aplikacji bezużyteczny i nie ma sensu pokazywać użytkownikowi aktualizacji, której
    /// nie da się zainstalować.
    pub fn wpis_windows(&self) -> Option<&WpisPlatformy> {
        self.platforms.get(PLATFORMA)
    }
}

/// Wynik lekkiego sprawdzenia.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WynikSprawdzenia {
    /// Serwer odpowiedział `304` - manifest bez zmian, nie ma czego robić.
    BezZmian,
    /// Manifest się zmienił (albo sprawdzamy pierwszy raz).
    Nowy {
        manifest: ManifestAktualizacji,
        /// `ETag` do zapamiętania na następne żądanie warunkowe.
        etag: Option<String>,
    },
}

/// Sprawdza manifest, wysyłając `If-None-Match` gdy znamy poprzedni `ETag`.
///
/// Zwraca błąd tylko wtedy, gdy sprawdzenie się NIE odbyło (brak sieci, timeout, błąd serwera,
/// nieczytelny manifest). Wywołujący traktuje to jako nieudane sprawdzenie i ponawia zgodnie
/// z własnym backoffem - nigdy jako powód do zatrzymania pracy aplikacji.
pub async fn sprawdz(etag: Option<&str>) -> Result<WynikSprawdzenia, AppError> {
    sprawdz_pod_adresem(ADRES_MANIFESTU, etag).await
}

/// Ta sama logika co [`sprawdz`], ale z adresem jako parametrem - wydzielone wyłącznie po to,
/// żeby testy mogły podstawić lokalny serwer zamiast prawdziwego GitHuba. `sprawdz` jest
/// jedynym publicznym wejściem używanym przez resztę aplikacji.
async fn sprawdz_pod_adresem(
    adres: &str,
    etag: Option<&str>,
) -> Result<WynikSprawdzenia, AppError> {
    let klient = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| AppError::io(format!("nie można utworzyć klienta HTTP: {e}")))?;

    let mut zadanie = klient.get(adres);
    if let Some(etag) = etag {
        zadanie = zadanie.header(reqwest::header::IF_NONE_MATCH, etag);
    }

    let odpowiedz = zadanie
        .send()
        .await
        .map_err(|e| AppError::io(format!("nie udało się pobrać manifestu aktualizacji: {e}")))?;

    if odpowiedz.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(WynikSprawdzenia::BezZmian);
    }
    if !odpowiedz.status().is_success() {
        return Err(AppError::io(format!(
            "serwer aktualizacji odpowiedział kodem {}",
            odpowiedz.status()
        )));
    }

    let nowy_etag = odpowiedz
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let tresc = odpowiedz
        .text()
        .await
        .map_err(|e| AppError::io(format!("nie udało się odczytać manifestu: {e}")))?;

    let manifest = zparsuj(&tresc)?;
    Ok(WynikSprawdzenia::Nowy {
        manifest,
        etag: nowy_etag,
    })
}

/// Parsowanie wydzielone z żądania, żeby dało się je przetestować bez sieci.
pub fn zparsuj(tresc: &str) -> Result<ManifestAktualizacji, AppError> {
    let manifest: ManifestAktualizacji = serde_json::from_str(tresc).map_err(|e| {
        AppError::io(format!(
            "manifest aktualizacji ma nieprawidłowy format: {e}"
        ))
    })?;
    if manifest.version.trim().is_empty() {
        return Err(AppError::io(
            "manifest aktualizacji nie podaje numeru wersji".to_string(),
        ));
    }
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// W produkcji dostawcę kryptografii rustls instaluje `tauri-plugin-updater` przy starcie
    /// aplikacji. Testy budują `reqwest::Client` samodzielnie i bez tego wywołania panikują
    /// z komunikatem „No rustls crypto provider is configured" - instalujemy go RAZ na cały
    /// proces testowy, niezależnie od tego, ile testów faktycznie robi żądanie HTTPS.
    fn zainstaluj_dostawce_kryptografii() {
        static RAZ: std::sync::Once = std::sync::Once::new();
        RAZ.call_once(|| {
            let _ = rustls::crypto::ring::default_provider().install_default();
        });
    }

    const POPRAWNY: &str = r#"{
        "version": "1.2.3",
        "notes": "Poprawki i nowe raporty",
        "pub_date": "2026-08-01T10:00:00Z",
        "platforms": {
            "windows-x86_64": {
                "signature": "dW50cnVzdGVk",
                "url": "https://przyklad.test/DziennikTradera_1.2.3_x64-setup.exe"
            }
        }
    }"#;

    #[test]
    fn parsuje_poprawny_manifest_z_wpisem_windows() {
        let manifest = zparsuj(POPRAWNY).expect("manifest");
        assert_eq!(manifest.version, "1.2.3");
        assert_eq!(manifest.notes.as_deref(), Some("Poprawki i nowe raporty"));
        let wpis = manifest.wpis_windows().expect("wpis windows");
        assert!(wpis.url.ends_with(".exe"));
        assert!(!wpis.signature.is_empty());
    }

    /// Manifest bez wpisu dla Windows jest dla tej aplikacji bezużyteczny - nie ma sensu
    /// pokazywać użytkownikowi aktualizacji, której nie da się zainstalować.
    #[test]
    fn manifest_bez_windows_nie_daje_wpisu() {
        let bez_windows = r#"{
            "version": "1.2.3",
            "platforms": { "darwin-x86_64": { "signature": "x", "url": "https://x.test/a.dmg" } }
        }"#;
        let manifest = zparsuj(bez_windows).expect("manifest");
        assert!(manifest.wpis_windows().is_none());
    }

    /// Pola opisowe są opcjonalne - starszy albo minimalny manifest nadal musi się wczytać.
    #[test]
    fn brak_opisu_i_daty_nie_psuje_manifestu() {
        let minimalny = r#"{
            "version": "1.0.0",
            "platforms": { "windows-x86_64": { "signature": "s", "url": "https://x.test/a.exe" } }
        }"#;
        let manifest = zparsuj(minimalny).expect("manifest");
        assert_eq!(manifest.notes, None);
        assert_eq!(manifest.pub_date, None);
    }

    #[test]
    fn nieczytelny_manifest_jest_odrzucany() {
        zparsuj("{to nie jest JSON").expect_err("uszkodzony manifest musi być odrzucony");
    }

    /// Manifest bez numeru wersji nie pozwala na ŻADNE porównanie, więc jest tak samo
    /// bezużyteczny jak uszkodzony - lepiej odrzucić go tutaj niż pokazać pustą wersję.
    #[test]
    fn manifest_bez_wersji_jest_odrzucany() {
        let bez_wersji = r#"{
            "version": "   ",
            "platforms": { "windows-x86_64": { "signature": "s", "url": "https://x.test/a.exe" } }
        }"#;
        zparsuj(bez_wersji).expect_err("manifest bez wersji musi być odrzucony");
    }

    /// Adres, który podgląda ten moduł, MUSI być tym samym, z którego wtyczka faktycznie
    /// pobiera aktualizację. Rozjazd oznaczałby, że aplikacja sprawdza jeden adres,
    /// a aktualizuje się z innego - i nikt by tego nie zauważył do pierwszego wydania.
    #[test]
    fn adres_manifestu_zgadza_sie_z_konfiguracja_tauri() {
        let konfiguracja = include_str!("../../tauri.conf.json");
        assert!(
            konfiguracja.contains(ADRES_MANIFESTU),
            "adres w update_manifest.rs nie występuje w tauri.conf.json"
        );
    }

    /// Timeout musi być na tyle krótki, żeby nieudane sprawdzenie nie wisiało w tle -
    /// sprawdzanie aktualizacji nie ma prawa spowalniać pracy w aplikacji.
    #[test]
    fn timeout_jest_krotki() {
        assert!(TIMEOUT <= Duration::from_secs(15));
    }

    /// Minimalny serwer HTTP na potrzeby testów - bez żadnej nowej zależności. Nasłuchuje na
    /// losowym wolnym porcie, obsługuje JEDNO żądanie i zamyka się. Zwraca adres bazowy oraz
    /// uchwyt do wątku, żeby test mógł poczekać na jego zakończenie.
    ///
    /// Audyt Celu 1.8 wymaga sprawdzenia realnych odpowiedzi 4xx/5xx, 304 i nagłówków -
    /// testy na samych stringach (`zparsuj`) tego nie pokrywają, bo omijają cały klienta HTTP
    /// (budowę żądania, nagłówki, obsługę statusu).
    struct MockOdpowiedz {
        status_linia: &'static str,
        naglowki: Vec<(&'static str, String)>,
        tresc: String,
    }

    fn uruchom_serwer(
        odpowiedz: MockOdpowiedz,
    ) -> (String, std::thread::JoinHandle<Option<String>>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind lokalnego portu");
        let port = listener.local_addr().expect("adres lokalny").port();
        let adres = format!("http://127.0.0.1:{port}/latest.json");

        let uchwyt = std::thread::spawn(move || -> Option<String> {
            let (mut polaczenie, _) = listener.accept().ok()?;
            let mut bufor = [0u8; 4096];
            let n = polaczenie.read(&mut bufor).ok()?;
            let zadanie = String::from_utf8_lossy(&bufor[..n]).to_string();

            let mut naglowki_tekst = String::new();
            for (nazwa, wartosc) in &odpowiedz.naglowki {
                naglowki_tekst.push_str(&format!("{nazwa}: {wartosc}\r\n"));
            }
            let odpowiedz_tekst = format!(
                "{}\r\nContent-Length: {}\r\n{}\r\n{}",
                odpowiedz.status_linia,
                odpowiedz.tresc.len(),
                naglowki_tekst,
                odpowiedz.tresc
            );
            polaczenie
                .write_all(odpowiedz_tekst.as_bytes())
                .expect("zapis odpowiedzi");
            Some(zadanie)
        });

        (adres, uchwyt)
    }

    #[tokio::test]
    async fn odpowiedz_404_daje_czytelny_blad() {
        zainstaluj_dostawce_kryptografii();
        let (adres, uchwyt) = uruchom_serwer(MockOdpowiedz {
            status_linia: "HTTP/1.1 404 Not Found",
            naglowki: vec![],
            tresc: String::new(),
        });

        let blad = sprawdz_pod_adresem(&adres, None)
            .await
            .expect_err("404 musi dać błąd");
        assert!(blad.to_string().contains("404"));
        uchwyt.join().expect("wątek serwera").expect("żądanie odebrane");
    }

    #[tokio::test]
    async fn odpowiedz_500_daje_czytelny_blad() {
        zainstaluj_dostawce_kryptografii();
        let (adres, uchwyt) = uruchom_serwer(MockOdpowiedz {
            status_linia: "HTTP/1.1 500 Internal Server Error",
            naglowki: vec![],
            tresc: String::new(),
        });

        let blad = sprawdz_pod_adresem(&adres, None)
            .await
            .expect_err("500 musi dać błąd");
        assert!(blad.to_string().contains("500"));
        uchwyt.join().expect("wątek serwera").expect("żądanie odebrane");
    }

    #[tokio::test]
    async fn odpowiedz_304_daje_wynik_bez_zmian_bez_pobierania_tresci() {
        zainstaluj_dostawce_kryptografii();
        let (adres, uchwyt) = uruchom_serwer(MockOdpowiedz {
            status_linia: "HTTP/1.1 304 Not Modified",
            naglowki: vec![],
            tresc: String::new(),
        });

        let wynik = sprawdz_pod_adresem(&adres, Some("\"stary-etag\""))
            .await
            .expect("304 musi się udać");
        assert_eq!(wynik, WynikSprawdzenia::BezZmian);

        let zadanie = uchwyt.join().expect("wątek serwera").expect("żądanie");
        assert!(
            zadanie.contains("If-None-Match: \"stary-etag\""),
            "żądanie warunkowe musi wysyłać ETag: {zadanie}"
        );
    }

    #[tokio::test]
    async fn manifest_uszkodzony_w_prawdziwej_odpowiedzi_http_jest_odrzucany() {
        zainstaluj_dostawce_kryptografii();
        let (adres, uchwyt) = uruchom_serwer(MockOdpowiedz {
            status_linia: "HTTP/1.1 200 OK",
            naglowki: vec![("Content-Type", "application/json".to_string())],
            tresc: "{to nie jest poprawny JSON".to_string(),
        });

        sprawdz_pod_adresem(&adres, None)
            .await
            .expect_err("uszkodzona treść musi zostać odrzucona nawet przy statusie 200");
        uchwyt.join().expect("wątek serwera").expect("żądanie odebrane");
    }

    #[tokio::test]
    async fn nowy_manifest_przechwytuje_etag_z_naglowka_odpowiedzi() {
        zainstaluj_dostawce_kryptografii();
        let (adres, uchwyt) = uruchom_serwer(MockOdpowiedz {
            status_linia: "HTTP/1.1 200 OK",
            naglowki: vec![("ETag", "\"nowy-etag-123\"".to_string())],
            tresc: POPRAWNY.to_string(),
        });

        let wynik = sprawdz_pod_adresem(&adres, None).await.expect("sprawdzenie");
        match wynik {
            WynikSprawdzenia::Nowy { etag, manifest } => {
                assert_eq!(etag.as_deref(), Some("\"nowy-etag-123\""));
                assert_eq!(manifest.version, "1.2.3");
            }
            inny => panic!("oczekiwano Nowy, jest {inny:?}"),
        }
        uchwyt.join().expect("wątek serwera").expect("żądanie odebrane");
    }

    /// Błąd DNS - host, który na pewno nie istnieje. Musi zakończyć się BŁĘDEM zwróconym
    /// wywołującemu (harmonogram traktuje to jak nieudane sprawdzenie), nie paniką.
    #[tokio::test]
    async fn nieistniejacy_host_daje_blad_a_nie_panike() {
        zainstaluj_dostawce_kryptografii();
        let wynik = sprawdz_pod_adresem(
            "https://ten-host-na-pewno-nie-istnieje.invalid/latest.json",
            None,
        )
        .await;
        assert!(wynik.is_err(), "nieistniejący host musi dać błąd");
    }
}
