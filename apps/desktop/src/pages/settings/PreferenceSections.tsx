import type { ReactElement } from "react";
import type {
  AppearancePreferences,
  BehaviorPreferences,
  DefaultsPreferences,
  NotificationPreferences,
} from "../../app/types/preferences";
import { ColorPicker } from "../../ui/components/ColorPicker/ColorPicker";
import { SectionCard } from "../../ui/components/SectionCard/SectionCard";
import { Select } from "../../ui/components/Select/Select";
import { Switch } from "../../ui/components/Switch/Switch";
import { TextField } from "../../ui/components/TextField/TextField";
import { SettingRow } from "./SettingRow";
import styles from "./PreferenceSections.module.css";

/** Bezpieczna paleta akcentów - wszystkie mają wystarczający kontrast na ciemnym i jasnym tle.
 * Własny kolor nadal można wybrać niżej, ale te są gotowe i sprawdzone. */
const ACCENT_PALETTE = [
  { hex: "#d7b45a", name: "Złoty" },
  { hex: "#4f8ef7", name: "Niebieski" },
  { hex: "#3fae7a", name: "Zielony" },
  { hex: "#a879e6", name: "Fioletowy" },
  { hex: "#e08a4c", name: "Pomarańczowy" },
  { hex: "#5bb8c4", name: "Turkusowy" },
];

function CardTitle({ children }: { children: string }): ReactElement {
  return <h3 className={styles.cardTitle}>{children}</h3>;
}

// -----------------------------------------------------------------------------------------
// Wygląd
// -----------------------------------------------------------------------------------------

