import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppShell } from "./AppShell";
import { PreferencesProvider, usePreferences } from "../app/PreferencesProvider";
import { ThemeProvider } from "../app/ThemeProvider";
import type { Preferences, StartupView } from "../app/types/preferences";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

const useOptionalUpdateMonitor = vi.hoisted(() =>
  vi.fn<() => { zadanieOtwarciaUstawien: number } | null>(() => null),
);
vi.mock("../app/UpdateMonitorProvider", () => ({ useOptionalUpdateMonitor }));

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

/** Musi zgadzać się z prywatną `LAST_ROUTE_STORAGE_KEY` w AppShell.tsx. */
const LAST_ROUTE_STORAGE_KEY = "dziennik-tradera.last-route";

function preferencje(opcje: {
  sidebar_collapsed?: boolean;
  startup_view?: StartupView;
  open_last_tab?: boolean;
}): Preferences {
  return {
    appearance: {
      // "light" celowo, żeby odróżnić się od domyślnego "dark" sprzed wczytania preferencji -
      // patrz `poZaladowaniuPreferencji` niżej.
      theme: "light",
      accent_color: "#4c7dff",
      ui_scale: "100",
      density: "standard",
      corner_radius: "standard",
      animations: true,
      reduce_motion: false,
      sidebar_collapsed: opcje.sidebar_collapsed ?? false,
      show_nav_labels: true,
      remember_column_widths: true,
    },
    behavior: {
      startup_view: opcje.startup_view ?? "dashboard",
      open_last_tab: opcje.open_last_tab ?? false,
      remember_last_account: true,
      restore_window_bounds: true,
      show_field_hints: true,
      draft_autosave_seconds: "10",
      open_details_after_save: true,
      remember_expanded_panels: true,
      show_save_confirmation: true,
      confirm_move_to_trash: true,
      confirm_permanent_operation: true,
      warn_overwrite_import: true,
      warn_unfulfilled_rule: true,
    },
    defaults: {
      default_account: { kind: "last_used" },
      default_interval_id: null,
      default_session: null,
      date_format: "DD.MM.YYYY",
      time_with_seconds: false,
      decimal_separator: "comma",
      calculator_risk_percent: "1",
      calculator_sl_mode: "price",
      calculator_tp_mode: "price",
      calculator_show_details: true,
      calculator_include_commission: true,
      report_include_costs: true,
      report_include_open: false,
      report_ranking_size: "5",
      report_remember_filters: true,
    },
    notifications: {
      update_available: true,
      update_completed: true,
      update_failed: true,
      backup_failed: true,
      sound: true,
      remind_unfinished_draft: true,
      remind_missing_emotions: true,
      remind_missing_attachment: true,
      remind_unfulfilled_rule: true,
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
    data: {
      backup_frequency: "daily",
      backup_retention: "30",
    },
  };
}

function ZapiszInnePreferencje({ nowe }: { nowe: Preferences }): React.ReactElement {
  const { preferences, saveSection } = usePreferences();
  return (
    <button
      type="button"
      onClick={() => {
        if (preferences) {
          void saveSection("appearance", nowe);
        }
      }}
    >
      zapisz-inne-preferencje
    </button>
  );
}

function drzewo(path: string, dodatkowo?: React.ReactNode) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <PreferencesProvider>
        <ThemeProvider>
          <Routes>
            <Route path="*" element={<AppShell />} />
          </Routes>
          {dodatkowo}
        </ThemeProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

/**
 * Sidebar/Header renderują się od razu (z domyślnymi wartościami), NIM preferencje się wczytają
 * - czekanie na sam ich obecność w DOM nic nie mówi o tym, czy efekty zależne od preferencji już
 * odpaliły. Czekamy więc na przełącznik motywu w stanie odpowiadającym WCZYTANEMU `theme: "light"`
 * (domyślny, sprzed wczytania, to zawsze "dark") - to jedyny pewny sygnał, że preferencje
 * naprawdę dotarły i powiązane efekty miały szansę się uruchomić.
 */
async function poZaladowaniuPreferencji(): Promise<void> {
  await screen.findByRole("button", { name: "Przełącz na motyw ciemny" });
}

/**
 * `AppShell` (120 linii) łączy trzy niezależne, subtelne mechanizmy startowe - dotąd zero
 * testów mimo że to najbardziej złożony komponent powłoki:
 * (1) domyślny stan zwinięcia menu nakłada się z preferencji TYLKO RAZ (`!startupApplied`) -
 *     bez tej ochrony każdy późniejszy zapis ustawień rozwijałby/zwijał menu pod palcami
 *     użytkownika;
 * (2) przekierowanie na widok startowy działa WYŁĄCZNIE przy wejściu na "/" (nie przy głębokim
 *     linku), TYLKO RAZ (`useRef`), a "otwieraj ostatnią zakładkę" ma pierwszeństwo przed
 *     wybranym widokiem startowym;
 * (3) nawigacja po kliknięciu powiadomienia systemowego reaguje na ZMIANĘ licznika
 *     `zadanieOtwarciaUstawien`, nie na każde przerysowanie - inaczej DRUGIE kliknięcie tego
 *     samego powiadomienia by nie zadziałało.
 */
describe("AppShell - stan zwinięcia menu nakłada się z preferencji tylko raz", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    navigate.mockReset();
  });

  it("po starcie odzwierciedla sidebar_collapsed, ale kolejny zapis preferencji go NIE nadpisuje", async () => {
    invokeCommand.mockResolvedValue(preferencje({ sidebar_collapsed: true }));

    render(drzewo("/", <ZapiszInnePreferencje nowe={preferencje({ sidebar_collapsed: false })} />));
    await poZaladowaniuPreferencji();
    expect(screen.getByRole("button", { name: "Rozwiń nawigację" })).toBeInTheDocument();

    invokeCommand.mockResolvedValue(preferencje({ sidebar_collapsed: false }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "zapisz-inne-preferencje" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("update_preferences_section", expect.anything()),
    );
    expect(screen.getByRole("button", { name: "Rozwiń nawigację" })).toBeInTheDocument();
  });
});

