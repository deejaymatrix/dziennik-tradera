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
    let klient = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| AppError::io(format!("nie można utworzyć klienta HTTP: {e}")))?;

    let mut zadanie = klient.get(ADRES_MANIFESTU);
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
}
