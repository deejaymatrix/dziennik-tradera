/**
 * Preferencje użytkownika - lustro `domain::preferences` z Rusta. Wartości liczbowe dziesiętne
 * (ryzyko kalkulatora) są stringami, bo to `Decimal` z backendu; nigdy nie licz na nich we
 * frontendzie.
 *
 * Czego tu świadomie NIE MA: endpointu aktualizacji, klucza publicznego, kanału wydań,
 * identyfikatora aplikacji, ścieżki bazy, parametrów instrumentów, kluczy i certyfikatów, ani
 * przełącznika wyłączającego walidację czy backup przed migracją. To nie są ustawienia, tylko
 * gwarancje poprawności aplikacji.
 */

export type ThemeMode = "dark" | "light" | "system";
export type UiScale = "90" | "100" | "110" | "120";
export type Density = "compact" | "standard" | "spacious";
export type CornerRadius = "small" | "standard" | "large";

export interface AppearancePreferences {
  theme: ThemeMode;
  /** `#rrggbb`. Kolory semantyczne (zysk/strata/ostrzeżenie/informacja/BE) są stałe. */
  accent_color: string;
  ui_scale: UiScale;
  density: Density;
  corner_radius: CornerRadius;
  animations: boolean;
  reduce_motion: boolean;
  sidebar_collapsed: boolean;
  show_nav_labels: boolean;
  remember_column_widths: boolean;
}

export type StartupView = "dashboard" | "transactions" | "accounts" | "reports";
export type DraftAutosaveSeconds = "5" | "10" | "30";

export interface BehaviorPreferences {
  startup_view: StartupView;
  /** Ma pierwszeństwo przed `startup_view`, gdy włączone. */
  open_last_tab: boolean;
  remember_last_account: boolean;
  restore_window_bounds: boolean;
  show_field_hints: boolean;
  draft_autosave_seconds: DraftAutosaveSeconds;
  open_details_after_save: boolean;
  remember_expanded_panels: boolean;
  show_save_confirmation: boolean;
  confirm_move_to_trash: boolean;
  confirm_permanent_operation: boolean;
  warn_overwrite_import: boolean;
  warn_unfulfilled_rule: boolean;
}

export type DefaultAccount =
  | { kind: "last_used" }
  | { kind: "none" }
  | { kind: "specific"; account_id: string };

export type PriceOrPoints = "price" | "points";
export type DecimalSeparator = "comma" | "dot";
export type RankingSize = "5" | "10" | "20";

export interface DefaultsPreferences {
  default_account: DefaultAccount;
  default_interval_id: string | null;
  default_session: string | null;
  date_format: string;
  time_with_seconds: boolean;
  decimal_separator: DecimalSeparator;
  /** Decimal jako string. Wartość STARTOWA formularza, nie narzucona reguła inwestycyjna. */
  calculator_risk_percent: string;
  calculator_sl_mode: PriceOrPoints;
  calculator_tp_mode: PriceOrPoints;
  calculator_show_details: boolean;
  calculator_include_commission: boolean;
  report_include_costs: boolean;
  report_include_open: boolean;
  report_ranking_size: RankingSize;
  report_remember_filters: boolean;
}

export interface NotificationPreferences {
  update_available: boolean;
  update_completed: boolean;
  update_failed: boolean;
  backup_failed: boolean;
  sound: boolean;
  remind_unfinished_draft: boolean;
  remind_missing_emotions: boolean;
  remind_missing_attachment: boolean;
  remind_unfulfilled_rule: boolean;
  quiet_hours_enabled: boolean;
  /** `GG:MM` w formacie 24-godzinnym. Przedział może przechodzić przez północ. */
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export type BackupFrequency = "daily" | "every_three_days" | "weekly";
export type BackupRetention = "10" | "30" | "60";

export interface DataPreferences {
  backup_frequency: BackupFrequency;
  backup_retention: BackupRetention;
}

export interface Preferences {
  appearance: AppearancePreferences;
  behavior: BehaviorPreferences;
  defaults: DefaultsPreferences;
  notifications: NotificationPreferences;
  data: DataPreferences;
}

/** Sekcje zapisywane atomowo. "Aktualizacje i informacje" nie ma tu wpisu, bo nie zawiera
 * niczego, co użytkownik mógłby zapisać - to widok wyłącznie informacyjny. */
export type PreferencesSectionKey =
  | "appearance"
  | "behavior"
  | "defaults"
  | "notifications"
  | "data";