describe("AppShell - przekierowanie na widok startowy", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    navigate.mockReset();
    localStorage.clear();
  });

  it("na '/' z startup_view != dashboard przekierowuje raz, z {replace: true}", async () => {
    invokeCommand.mockResolvedValue(preferencje({ startup_view: "reports" }));
    render(drzewo("/"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/raporty", { replace: true }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("na '/' z startup_view === dashboard (cel to '/') NIE przekierowuje", async () => {
    invokeCommand.mockResolvedValue(preferencje({ startup_view: "dashboard" }));
    render(drzewo("/"));
    await poZaladowaniuPreferencji();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("na głębokim linku (nie '/') NIE przekierowuje, nawet z innym startup_view", async () => {
    invokeCommand.mockResolvedValue(preferencje({ startup_view: "reports" }));
    render(drzewo("/konta"));
    await poZaladowaniuPreferencji();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("open_last_tab=true z zapamiętaną ścieżką ma pierwszeństwo przed startup_view", async () => {
    localStorage.setItem(LAST_ROUTE_STORAGE_KEY, "/kalendarz");
    invokeCommand.mockResolvedValue(preferencje({ open_last_tab: true, startup_view: "reports" }));
    render(drzewo("/"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/kalendarz", { replace: true }));
  });

  it("open_last_tab=true bez zapamiętanej ścieżki spada na startup_view", async () => {
    invokeCommand.mockResolvedValue(preferencje({ open_last_tab: true, startup_view: "accounts" }));
    render(drzewo("/"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/konta", { replace: true }));
  });
});

describe("AppShell - zapamiętywanie ostatniej ścieżki", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    navigate.mockReset();
    localStorage.clear();
  });

  it("po wejściu na widok zapisuje jego ścieżkę do localStorage", async () => {
    invokeCommand.mockResolvedValue(preferencje({}));
    render(drzewo("/kalendarz"));
    await poZaladowaniuPreferencji();
    await waitFor(() => expect(localStorage.getItem(LAST_ROUTE_STORAGE_KEY)).toBe("/kalendarz"));
  });
});

describe("AppShell - nawigacja po kliknięciu powiadomienia systemowego", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    navigate.mockReset();
    useOptionalUpdateMonitor.mockReturnValue(null);
  });

  it("reaguje na ZMIANĘ licznika zadaniaOtwarciaUstawien, nie na każde przerysowanie", async () => {
    invokeCommand.mockResolvedValue(preferencje({ startup_view: "dashboard" }));
    useOptionalUpdateMonitor.mockReturnValue({ zadanieOtwarciaUstawien: 0 });

    const { rerender } = render(drzewo("/"));
    await poZaladowaniuPreferencji();
    navigate.mockClear();

    // Przerysowanie z TĄ SAMĄ wartością licznika - nawigacja NIE powinna się uruchomić.
    rerender(drzewo("/"));
    expect(navigate).not.toHaveBeenCalled();

    // NOWY obiekt monitora, ale z TĄ SAMĄ wartością licznika - to musi być rozróżnione od
    // zmiany wartości, inaczej wystarczyłby dowolny nowy render `UpdateMonitorProvider`
    // (np. inne pole stanu), żeby błędnie wywołać nawigację.
    useOptionalUpdateMonitor.mockReturnValue({ zadanieOtwarciaUstawien: 0 });
    rerender(drzewo("/"));
    expect(navigate).not.toHaveBeenCalled();

    // Licznik faktycznie się zmienia - dopiero teraz nawigacja do Ustawień.
    useOptionalUpdateMonitor.mockReturnValue({ zadanieOtwarciaUstawien: 1 });
    rerender(drzewo("/"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/ustawienia"));
  });
});
