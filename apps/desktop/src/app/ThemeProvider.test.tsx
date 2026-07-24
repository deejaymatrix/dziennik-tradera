import { act, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider } from "./PreferencesProvider";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import type { Preferences } from "./types/preferences";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("./invokeCommand", () => ({ invokeCommand }));

function preferencje(theme: Preferences["appearance"]["theme"]): Preferences {
  return {
    appearance: {
      theme,
      accent_color: "#4c7dff",
      ui_scale: "100",
      density: "standard",
      corner_radius: "standard",
      animations: true,
      reduce_motion: false,
      sidebar_collapsed: false,
      show_nav_labels: true,
      remember_column_widths: true,
    },
    behavior: {
      startup_view: "dashboard",
      open_last_tab: false,
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

function ustawDopasowanieSystemu(pasuje: boolean): void {
  const mql = {
    matches: pasuje,
    media: "(prefers-color-scheme: light)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn(() => mql);
}

function Odczyt(): React.ReactElement {
  const { theme } = useTheme();
  return <span>motyw: {theme}</span>;
}

function zapisanyMotyw(): string {
  const ostatnie = invokeCommand.mock.calls.at(-1) as [
    string,
    { section: string; preferences: Preferences },
  ];
  expect(ostatnie[0]).toBe("update_preferences_section");
  expect(ostatnie[1].section).toBe("appearance");
  return ostatnie[1].preferences.appearance.theme;
}

async function wyrenderujZMotywem(theme: Preferences["appearance"]["theme"]) {
  invokeCommand.mockResolvedValue(preferencje(theme));
  const wynik = renderHook(() => useTheme(), {
    wrapper: ({ children }) => (
      <PreferencesProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </PreferencesProvider>
    ),
  });
  await act(async () => {
    await Promise.resolve();
  });
  return wynik;
}

/**
 * `ThemeProvider`/`useTheme` obsługują jednoklikowy przełącznik motywu w nagłówku - dotąd bez
 * ŻADNEGO testu jednostkowego (ten sam brak co `PreferencesProvider.tsx` przed odpowiednimi
 * testami). Najbardziej nieoczywista część: `toggleTheme()` zapisuje ROZWIĄZANY motyw, nie
 * surową wartość z preferencji - więc przełączenie z trybu „systemowy" zawsze ląduje na
 * KONKRETNYM motywie (przeciwnym do aktualnie widocznego), nie zostaje w trybie systemowym.
 */
describe("ThemeProvider - rozwiązywanie motywu", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("theme === 'dark' rozwiązuje się na 'dark'", async () => {
    const { result } = await wyrenderujZMotywem("dark");
    expect(result.current.theme).toBe("dark");
  });

  it("theme === 'light' rozwiązuje się na 'light'", async () => {
    const { result } = await wyrenderujZMotywem("light");
    expect(result.current.theme).toBe("light");
  });

  it("theme === 'system' rozwiązuje się przez matchMedia (system jasny → 'light')", async () => {
    ustawDopasowanieSystemu(true);
    const { result } = await wyrenderujZMotywem("system");
    expect(result.current.theme).toBe("light");
  });

  it("theme === 'system' rozwiązuje się przez matchMedia (system ciemny → 'dark')", async () => {
    ustawDopasowanieSystemu(false);
    const { result } = await wyrenderujZMotywem("system");
    expect(result.current.theme).toBe("dark");
  });
});

describe("ThemeProvider - toggleTheme()", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("z 'dark' zapisuje 'light'", async () => {
    const { result } = await wyrenderujZMotywem("dark");
    invokeCommand.mockResolvedValue(preferencje("light"));

    await act(async () => {
      result.current.toggleTheme();
      await Promise.resolve();
    });

    expect(zapisanyMotyw()).toBe("light");
  });

  it("z trybu 'system' (rozwiązanego na 'light') zapisuje KONKRETNE 'dark', nie 'system'", async () => {
    ustawDopasowanieSystemu(true);
    const { result } = await wyrenderujZMotywem("system");
    expect(result.current.theme).toBe("light");
    invokeCommand.mockResolvedValue(preferencje("dark"));

    await act(async () => {
      result.current.toggleTheme();
      await Promise.resolve();
    });

    expect(zapisanyMotyw()).toBe("dark");
  });

  it("z trybu 'system' (rozwiązanego na 'dark') zapisuje KONKRETNE 'light', nie 'system'", async () => {
    ustawDopasowanieSystemu(false);
    const { result } = await wyrenderujZMotywem("system");
    expect(result.current.theme).toBe("dark");
    invokeCommand.mockResolvedValue(preferencje("light"));

    await act(async () => {
      result.current.toggleTheme();
      await Promise.resolve();
    });

    expect(zapisanyMotyw()).toBe("light");
  });

  it("nic nie zapisuje, gdy preferencje jeszcze się nie wczytały", async () => {
    invokeCommand.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => (
        <PreferencesProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </PreferencesProvider>
      ),
    });

    act(() => {
      result.current.toggleTheme();
    });

    expect(invokeCommand).toHaveBeenCalledTimes(1);
    expect(invokeCommand).toHaveBeenCalledWith("get_preferences");
  });
});

describe("useTheme poza <ThemeProvider>", () => {
  it("rzuca czytelny błąd po polsku", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Odczyt />)).toThrow("useTheme musi być użyty wewnątrz <ThemeProvider>.");
    spy.mockRestore();
  });
});
