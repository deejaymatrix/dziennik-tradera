use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static LOG_FILE_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Ustawia lokalizację lokalnego pliku diagnostycznego (bez wysyłki gdziekolwiek).
/// Wywoływane raz, przy starcie aplikacji.
pub fn init(app_data_dir: &Path) {
    let logs_dir = app_data_dir.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);
    let _ = LOG_FILE_PATH.set(logs_dir.join("diagnostics.log"));
}

/// Zapisuje błąd do lokalnego logu diagnostycznego. Nigdy nie wysyła danych nigdzie poza
/// dyskiem użytkownika (brak telemetrii) i nie powinno się do niego przekazywać treści
/// wrażliwych (haseł, danych osobowych) — tylko techniczny kontekst błędu.
pub fn log_error(context: &str, err: &dyn std::fmt::Display) {
    write_line("ERROR", context, &err.to_string());
}

/// Zapisuje informacyjny wpis diagnostyczny (np. jakie migracje zostały zastosowane).
pub fn log_info(context: &str, message: &str) {
    write_line("INFO", context, message);
}

/// Ostatnie linie logu do raportu diagnostycznego, ze ZANONIMIZOWANYMI ścieżkami.
///
/// Ścieżki są jedynym miejscem, w którym do logu może trafić coś prywatnego - nazwa konta
/// Windows siedzi w każdym `C:\Users\<imię>\...`. Zamieniamy ją na `<UŻYTKOWNIK>`, żeby raport
/// dało się komuś wysłać bez ujawniania, kto go wygenerował.
pub fn recent_lines(limit: usize) -> Vec<String> {
    let Some(path) = LOG_FILE_PATH.get() else {
        return Vec::new();
    };
    let Ok(content) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let lines: Vec<&str> = content.lines().collect();
    lines
        .iter()
        .rev()
        .take(limit)
        .rev()
        .map(|line| redact_paths(line))
        .collect()
}

/// Podmienia katalog domowy użytkownika w tekście na `<UŻYTKOWNIK>`.
fn redact_paths(line: &str) -> String {
    let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) else {
        return line.to_string();
    };
    let home = home.to_string_lossy().to_string();
    if home.is_empty() {
        return line.to_string();
    }
    // Ścieżki w logu bywają zapisane oboma rodzajami ukośnika, zależnie od źródła.
    line.replace(&home, "<UŻYTKOWNIK>")
        .replace(&home.replace('\\', "/"), "<UŻYTKOWNIK>")
}

fn write_line(level: &str, context: &str, message: &str) {
    let line = format!(
        "{} {level} [{}] {}\n",
        chrono::Utc::now().to_rfc3339(),
        context,
        message
    );

    match LOG_FILE_PATH.get() {
        Some(path) => {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = file.write_all(line.as_bytes());
            }
        }
        None => eprint!("{line}"),
    }
}
