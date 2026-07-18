/// Zwraca numer wersji aplikacji z Cargo.toml - używane m.in. w module
/// Ustawienia (docs/specyfikacja-produktu.md §8.14: "numer wersji, diagnostyka...")
/// oraz w Centrum synchronizacji i aktualizacji (§8.15).
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_version_zwraca_wersje_z_cargo_toml() {
        assert_eq!(app_version(), env!("CARGO_PKG_VERSION"));
    }
}
