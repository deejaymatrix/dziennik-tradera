import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Header } from "./Header";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { ThemeProvider } from "../app/ThemeProvider";
import type { Preferences } from "../app/types/preferences";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

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

async function wyrenderujNaSciezce(pathname: string): Promise<void> {
  invokeCommand.mockResolvedValue(preferencje("dark"));
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <PreferencesProvider>
        <ThemeProvider>
          <Header />
        </ThemeProvider>
      </PreferencesProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1 });
}

/**
 * `resolvePageTitle` (prywatna funkcja w `Header.tsx`) decyduje, jaki tytuł widzi użytkownik w
 * górnym pasku dla każdej ścieżki - dotąd zero testów. Nieoczywista część: dopasowanie „/" jest
 * DOKŁADNE (nie `startsWith`, bo inaczej pasowałoby do KAŻDEJ ścieżki i Dashboard zawsze
 * wygrywałby), a pozostałe pozycje dopasowują się przez `startsWith` (podstrona pod danym
 * widokiem nadal pokazuje jego etykietę). Nieznana ścieżka ma jawny fallback, nie pusty tytuł.
 */
describe("Header - resolvePageTitle przez renderowanie na różnych ścieżkach", () => {
  it("'/' pokazuje 'Dashboard', nie dopasowuje się do niczego innego", async () => {
    await wyrenderujNaSciezce("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
  });

  it("znana ścieżka pokazuje etykietę odpowiadającej pozycji nawigacji", async () => {
    await wyrenderujNaSciezce("/kalendarz");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kalendarz");
  });

  it("podstrona pod znanym widokiem (prefiks) nadal pokazuje etykietę tego widoku", async () => {
    await wyrenderujNaSciezce("/transakcje/123");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Historia transakcji");
  });

  it("nieznana ścieżka dostaje jawny tytuł zastępczy, nie pusty nagłówek", async () => {
    await wyrenderujNaSciezce("/cos-czego-nie-ma");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dziennik Tradera");
  });
});

describe("Header - przełącznik motywu", () => {
  it("klik na przełącznik motywu nie wywala aplikacji bez dostawcy aktualizacji (opcjonalny hook)", async () => {
    const user = userEvent.setup();
    await wyrenderujNaSciezce("/");
    const przycisk = screen.getByRole("button", { name: "Przełącz na motyw jasny" });
    invokeCommand.mockResolvedValue(preferencje("light"));
    await user.click(przycisk);
    expect(invokeCommand).toHaveBeenCalledWith("update_preferences_section", expect.anything());
  });
});