export function AppearanceSection({
  value,
  onChange,
}: {
  value: AppearancePreferences;
  onChange: (next: AppearancePreferences) => void;
}): ReactElement {
  function set<K extends keyof AppearancePreferences>(
    key: K,
    next: AppearancePreferences[K],
  ): void {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className={styles.cards}>
      <SectionCard>
        <CardTitle>Motyw i kolory</CardTitle>
        <SettingRow
          label="Motyw"
          description="„Zgodny z systemem” przełącza się razem z ustawieniem jasny/ciemny w Windows."
        >
          <Select
            label="Motyw"
            compact
            value={value.theme}
            onChange={(e) => set("theme", e.target.value as AppearancePreferences["theme"])}
            options={[
              { value: "dark", label: "Ciemny" },
              { value: "light", label: "Jasny" },
              { value: "system", label: "Zgodny z systemem" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Kolor akcentu"
          description="Dotyczy wyłącznie elementów interfejsu. Kolory zysku, straty, ostrzeżeń i informacji są stałe, żeby dziennik pozostał czytelny."
        >
          <div className={styles.palette}>
            {ACCENT_PALETTE.map((color) => (
              <button
                key={color.hex}
                type="button"
                className={[
                  styles.swatch,
                  value.accent_color.toLowerCase() === color.hex ? styles.swatchActive : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ background: color.hex }}
                aria-label={`Kolor akcentu: ${color.name}`}
                aria-pressed={value.accent_color.toLowerCase() === color.hex}
                onClick={() => set("accent_color", color.hex)}
              />
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Własny kolor" description="Jeżeli żaden z gotowych nie pasuje.">
          <ColorPicker
            label="Własny kolor akcentu"
            value={value.accent_color}
            onChange={(hex) => set("accent_color", hex)}
            sampleLabel="Podgląd"
          />
        </SettingRow>

        <div className={styles.preview} aria-label="Podgląd koloru akcentu">
          <span className={styles.previewLabel}>Podgląd</span>
          <div className={styles.previewRow}>
            <span className={styles.previewButton} style={{ background: value.accent_color }}>
              Przycisk
            </span>
            <span
              className={styles.previewNavItem}
              style={{ borderLeftColor: value.accent_color }}
            >
              Aktywna pozycja menu
            </span>
            <span className={styles.previewProfit}>+128,40</span>
            <span className={styles.previewLoss}>-64,20</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <CardTitle>Rozmiar i gęstość</CardTitle>
        <SettingRow
          label="Rozmiar interfejsu"
          description="Skaluje czcionki i odstępy w całej aplikacji."
        >
          <Select
            label="Rozmiar interfejsu"
            compact
            value={value.ui_scale}
            onChange={(e) => set("ui_scale", e.target.value as AppearancePreferences["ui_scale"])}
            options={[
              { value: "90", label: "90%" },
              { value: "100", label: "100%" },
              { value: "110", label: "110%" },
              { value: "120", label: "120%" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Gęstość"
          description="Jak ciasno upakowane są wiersze tabel i pola formularzy."
        >
          <Select
            label="Gęstość"
            compact
            value={value.density}
            onChange={(e) => set("density", e.target.value as AppearancePreferences["density"])}
            options={[
              { value: "compact", label: "Kompaktowa" },
              { value: "standard", label: "Standardowa" },
              { value: "spacious", label: "Przestronna" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Zaokrąglenie paneli">
          <Select
            label="Zaokrąglenie paneli"
            compact
            value={value.corner_radius}
            onChange={(e) =>
              set("corner_radius", e.target.value as AppearancePreferences["corner_radius"])
            }
            options={[
              { value: "small", label: "Małe" },
              { value: "standard", label: "Standardowe" },
              { value: "large", label: "Duże" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Animacje interfejsu" description="Płynne przejścia i rozwijanie paneli.">
          <Switch
            label="Animacje interfejsu"
            checked={value.animations}
            onChange={(e) => set("animations", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Ogranicz ruch"
          description="Wyłącza przesunięcia i przewijanie animowane. Przydatne przy wrażliwości na ruch."
        >
          <Switch
            label="Ogranicz ruch"
            checked={value.reduce_motion}
            onChange={(e) => set("reduce_motion", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Nawigacja</CardTitle>
        <SettingRow label="Menu boczne domyślnie zwinięte">
          <Switch
            label="Menu boczne domyślnie zwinięte"
            checked={value.sidebar_collapsed}
            onChange={(e) => set("sidebar_collapsed", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Pokazuj podpisy przy ikonach"
          description="Wyłączone zostawia same ikony - węższe menu, ale mniej czytelne."
        >
          <Switch
            label="Pokazuj podpisy przy ikonach"
            checked={value.show_nav_labels}
            onChange={(e) => set("show_nav_labels", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Zapamiętuj szerokości kolumn tabel"
          description="Ręcznie zmienione szerokości wracają przy kolejnym otwarciu."
        >
          <Switch
            label="Zapamiętuj szerokości kolumn tabel"
            checked={value.remember_column_widths}
            onChange={(e) => set("remember_column_widths", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// Zachowanie aplikacji
// -----------------------------------------------------------------------------------------

export function BehaviorSection({
  value,
  onChange,
}: {
  value: BehaviorPreferences;
  onChange: (next: BehaviorPreferences) => void;
}): ReactElement {
  function set<K extends keyof BehaviorPreferences>(key: K, next: BehaviorPreferences[K]): void {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className={styles.cards}>
      <SectionCard>
        <CardTitle>Uruchamianie</CardTitle>
        <SettingRow
          label="Widok startowy"
          description={
            value.open_last_tab
              ? "Nieaktywny, dopóki włączone jest otwieranie ostatnio używanej zakładki - ta opcja ma pierwszeństwo."
              : "Zakładka otwierana zaraz po uruchomieniu aplikacji."
          }
        >
          <Select
            label="Widok startowy"
            compact
            disabled={value.open_last_tab}
            value={value.startup_view}
            onChange={(e) =>
              set("startup_view", e.target.value as BehaviorPreferences["startup_view"])
            }
            options={[
              { value: "dashboard", label: "Dashboard" },
              { value: "transactions", label: "Transakcje" },
              { value: "accounts", label: "Konta" },
              { value: "reports", label: "Raporty" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Otwieraj ostatnio używaną zakładkę"
          description="Ma pierwszeństwo przed widokiem startowym powyżej."
        >
          <Switch
            label="Otwieraj ostatnio używaną zakładkę"
            checked={value.open_last_tab}
            onChange={(e) => set("open_last_tab", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Zapamiętuj ostatnio używane konto">
          <Switch
            label="Zapamiętuj ostatnio używane konto"
            checked={value.remember_last_account}
            onChange={(e) => set("remember_last_account", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Przywracaj rozmiar i położenie okna" requiresRestart>
          <Switch
            label="Przywracaj rozmiar i położenie okna"
            checked={value.restore_window_bounds}
            onChange={(e) => set("restore_window_bounds", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Pokazuj podpowiedzi przy polach"
          description="Krótkie wyjaśnienia pod polami formularzy."
        >
          <Switch
            label="Pokazuj podpowiedzi przy polach"
            checked={value.show_field_hints}
            onChange={(e) => set("show_field_hints", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Formularze</CardTitle>
        <SettingRow
          label="Automatyczny zapis szkicu transakcji"
          locked
          description="Nie da się wyłączyć - to jedyne zabezpieczenie przed utratą niezapisanej pracy."
        />
        <SettingRow label="Częstotliwość zapisu szkicu">
          <Select
            label="Częstotliwość zapisu szkicu"
            compact
            value={value.draft_autosave_seconds}
            onChange={(e) =>
              set(
                "draft_autosave_seconds",
                e.target.value as BehaviorPreferences["draft_autosave_seconds"],
              )
            }
            options={[
              { value: "5", label: "Co 5 sekund" },
              { value: "10", label: "Co 10 sekund" },
              { value: "30", label: "Co 30 sekund" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Przywracanie szkicu po awarii"
          locked
          description="Po nieoczekiwanym zamknięciu zobaczysz znaleziony szkic wraz z jego datą i sam zdecydujesz, czy go odrzucić."
        />
        <SettingRow label="Otwieraj szczegóły po zapisaniu transakcji">
          <Switch
            label="Otwieraj szczegóły po zapisaniu transakcji"
            checked={value.open_details_after_save}
            onChange={(e) => set("open_details_after_save", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Zapamiętuj rozwinięte panele formularza">
          <Switch
            label="Zapamiętuj rozwinięte panele formularza"
            checked={value.remember_expanded_panels}
            onChange={(e) => set("remember_expanded_panels", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Pokazuj potwierdzenie poprawnego zapisu">
          <Switch
            label="Pokazuj potwierdzenie poprawnego zapisu"
            checked={value.show_save_confirmation}
            onChange={(e) => set("show_save_confirmation", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Potwierdzenia</CardTitle>
        <SettingRow
          label="Ostrzeżenie przed opuszczeniem niezapisanego formularza"
          locked
          description="Nie da się wyłączyć - chroni przed utratą wpisanych danych."
        />
        <SettingRow label="Potwierdzenie przeniesienia do kosza">
          <Switch
            label="Potwierdzenie przeniesienia do kosza"
            checked={value.confirm_move_to_trash}
            onChange={(e) => set("confirm_move_to_trash", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Potwierdzenie operacji nieodwracalnej"
          description="Np. trwałe usunięcie z kosza."
        >
          <Switch
            label="Potwierdzenie operacji nieodwracalnej"
            checked={value.confirm_permanent_operation}
            onChange={(e) => set("confirm_permanent_operation", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Ostrzeżenie przed nadpisaniem istniejącego importu">
          <Switch
            label="Ostrzeżenie przed nadpisaniem istniejącego importu"
            checked={value.warn_overwrite_import}
            onChange={(e) => set("warn_overwrite_import", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Ostrzeżenie o niespełnionej wymaganej zasadzie"
          description="Sama walidacja i obowiązek podania powodu zostają niezależnie od tego przełącznika."
        >
          <Switch
            label="Ostrzeżenie o niespełnionej wymaganej zasadzie"
            checked={value.warn_unfulfilled_rule}
            onChange={(e) => set("warn_unfulfilled_rule", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// Domyślne wartości
// -----------------------------------------------------------------------------------------

export function DefaultsSection({
  value,
  onChange,
  accounts,
  intervals,
}: {
  value: DefaultsPreferences;
  onChange: (next: DefaultsPreferences) => void;
  accounts: { id: string; name: string }[];
  intervals: { id: string; label: string }[];
}): ReactElement {
  function set<K extends keyof DefaultsPreferences>(key: K, next: DefaultsPreferences[K]): void {
    onChange({ ...value, [key]: next });
  }

  const accountValue =
    value.default_account.kind === "specific" ? value.default_account.account_id : value.default_account.kind;

  return (
    <div className={styles.cards}>
      <SectionCard>
        <CardTitle>Nowa transakcja</CardTitle>
        <p className={styles.cardNote}>
          Instrument, kierunek BUY/SELL i strategia celowo nie mają wartości domyślnych - przy
          każdej transakcji wymagają świadomego wyboru, żeby nie zapisać błędnych danych
          z przyzwyczajenia.
        </p>
        <SettingRow label="Domyślne konto">
          <Select
            label="Domyślne konto"
            compact
            value={accountValue}
            onChange={(e) => {
              const raw = e.target.value;
              set(
                "default_account",
                raw === "last_used" || raw === "none"
                  ? { kind: raw }
                  : { kind: "specific", account_id: raw },
              );
            }}
            options={[
              { value: "last_used", label: "Ostatnio używane" },
              { value: "none", label: "Brak" },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </SettingRow>
        <SettingRow label="Domyślny interwał">
          <Select
            label="Domyślny interwał"
            compact
            value={value.default_interval_id ?? ""}
            onChange={(e) => set("default_interval_id", e.target.value || null)}
            options={[
              { value: "", label: "Brak" },
              ...intervals.map((i) => ({ value: i.id, label: i.label })),
            ]}
          />
        </SettingRow>
        <SettingRow label="Domyślna sesja">
          <Select
            label="Domyślna sesja"
            compact
            value={value.default_session ?? ""}
            onChange={(e) => set("default_session", e.target.value || null)}
            options={[
              { value: "", label: "Brak" },
              { value: "Londyn", label: "Londyn" },
              { value: "Nowy Jork", label: "Nowy Jork" },
              { value: "Azja", label: "Azja" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Format daty">
          <Select
            label="Format daty"
            compact
            value={value.date_format}
            onChange={(e) => set("date_format", e.target.value)}
            options={[
              { value: "DD.MM.YYYY", label: "31.12.2026" },
              { value: "YYYY-MM-DD", label: "2026-12-31" },
              { value: "DD/MM/YYYY", label: "31/12/2026" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Pokazuj sekundy w godzinach">
          <Switch
            label="Pokazuj sekundy w godzinach"
            checked={value.time_with_seconds}
            onChange={(e) => set("time_with_seconds", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Separator dziesiętny"
          description="Dotyczy wyświetlania. Wpisując wartości możesz zawsze użyć przecinka albo kropki."
        >
          <Select
            label="Separator dziesiętny"
            compact
            value={value.decimal_separator}
            onChange={(e) =>
              set("decimal_separator", e.target.value as DefaultsPreferences["decimal_separator"])
            }
            options={[
              { value: "comma", label: "Przecinek (1,23)" },
              { value: "dot", label: "Kropka (1.23)" },
            ]}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Kalkulator</CardTitle>
        <p className={styles.cardNote}>
          To wyłącznie wartości startowe formularza kalkulatora. Zmiana nie modyfikuje zapisanych
          transakcji ani parametrów instrumentów.
        </p>
        <SettingRow label="Domyślne ryzyko" description="Dozwolony zakres: od 0,01% do 100%.">
          <TextField
            label="Domyślne ryzyko (%)"
            inputMode="decimal"
            value={value.calculator_risk_percent}
            onChange={(e) => set("calculator_risk_percent", e.target.value)}
          />
        </SettingRow>
        <SettingRow label="Sposób podawania SL">
          <Select
            label="Sposób podawania SL"
            compact
            value={value.calculator_sl_mode}
            onChange={(e) =>
              set("calculator_sl_mode", e.target.value as DefaultsPreferences["calculator_sl_mode"])
            }
            options={[
              { value: "price", label: "Cena" },
              { value: "points", label: "Punkty" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Sposób podawania TP">
          <Select
            label="Sposób podawania TP"
            compact
            value={value.calculator_tp_mode}
            onChange={(e) =>
              set("calculator_tp_mode", e.target.value as DefaultsPreferences["calculator_tp_mode"])
            }
            options={[
              { value: "price", label: "Cena" },
              { value: "points", label: "Punkty" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Pokazuj szczegółowy sposób obliczenia">
          <Switch
            label="Pokazuj szczegółowy sposób obliczenia"
            checked={value.calculator_show_details}
            onChange={(e) => set("calculator_show_details", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Uwzględniaj prowizję w podglądzie wyniku">
          <Switch
            label="Uwzględniaj prowizję w podglądzie wyniku"
            checked={value.calculator_include_commission}
            onChange={(e) => set("calculator_include_commission", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Raporty</CardTitle>
        <p className={styles.cardNote}>
          Te ustawienia dotyczą wyłącznie domyślnego widoku raportu. Historyczne dane nie są przez
          nie przeliczane.
        </p>
        <SettingRow
          label="Uwzględniaj prowizję, swap i opłaty"
          description="Wyłączenie pokazuje wynik brutto zamiast netto."
        >
          <Switch
            label="Uwzględniaj prowizję, swap i opłaty"
            checked={value.report_include_costs}
            onChange={(e) => set("report_include_costs", e.target.checked)}
          />
        </SettingRow>
        <SettingRow
          label="Uwzględniaj transakcje otwarte"
          description="Domyślnie wyłączone - otwarta pozycja nie ma jeszcze ostatecznego wyniku."
        >
          <Switch
            label="Uwzględniaj transakcje otwarte"
            checked={value.report_include_open}
            onChange={(e) => set("report_include_open", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Liczba pozycji w rankingach">
          <Select
            label="Liczba pozycji w rankingach"
            compact
            value={value.report_ranking_size}
            onChange={(e) =>
              set("report_ranking_size", e.target.value as DefaultsPreferences["report_ranking_size"])
            }
            options={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "20", label: "20" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Zapamiętuj filtry osobno dla każdego raportu">
          <Switch
            label="Zapamiętuj filtry osobno dla każdego raportu"
            checked={value.report_remember_filters}
            onChange={(e) => set("report_remember_filters", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>
    </div>
  );
}

// -----------------------------------------------------------------------------------------
// Powiadomienia
// -----------------------------------------------------------------------------------------

export function NotificationsSection({
  value,
  onChange,
}: {
  value: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
}): ReactElement {
  function set<K extends keyof NotificationPreferences>(
    key: K,
    next: NotificationPreferences[K],
  ): void {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className={styles.cards}>
      <SectionCard>
        <CardTitle>Systemowe</CardTitle>
        <p className={styles.cardNote}>
          Wyłączenie powiadomienia systemowego nie zatrzymuje sprawdzania aktualizacji - informacja
          o nowej wersji nadal będzie widoczna wewnątrz aplikacji.
        </p>
        <SettingRow label="Nowa aktualizacja">
          <Switch
            label="Nowa aktualizacja"
            checked={value.update_available}
            onChange={(e) => set("update_available", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Zakończona aktualizacja">
          <Switch
            label="Zakończona aktualizacja"
            checked={value.update_completed}
            onChange={(e) => set("update_completed", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Błąd aktualizacji">
          <Switch
            label="Błąd aktualizacji"
            checked={value.update_failed}
            onChange={(e) => set("update_failed", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Nieudana kopia bezpieczeństwa">
          <Switch
            label="Nieudana kopia bezpieczeństwa"
            checked={value.backup_failed}
            onChange={(e) => set("backup_failed", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Dźwięk powiadomień">
          <Switch
            label="Dźwięk powiadomień"
            checked={value.sound}
            onChange={(e) => set("sound", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Przypomnienia</CardTitle>
        <p className={styles.cardNote}>
          Kliknięcie przypomnienia prowadzi prosto do transakcji albo formularza, którego dotyczy.
        </p>
        <SettingRow label="Niedokończony szkic">
          <Switch
            label="Niedokończony szkic"
            checked={value.remind_unfinished_draft}
            onChange={(e) => set("remind_unfinished_draft", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Brakujące emocje">
          <Switch
            label="Brakujące emocje"
            checked={value.remind_missing_emotions}
            onChange={(e) => set("remind_missing_emotions", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Brakujący wykres lub załącznik">
          <Switch
            label="Brakujący wykres lub załącznik"
            checked={value.remind_missing_attachment}
            onChange={(e) => set("remind_missing_attachment", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Niespełniona wymagana zasada">
          <Switch
            label="Niespełniona wymagana zasada"
            checked={value.remind_unfulfilled_rule}
            onChange={(e) => set("remind_unfulfilled_rule", e.target.checked)}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <CardTitle>Ciche godziny</CardTitle>
        <p className={styles.cardNote}>
          W tym przedziale nie pojawiają się dźwięki ani niekrytyczne powiadomienia systemowe.
          Informacja o aktualizacji, błędzie kopii i ryzyku utraty danych pozostaje widoczna
          wewnątrz aplikacji.
        </p>
        <SettingRow label="Włącz ciche godziny">
          <Switch
            label="Włącz ciche godziny"
            checked={value.quiet_hours_enabled}
            onChange={(e) => set("quiet_hours_enabled", e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Od" description="Przedział może przechodzić przez północ.">
          <TextField
            label="Od (GG:MM)"
            type="time"
            disabled={!value.quiet_hours_enabled}
            value={value.quiet_hours_start}
            onChange={(e) => set("quiet_hours_start", e.target.value)}
          />
        </SettingRow>
        <SettingRow label="Do">
          <TextField
            label="Do (GG:MM)"
            type="time"
            disabled={!value.quiet_hours_enabled}
            value={value.quiet_hours_end}
            onChange={(e) => set("quiet_hours_end", e.target.value)}
          />
        </SettingRow>
      </SectionCard>
    </div>
  );
}
