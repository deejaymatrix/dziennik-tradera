use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Wersja schematu preferencji. Podnoś ją TYLKO wtedy, gdy zmiana nie da się wyrazić samym
/// `#[serde(default)]` (np. pole zmienia znaczenie) - zwykłe dodanie nowego ustawienia obsługuje
/// już mechanizm wartości domyślnych i nie wymaga podbicia wersji.
pub const PREFERENCES_VERSION: i64 = 2;

/// Makro-skrót dla pól wyliczeniowych: brak wartości w starszej bazie ma bezpiecznie przyjąć
/// wartość domyślną, a NIE wywalić odczytu. Każde pole poniżej ma `#[serde(default)]` właśnie
/// dlatego - to jest mechanizm "brak ustawienia w starszej bazie przyjmuje nową domyślną"
/// wymagany przez specyfikację, bez pisania osobnej migracji danych na każde nowe pole.
fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------------------------
// Sekcja: Wygląd
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    #[default]
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Density {
    Compact,
    #[default]
    Standard,
    Spacious,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CornerRadius {
    Small,
    #[default]
    Standard,
    Large,
}

/// Skala interfejsu w procentach - lista zamknięta, bo specyfikacja wprost zabrania wpisywania
/// dowolnej skali (dowolna wartość CSS potrafi rozjechać cały układ nie do naprawienia z UI).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UiScale {
    #[serde(rename = "90")]
    Ninety,
    #[default]
    #[serde(rename = "100")]
    Hundred,
    #[serde(rename = "110")]
    HundredTen,
    #[serde(rename = "120")]
    HundredTwenty,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppearancePreferences {
    #[serde(default)]
    pub theme: ThemeMode,
    /// Kolor akcentu jako `#rrggbb`. Kolory SEMANTYCZNE (zysk/strata/ostrzeżenie/informacja/BE)
    /// celowo nie są konfigurowalne - zielony zysk i czerwona strata to konwencja, której zmiana
    /// czyniłaby dziennik nieczytelnym.
    #[serde(default = "default_accent")]
    pub accent_color: String,
    #[serde(default)]
    pub ui_scale: UiScale,
    #[serde(default)]
    pub density: Density,
    #[serde(default)]
    pub corner_radius: CornerRadius,
    #[serde(default = "default_true")]
    pub animations: bool,
    #[serde(default)]
    pub reduce_motion: bool,
    #[serde(default)]
    pub sidebar_collapsed: bool,
    #[serde(default = "default_true")]
    pub show_nav_labels: bool,
    #[serde(default = "default_true")]
    pub remember_column_widths: bool,
}

fn default_accent() -> String {
    "#d7b45a".to_string()
}

impl Default for AppearancePreferences {
    fn default() -> Self {
        Self {
            theme: ThemeMode::default(),
            accent_color: default_accent(),
            ui_scale: UiScale::default(),
            density: Density::default(),
            corner_radius: CornerRadius::default(),
            animations: true,
            reduce_motion: false,
            sidebar_collapsed: false,
            show_nav_labels: true,
            remember_column_widths: true,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Sekcja: Zachowanie aplikacji
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum StartupView {
    #[default]
    Dashboard,
    Transactions,
    Accounts,
    Reports,
}

/// Częstotliwość autozapisu szkicu. Sam autozapis jest ZAWSZE aktywny - użytkownik steruje
/// wyłącznie tym, jak często, bo wyłączenie go oznaczałoby realną utratę pracy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DraftAutosaveSeconds {
    #[serde(rename = "5")]
    Five,
    #[default]
    #[serde(rename = "10")]
    Ten,
    #[serde(rename = "30")]
    Thirty,
}

impl DraftAutosaveSeconds {
    pub fn as_seconds(self) -> i64 {
        match self {
            DraftAutosaveSeconds::Five => 5,
            DraftAutosaveSeconds::Ten => 10,
            DraftAutosaveSeconds::Thirty => 30,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BehaviorPreferences {
    #[serde(default)]
    pub startup_view: StartupView,
    /// Ma PIERWSZEŃSTWO przed `startup_view`, gdy włączone - zależność wyjaśniona w interfejsie.
    #[serde(default)]
    pub open_last_tab: bool,
    #[serde(default = "default_true")]
    pub remember_last_account: bool,
    #[serde(default = "default_true")]
    pub restore_window_bounds: bool,
    #[serde(default = "default_true")]
    pub show_field_hints: bool,
    #[serde(default)]
    pub draft_autosave_seconds: DraftAutosaveSeconds,
    #[serde(default)]
    pub open_details_after_save: bool,
    #[serde(default = "default_true")]
    pub remember_expanded_panels: bool,
    #[serde(default = "default_true")]
    pub show_save_confirmation: bool,
    #[serde(default = "default_true")]
    pub confirm_move_to_trash: bool,
    #[serde(default = "default_true")]
    pub confirm_permanent_operation: bool,
    #[serde(default = "default_true")]
    pub warn_overwrite_import: bool,
    #[serde(default = "default_true")]
    pub warn_unfulfilled_rule: bool,
}

impl Default for BehaviorPreferences {
    fn default() -> Self {
        Self {
            startup_view: StartupView::default(),
            open_last_tab: false,
            remember_last_account: true,
            restore_window_bounds: true,
            show_field_hints: true,
            draft_autosave_seconds: DraftAutosaveSeconds::default(),
            open_details_after_save: false,
            remember_expanded_panels: true,
            show_save_confirmation: true,
            confirm_move_to_trash: true,
            confirm_permanent_operation: true,
            warn_overwrite_import: true,
            warn_unfulfilled_rule: true,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Sekcja: Domyślne wartości
// ---------------------------------------------------------------------------------------------

/// Domyślne konto nowej transakcji. Celowo NIE ma tu domyślnego instrumentu, kierunku BUY/SELL
/// ani strategii - specyfikacja wymaga, żeby te trzy pola zawsze wymagały świadomego wyboru,
/// bo zapisane z przyzwyczajenia fałszują cały dziennik.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(tag = "kind", content = "account_id", rename_all = "snake_case")]
pub enum DefaultAccount {
    #[default]
    LastUsed,
    None,
    Specific(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PriceOrPoints {
    #[default]
    Price,
    Points,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DecimalSeparator {
    #[default]
    Comma,
    Dot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RankingSize {
    #[serde(rename = "5")]
    Five,
    #[default]
    #[serde(rename = "10")]
    Ten,
    #[serde(rename = "20")]
    Twenty,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DefaultsPreferences {
    #[serde(default)]
    pub default_account: DefaultAccount,
    #[serde(default)]
    pub default_interval_id: Option<String>,
    #[serde(default)]
    pub default_session: Option<String>,
    #[serde(default = "default_date_format")]
    pub date_format: String,
    #[serde(default)]
    pub time_with_seconds: bool,
    #[serde(default)]
    pub decimal_separator: DecimalSeparator,
    /// Wartość STARTOWA pola ryzyka w kalkulatorze, nigdy narzucona reguła inwestycyjna.
    /// Zakres 0,01-100% pilnuje `validate`.
    #[serde(default = "default_risk_percent")]
    pub calculator_risk_percent: Decimal,
    #[serde(default)]
    pub calculator_sl_mode: PriceOrPoints,
    #[serde(default)]
    pub calculator_tp_mode: PriceOrPoints,
    #[serde(default = "default_true")]
    pub calculator_show_details: bool,
    #[serde(default = "default_true")]
    pub calculator_include_commission: bool,
    #[serde(default = "default_true")]
    pub report_include_costs: bool,
    /// Domyślnie WYŁĄCZONE - otwarte pozycje nie mają jeszcze ostatecznego wyniku.
    #[serde(default)]
    pub report_include_open: bool,
    #[serde(default)]
    pub report_ranking_size: RankingSize,
    #[serde(default = "default_true")]
    pub report_remember_filters: bool,
}

fn default_date_format() -> String {
    "DD.MM.YYYY".to_string()
}

fn default_risk_percent() -> Decimal {
    Decimal::ONE
}

impl Default for DefaultsPreferences {
    fn default() -> Self {
        Self {
            default_account: DefaultAccount::default(),
            default_interval_id: None,
            default_session: None,
            date_format: default_date_format(),
            time_with_seconds: false,
            decimal_separator: DecimalSeparator::default(),
            calculator_risk_percent: default_risk_percent(),
            calculator_sl_mode: PriceOrPoints::default(),
            calculator_tp_mode: PriceOrPoints::default(),
            calculator_show_details: true,
            calculator_include_commission: true,
            report_include_costs: true,
            report_include_open: false,
            report_ranking_size: RankingSize::default(),
            report_remember_filters: true,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Sekcja: Powiadomienia
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NotificationPreferences {
    #[serde(default = "default_true")]
    pub update_available: bool,
    #[serde(default = "default_true")]
    pub update_completed: bool,
    #[serde(default = "default_true")]
    pub update_failed: bool,
    #[serde(default = "default_true")]
    pub backup_failed: bool,
    #[serde(default)]
    pub sound: bool,
    #[serde(default = "default_true")]
    pub remind_unfinished_draft: bool,
    #[serde(default)]
    pub remind_missing_emotions: bool,
    #[serde(default)]
    pub remind_missing_attachment: bool,
    #[serde(default = "default_true")]
    pub remind_unfulfilled_rule: bool,
    #[serde(default)]
    pub quiet_hours_enabled: bool,
    /// Godziny w formacie `HH:MM` (24h). Przedział może przechodzić przez północ.
    #[serde(default = "default_quiet_start")]
    pub quiet_hours_start: String,
    #[serde(default = "default_quiet_end")]
    pub quiet_hours_end: String,
}

fn default_quiet_start() -> String {
    "22:00".to_string()
}

fn default_quiet_end() -> String {
    "07:00".to_string()
}

impl Default for NotificationPreferences {
    fn default() -> Self {
        Self {
            update_available: true,
            update_completed: true,
            update_failed: true,
            backup_failed: true,
            sound: false,
            remind_unfinished_draft: true,
            remind_missing_emotions: false,
            remind_missing_attachment: false,
            remind_unfulfilled_rule: true,
            quiet_hours_enabled: false,
            quiet_hours_start: default_quiet_start(),
            quiet_hours_end: default_quiet_end(),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Sekcja: Dane i kopie bezpieczeństwa
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BackupFrequency {
    #[default]
    Daily,
    EveryThreeDays,
    Weekly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BackupRetention {
    #[serde(rename = "10")]
    Ten,
    #[default]
    #[serde(rename = "30")]
    Thirty,
    #[serde(rename = "60")]
    Sixty,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct DataPreferences {
    #[serde(default)]
    pub backup_frequency: BackupFrequency,
    #[serde(default)]
    pub backup_retention: BackupRetention,
}

// ---------------------------------------------------------------------------------------------
// Komplet preferencji
// ---------------------------------------------------------------------------------------------

/// Preferencje użytkownika - JEDYNE źródło prawdy dla ustawień wizualnych i zachowania aplikacji.
///
/// Czego tu świadomie NIE MA (specyfikacja zabrania): endpointu aktualizacji, klucza publicznego,
/// kanału wydań, identyfikatora aplikacji, ścieżki bazy, parametrów instrumentów, kluczy i
/// certyfikatów, ani żadnego przełącznika wyłączającego walidację czy obowiązkowy backup przed
/// migracją. Te rzeczy nie są ustawieniami - to gwarancje poprawności aplikacji.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct Preferences {
    #[serde(default)]
    pub appearance: AppearancePreferences,
    #[serde(default)]
    pub behavior: BehaviorPreferences,
    #[serde(default)]
    pub defaults: DefaultsPreferences,
    #[serde(default)]
    pub notifications: NotificationPreferences,
    #[serde(default)]
    pub data: DataPreferences,
}

/// Nazwa sekcji przy zapisie atomowym - zapis dotyczy dokładnie jednej sekcji, a niepoprawna
/// wartość odrzuca CAŁY zapis tej sekcji (nigdy nie zapisuje jej połowy).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreferencesSection {
    Appearance,
    Behavior,
    Defaults,
    Notifications,
    Data,
}

fn validate_hex_color(label: &str, value: &str) -> Result<(), AppError> {
    let ok = value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !ok {
        return Err(AppError::Validation(format!(
            "{label} musi być kolorem w formacie #rrggbb (np. #d7b45a)."
        )));
    }
    Ok(())
}

fn validate_hhmm(label: &str, value: &str) -> Result<(), AppError> {
    let parts: Vec<&str> = value.split(':').collect();
    let valid = match parts.as_slice() {
        [hours, minutes] => {
            hours.len() == 2
                && minutes.len() == 2
                && hours.parse::<u32>().is_ok_and(|h| h < 24)
                && minutes.parse::<u32>().is_ok_and(|m| m < 60)
        }
        _ => false,
    };
    if !valid {
        return Err(AppError::Validation(format!(
            "{label} musi być godziną w formacie GG:MM (np. 22:00)."
        )));
    }
    Ok(())
}

impl Preferences {
    /// Waliduje WYŁĄCZNIE wskazaną sekcję - zapis jest per sekcja, więc błąd w jednej nie może
    /// blokować zapisu innej.
    pub fn validate_section(&self, section: PreferencesSection) -> Result<(), AppError> {
        match section {
            PreferencesSection::Appearance => {
                validate_hex_color("Kolor akcentu", &self.appearance.accent_color)?;
            }
            PreferencesSection::Defaults => {
                let risk = self.defaults.calculator_risk_percent;
                if risk < Decimal::new(1, 2) || risk > Decimal::ONE_HUNDRED {
                    return Err(AppError::Validation(
                        "Domyślne ryzyko musi mieścić się w zakresie od 0,01% do 100%.".to_string(),
                    ));
                }
                if self.defaults.date_format.trim().is_empty() {
                    return Err(AppError::Validation(
                        "Format daty nie może być pusty.".to_string(),
                    ));
                }
            }
            PreferencesSection::Notifications => {
                validate_hhmm(
                    "Początek cichych godzin",
                    &self.notifications.quiet_hours_start,
                )?;
                validate_hhmm("Koniec cichych godzin", &self.notifications.quiet_hours_end)?;
            }
            PreferencesSection::Behavior | PreferencesSection::Data => {}
        }
        Ok(())
    }

    /// Przywraca domyślne WYŁĄCZNIE w jednej sekcji. Nie dotyka danych dziennika - preferencje
    /// i dane leżą w zupełnie innych tabelach, więc reset ustawień fizycznie nie ma jak usunąć
    /// transakcji, kont, strategii, załączników ani kopii bezpieczeństwa.
    pub fn reset_section(&mut self, section: PreferencesSection) {
        match section {
            PreferencesSection::Appearance => self.appearance = AppearancePreferences::default(),
            PreferencesSection::Behavior => self.behavior = BehaviorPreferences::default(),
            PreferencesSection::Defaults => self.defaults = DefaultsPreferences::default(),
            PreferencesSection::Notifications => {
                self.notifications = NotificationPreferences::default()
            }
            PreferencesSection::Data => self.data = DataPreferences::default(),
        }
    }
}

pub trait PreferencesRepository {
    fn load(&self) -> Result<Preferences, AppError>;
    fn save(&self, preferences: &Preferences) -> Result<(), AppError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn pusty_json_daje_komplet_wartosci_domyslnych() {
        // Instalacja sprzed wprowadzenia preferencji ma w bazie zupełnie inny kształt JSON-a.
        // Odczyt MUSI się udać i przyjąć domyślne, a nie wywalić aplikacji na starcie.
        let prefs: Preferences = serde_json::from_str("{}").expect("pusty obiekt");

        assert_eq!(prefs, Preferences::default());
        assert_eq!(prefs.appearance.theme, ThemeMode::Dark);
        assert_eq!(prefs.behavior.draft_autosave_seconds.as_seconds(), 10);
        assert!(prefs.defaults.report_include_costs);
        assert!(
            !prefs.defaults.report_include_open,
            "otwarte transakcje domyślnie POZA raportem - nie mają jeszcze ostatecznego wyniku"
        );
    }

    #[test]
    fn brakujace_pojedyncze_pole_przyjmuje_wartosc_domyslna() {
        // Dokładnie przypadek "starsza baza nie zna nowego ustawienia".
        let json = r#"{"appearance":{"theme":"light"}}"#;

        let prefs: Preferences = serde_json::from_str(json).expect("częściowy obiekt");

        assert_eq!(prefs.appearance.theme, ThemeMode::Light);
        assert_eq!(
            prefs.appearance.accent_color,
            default_accent(),
            "nieznane pole ma przyjąć domyślne, a nie zostać puste"
        );
        assert_eq!(prefs.appearance.ui_scale, UiScale::Hundred);
        assert!(prefs.appearance.animations);
    }

    #[test]
    fn odczyt_i_zapis_przez_json_zachowuje_wartosci() {
        let mut prefs = Preferences::default();
        prefs.appearance.theme = ThemeMode::System;
        prefs.appearance.ui_scale = UiScale::HundredTwenty;
        prefs.defaults.calculator_risk_percent = dec!(0.75);

        let text = serde_json::to_string(&prefs).expect("zapis");
        let back: Preferences = serde_json::from_str(&text).expect("odczyt");

        assert_eq!(back, prefs);
    }

    #[test]
    fn odrzuca_niepoprawny_kolor_akcentu() {
        let mut prefs = Preferences::default();
        prefs.appearance.accent_color = "czerwony".to_string();

        assert!(prefs
            .validate_section(PreferencesSection::Appearance)
            .is_err());

        prefs.appearance.accent_color = "#GGGGGG".to_string();
        assert!(prefs
            .validate_section(PreferencesSection::Appearance)
            .is_err());

        prefs.appearance.accent_color = "#1a2b3c".to_string();
        assert!(prefs
            .validate_section(PreferencesSection::Appearance)
            .is_ok());
    }

    #[test]
    fn ryzyko_kalkulatora_musi_miescic_sie_w_bezpiecznym_zakresie() {
        let mut prefs = Preferences::default();

        prefs.defaults.calculator_risk_percent = dec!(0);
        assert!(prefs
            .validate_section(PreferencesSection::Defaults)
            .is_err());

        prefs.defaults.calculator_risk_percent = dec!(100.01);
        assert!(prefs
            .validate_section(PreferencesSection::Defaults)
            .is_err());

        // Krańce zakresu są dozwolone.
        prefs.defaults.calculator_risk_percent = dec!(0.01);
        assert!(prefs.validate_section(PreferencesSection::Defaults).is_ok());
        prefs.defaults.calculator_risk_percent = dec!(100);
        assert!(prefs.validate_section(PreferencesSection::Defaults).is_ok());
    }

    #[test]
    fn ciche_godziny_musza_byc_poprawna_godzina() {
        let mut prefs = Preferences::default();

        prefs.notifications.quiet_hours_start = "25:00".to_string();
        assert!(prefs
            .validate_section(PreferencesSection::Notifications)
            .is_err());

        prefs.notifications.quiet_hours_start = "7:00".to_string();
        assert!(prefs
            .validate_section(PreferencesSection::Notifications)
            .is_err());

        prefs.notifications.quiet_hours_start = "07:00".to_string();
        assert!(prefs
            .validate_section(PreferencesSection::Notifications)
            .is_ok());
    }

    #[test]
    fn blad_w_jednej_sekcji_nie_blokuje_zapisu_innej() {
        // Zapis jest per sekcja - zepsuty kolor nie może uniemożliwić zapisania powiadomień.
        let mut prefs = Preferences::default();
        prefs.appearance.accent_color = "bez sensu".to_string();

        assert!(prefs
            .validate_section(PreferencesSection::Appearance)
            .is_err());
        assert!(prefs
            .validate_section(PreferencesSection::Notifications)
            .is_ok());
        assert!(prefs.validate_section(PreferencesSection::Behavior).is_ok());
    }

    #[test]
    fn reset_sekcji_dotyka_wylacznie_tej_sekcji() {
        let mut prefs = Preferences::default();
        prefs.appearance.theme = ThemeMode::Light;
        prefs.behavior.startup_view = StartupView::Reports;
        prefs.notifications.sound = true;

        prefs.reset_section(PreferencesSection::Appearance);

        assert_eq!(prefs.appearance.theme, ThemeMode::Dark, "zresetowana");
        assert_eq!(
            prefs.behavior.startup_view,
            StartupView::Reports,
            "inna sekcja MUSI zostać nietknięta"
        );
        assert!(
            prefs.notifications.sound,
            "inna sekcja MUSI zostać nietknięta"
        );
    }
}
