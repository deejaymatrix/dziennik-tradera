//! Zgodność numeru wersji między trzema plikami, które muszą go trzymać identycznie.
//!
//! Wersja aplikacji jest zapisana w trzech miejscach: `Cargo.toml` (binarka), `tauri.conf.json`
//! (bundle i **porównanie wersji przez wtyczkę aktualizacji**) oraz `package.json` (frontend).
//! Nic w narzędziach nie pilnuje, żeby były zgodne.
//!
//! Rozjazd nie jest kosmetyczny - psuje autoaktualizację w sposób, którego nie widać przy
//! wydawaniu, tylko u użytkownika:
//!
//! - gdy `tauri.conf.json` zostaje w tyle, aplikacja przedstawia się starszą wersją, więc
//!   po zainstalowaniu aktualizacji **dalej widzi ją jako dostępną** i proponuje w kółko;
//! - gdy wyprzedza, aktualizacja **nigdy się nie pokaże**, bo zainstalowana wersja wygląda
//!   na nowszą niż ta w manifeście.
//!
//! Oba przypadki są ciche i wychodzą dopiero po wydaniu, więc pilnuje ich test.

/// Wersja z `Cargo.toml`, wstawiana przez Cargo przy kompilacji.
pub const WERSJA_CARGO: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    /// Wyciąga wartość pola `"version"` z najwyższego poziomu pliku JSON. Świadomie bez
    /// pełnego parsera - `package.json` frontendu nie jest zależnością tej skrzynki, a wersja
    /// jest zawsze płaskim polem tekstowym.
    fn wersja_z_json(zrodlo: &str) -> String {
        let klucz = "\"version\"";
        let start = zrodlo.find(klucz).expect("plik musi mieć pole \"version\"");
        let reszta = &zrodlo[start + klucz.len()..];
        let dwukropek = reszta.find(':').expect("pole version musi mieć wartość");
        let po = &reszta[dwukropek + 1..];
        let otwarcie = po.find('"').expect("wartość version musi być tekstem");
        let po_otwarciu = &po[otwarcie + 1..];
        let zamkniecie = po_otwarciu.find('"').expect("niedomknięta wartość version");
        po_otwarciu[..zamkniecie].to_string()
    }

    #[test]
    fn wersja_jest_taka_sama_w_cargo_tauri_i_package_json() {
        let tauri = wersja_z_json(include_str!("../tauri.conf.json"));
        let package = wersja_z_json(include_str!("../../package.json"));

        assert_eq!(
            WERSJA_CARGO, tauri,
            "Cargo.toml i tauri.conf.json mają różne wersje - wtyczka aktualizacji porównuje \
             wersję z tauri.conf.json, więc aktualizacja albo nigdy się nie pokaże, albo będzie \
             proponowana w kółko po zainstalowaniu"
        );
        assert_eq!(
            WERSJA_CARGO, package,
            "Cargo.toml i package.json mają różne wersje - wydanie zostanie nazwane inaczej, \
             niż przedstawia się aplikacja"
        );
    }

    /// Numer wersji musi dać się porównać przez wtyczkę aktualizacji, która stosuje semver.
    /// „1.0" albo „v1.0.0" nie przejdą tego porównania i aktualizacje przestaną działać.
    #[test]
    fn wersja_ma_ksztalt_semver() {
        let czesci: Vec<&str> = WERSJA_CARGO.split('.').collect();
        assert_eq!(
            czesci.len(),
            3,
            "wersja \"{WERSJA_CARGO}\" nie ma trzech członów - wtyczka aktualizacji porównuje \
             wersje według semver"
        );
        for czesc in czesci {
            // Człon z przedrostkiem wydania (np. „0-rc1") jest dopuszczalny w semver, więc
            // sprawdzamy tylko, że zaczyna się od cyfry.
            assert!(
                czesc.chars().next().is_some_and(|c| c.is_ascii_digit()),
                "człon wersji \"{czesc}\" nie zaczyna się od cyfry"
            );
        }
    }
}
