import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SettingsPage } from "./SettingsPage";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { Preferences } from "../app/types/preferences";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));
vi.mock("../app/useUpdater", () => ({
  useUpdater: () => ({
    state: { kind: "idle" },
    checkForUpdates: vi.fn(),
    downloadAndInstall: vi.fn(),
    restartNow: vi.fn(),
  }),
}));
vi.mock("../app/useTauriQuery", () => ({
  useTauriQuery: () => ({ state: { kind: "loading" } }),
}));

function defaultPreferences(): Preferences {
  return {
    appearance: {
      theme: "dark",
      accent_color: "#d7b45a",
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
      open_details_after_save: false,
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
      report_ranking_size: "10",
      report_remember_filters: true,
    },
    notifications: {
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
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
    data: { backup_frequency: "daily", backup_retention: "30" },
  };
}

let stored: Preferences;

beforeEach(() => {
  stored = defaultPreferences();
  invokeCommand.mockReset();
  invokeCommand.mockImplementation((command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "get_preferences":
        return Promise.resolve(stored);
      case "update_preferences_section": {
        stored = args?.preferences as Preferences;
        return Promise.resolve(stored);
      }
      case "reset_preferences_section":
        stored = defaultPreferences();
        return Promise.resolve(stored);
      case "list_accounts":
      case "list_intervals":
        return Promise.resolve([]);
      default:
        return Promise.reject(new Error(`nieoczekiwana komenda: ${command}`));
    }
  });
});

function renderPage(): ReactElement {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <SettingsPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>,
  ) as unknown as ReactElement;
}

/**
 * Otwarte okno „Niezapisane zmiany".
 *
 * `Modal` opiera się na natywnym `<dialog>`, więc jego treść ZAWSZE siedzi w DOM, a o widoczności
 * decyduje atrybut `open` ustawiany przez `showModal()`/`close()`. Dlatego szukamy przez rolę,
 * a nie przez sam tekst: zamknięty `<dialog>` wypada z drzewa dostępności, więc zapytanie po roli
 * jest jednoznaczną odpowiedzią na pytanie „czy użytkownik to widzi".
 */
function openUnsavedDialog(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Niezapisane zmiany" });
  const dialog = heading.closest("dialog");
  if (!dialog) {
    throw new Error("nagłówek okna nie leży w elemencie <dialog>");
  }
  return dialog;
}

function unsavedDialogIsHidden(): boolean {
  return screen.queryByRole("heading", { name: "Niezapisane zmiany" }) === null;
}

async function waitForLoaded(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Wygląd" })).toBeInTheDocument();
  });
}

describe("SettingsPage", () => {
  it("pokazuje sekcje jako osobne widoki, nie jedną długą stronę", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    // Karta z sekcji Wygląd jest widoczna, a karta z Powiadomień NIE - obie naraz oznaczałyby
    // dokładnie tę jedną długą stronę, której specyfikacja zabrania.
    expect(screen.getByRole("heading", { name: "Motyw i kolory" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ciche godziny" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Powiadomienia/ }));

    expect(screen.getByRole("heading", { name: "Ciche godziny" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Motyw i kolory" })).not.toBeInTheDocument();
  });

  it("aktywna pozycja menu jest jednoznacznie oznaczona", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    const appearance = screen.getByRole("button", { name: /Wygląd/ });
    expect(appearance).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: /Domyślne wartości/ }));

    expect(appearance).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /Domyślne wartości/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("„Zapisz zmiany” jest nieaktywne, dopóki nic nie zmieniono", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeDisabled();

    await user.click(screen.getByRole("switch", { name: "Animacje interfejsu" }));

    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeEnabled();
  });

  it("„Anuluj” przywraca stan sprzed edycji", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    const animations = screen.getByRole("switch", { name: "Animacje interfejsu" });
    await user.click(animations);
    expect(animations).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Anuluj" }));

    expect(screen.getByRole("switch", { name: "Animacje interfejsu" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeDisabled();
  });

  it("zapisuje WYŁĄCZNIE bieżącą sekcję", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    await user.click(screen.getByRole("switch", { name: "Animacje interfejsu" }));
    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => {
      expect(invokeCommand).toHaveBeenCalledWith(
        "update_preferences_section",
        expect.objectContaining({ section: "appearance" }),
      );
    });
  });

  it("opuszczenie zmienionej sekcji wymaga decyzji", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    await user.click(screen.getByRole("switch", { name: "Animacje interfejsu" }));
    await user.click(screen.getByRole("button", { name: /Powiadomienia/ }));

    // Sekcja NIE przełącza się od razu - najpierw trzeba zdecydować, co ze zmianami.
    const dialog = openUnsavedDialog();
    expect(screen.getByRole("heading", { name: "Motyw i kolory" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Odrzuć" }));

    expect(screen.getByRole("heading", { name: "Ciche godziny" })).toBeInTheDocument();
  });

  it("przejście bez zmian nie pyta o nic", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: /Powiadomienia/ }));

    expect(unsavedDialogIsHidden()).toBe(true);
    expect(screen.getByRole("heading", { name: "Ciche godziny" })).toBeInTheDocument();
  });

  it("nakłada zapisany wygląd na dokument, a nie tylko go przechowuje", async () => {
    stored.appearance = {
      ...stored.appearance,
      theme: "light",
      accent_color: "#4f8ef7",
      ui_scale: "120",
      density: "compact",
      corner_radius: "large",
      animations: false,
      reduce_motion: true,
    };
    renderPage();
    await waitForLoaded();

    const root = document.documentElement;
    await waitFor(() => {
      expect(root.getAttribute("data-theme")).toBe("light");
    });
    expect(root.getAttribute("data-ui-scale")).toBe("120");
    expect(root.getAttribute("data-density")).toBe("compact");
    expect(root.getAttribute("data-radius")).toBe("large");
    expect(root.getAttribute("data-animations")).toBe("off");
    expect(root.getAttribute("data-reduce-motion")).toBe("true");
    expect(root.style.getPropertyValue("--color-accent")).toBe("#4f8ef7");
  });

  it("podgląd wyglądu działa na żywo, a „Anuluj” go cofa", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    const root = document.documentElement;
    await waitFor(() => {
      expect(root.getAttribute("data-density")).toBe("standard");
    });

    await user.selectOptions(screen.getByLabelText("Gęstość"), "spacious");

    // Podgląd NA ŻYWO - widoczny natychmiast, jeszcze przed zapisaniem.
    expect(root.getAttribute("data-density")).toBe("spacious");
    expect(stored.appearance.density).toBe("standard");

    await user.click(screen.getByRole("button", { name: "Anuluj" }));

    expect(root.getAttribute("data-density")).toBe("standard");
  });

  it("kolor akcentu dobiera kontrastowy kolor tekstu z luminancji", async () => {
    stored.appearance = { ...stored.appearance, accent_color: "#f5e6a8" };
    renderPage();
    await waitForLoaded();

    // Jasny akcent musi dostać CIEMNY tekst - inaczej napis na przycisku byłby nieczytelny.
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--color-accent-contrast")).toBe(
        "#10151d",
      );
    });
  });

  it("sekcja informacyjna nie ma paska zapisu", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: /Aktualizacje i informacje/ }));

    expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Przywróć domyślne" })).not.toBeInTheDocument();
  });
});
