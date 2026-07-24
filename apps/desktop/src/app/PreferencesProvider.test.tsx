import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "./PreferencesProvider";
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

/** Fałszywy `MediaQueryList` sterowalny ręcznie z testu - `matches` i wywołanie `change`
 * symulują realną zmianę ustawienia jasny/ciemny w systemie w trakcie działania aplikacji. */
function fakeMediaQueryList(initialMatches: boolean): {
  mql: MediaQueryList;
  ustawDopasowanie: (matches: boolean) => void;
  dodaneNasluchy: () => number;
  usunieteNasluchy: () => number;
} {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let addedCount = 0;
  let removedCount = 0;
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: light)",
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
      addedCount += 1;
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
      removedCount += 1;
    },
  } as unknown as MediaQueryList;

  return {
    mql,
    ustawDopasowanie: (next: boolean) => {
      matches = next;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
    dodaneNasluchy: () => addedCount,
    usunieteNasluchy: () => removedCount,
  };
}

function Odczyt(): null {
  usePreferences();
  return null;
}

/**
 * Motyw „zgodny z systemem" (O1 redesignu) musiał dotąd polegać wyłącznie na ręcznej
 * weryfikacji - `PreferencesProvider.tsx`/`ThemeProvider.tsx` nie miały ŻADNEGO testu
 * jednostkowego. Te testy pilnują realnego nasłuchu na żywo, nie tylko rozwiązania motywu
 * przy starcie - zmiana ustawienia Windows w trakcie działania aplikacji musi zaktualizować
 * `data-theme` na dokumencie BEZ zapisu ani przeładowania (sekcja 9/22 promptu).
 */
describe("PreferencesProvider - motyw zgodny z systemem", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    invokeCommand.mockReset();
  });

  it("przy starcie rozwiązuje 'system' na aktualne dopasowanie OS", async () => {
    const { mql } = fakeMediaQueryList(true);
    window.matchMedia = vi.fn(() => mql);
    invokeCommand.mockResolvedValue(preferencje("system"));

    await act(async () => {
      render(
        <PreferencesProvider>
          <Odczyt />
        </PreferencesProvider>,
      );
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("zmiana motywu Windows W TRAKCIE działania aktualizuje data-theme na żywo", async () => {
    const { mql, ustawDopasowanie } = fakeMediaQueryList(false);
    window.matchMedia = vi.fn(() => mql);
    invokeCommand.mockResolvedValue(preferencje("system"));

    await act(async () => {
      render(
        <PreferencesProvider>
          <Odczyt />
        </PreferencesProvider>,
      );
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // Użytkownik przełącza jasny/ciemny w Windows - bez żadnej akcji w samej aplikacji.
    act(() => {
      ustawDopasowanie(true);
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("gdy motyw NIE jest 'system', zmiana OS nie ma żadnego wpływu", async () => {
    const { mql, ustawDopasowanie } = fakeMediaQueryList(false);
    window.matchMedia = vi.fn(() => mql);
    invokeCommand.mockResolvedValue(preferencje("dark"));

    await act(async () => {
      render(
        <PreferencesProvider>
          <Odczyt />
        </PreferencesProvider>,
      );
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    act(() => {
      ustawDopasowanie(true);
    });

    // Motyw jest jawnie "dark", więc zmiana preferencji systemowej nie może nic ruszyć.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("nasłuch zdarzenia 'change' jest odpinany, żeby nie zostawiać wycieku (sekcja 27)", async () => {
    const { mql, dodaneNasluchy, usunieteNasluchy } = fakeMediaQueryList(false);
    window.matchMedia = vi.fn(() => mql);
    invokeCommand.mockResolvedValue(preferencje("system"));

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(
        <PreferencesProvider>
          <Odczyt />
        </PreferencesProvider>,
      ));
    });

    expect(dodaneNasluchy()).toBe(1);
    expect(usunieteNasluchy()).toBe(0);

    unmount();

    expect(usunieteNasluchy()).toBe(1);
  });
});
