import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { PreferencesProvider } from "./PreferencesProvider";
import { useOptionalConfirm } from "./useOptionalConfirm";
import type { Preferences } from "./types/preferences";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("./invokeCommand", () => ({ invokeCommand }));

function preferencje(confirmMoveToTrash: boolean, confirmPermanentOperation: boolean): Preferences {
  return {
    appearance: {
      theme: "dark",
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
      confirm_move_to_trash: confirmMoveToTrash,
      confirm_permanent_operation: confirmPermanentOperation,
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

function Wywolanie({
  rodzaj,
  onWynik,
}: {
  rodzaj: "trash" | "permanent";
  onWynik: (wynik: boolean) => void;
}): React.ReactElement {
  const optionalConfirm = useOptionalConfirm();
  return (
    <button
      type="button"
      onClick={() => {
        void optionalConfirm(rodzaj, "Na pewno?").then(onWynik);
      }}
    >
      Wywołaj
    </button>
  );
}

/**
 * `useOptionalConfirm` respektuje przełączniki „Potwierdzenie przeniesienia do kosza"/
 * „Potwierdzenie operacji nieodwracalnej" z Ustawień - gdy użytkownik je wyłączył, operacja ma
 * iść dalej BEZ okna. Błąd tutaj w dowolną stronę jest realnym ryzykiem: pomylony rodzaj
 * (`trash` sprawdzający `confirm_permanent_operation` zamiast własnego pola) mógłby albo cicho
 * pomijać potwierdzenie, którego użytkownik nie wyłączył, albo pokazywać je mimo wyłączenia -
 * ten sam rejon bezpieczeństwa danych co `ConfirmDialog` (część 69), dotąd bez ŻADNEGO testu.
 */
describe("useOptionalConfirm - respektuje przełączniki potwierdzeń per rodzaj operacji", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pokazuje prawdziwe okno, gdy potwierdzenie kosza jest WŁĄCZONE", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(preferencje(true, true));
    const onWynik = vi.fn();

    render(
      <PreferencesProvider>
        <ConfirmProvider>
          <Wywolanie rodzaj="trash" onWynik={onWynik} />
        </ConfirmProvider>
      </PreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Wywołaj" }));
    expect(screen.getByText("Na pewno?")).toBeInTheDocument();
    expect(onWynik).not.toHaveBeenCalled();
  });

  it("pomija okno i rozwiązuje na true, gdy potwierdzenie kosza jest WYŁĄCZONE", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(preferencje(false, true));
    const onWynik = vi.fn();

    render(
      <PreferencesProvider>
        <ConfirmProvider>
          <Wywolanie rodzaj="trash" onWynik={onWynik} />
        </ConfirmProvider>
      </PreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Wywołaj" }));
    expect(screen.queryByText("Na pewno?")).not.toBeInTheDocument();
    expect(onWynik).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("wyłączenie potwierdzenia kosza NIE wyłącza potwierdzenia operacji nieodwracalnej", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(preferencje(false, true));
    const onWynik = vi.fn();

    render(
      <PreferencesProvider>
        <ConfirmProvider>
          <Wywolanie rodzaj="permanent" onWynik={onWynik} />
        </ConfirmProvider>
      </PreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Wywołaj" }));
    expect(screen.getByText("Na pewno?")).toBeInTheDocument();
    expect(onWynik).not.toHaveBeenCalled();
  });

  it("wyłączenie potwierdzenia operacji nieodwracalnej NIE wyłącza potwierdzenia kosza", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(preferencje(true, false));
    const onWynik = vi.fn();

    render(
      <PreferencesProvider>
        <ConfirmProvider>
          <Wywolanie rodzaj="trash" onWynik={onWynik} />
        </ConfirmProvider>
      </PreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Wywołaj" }));
    expect(screen.getByText("Na pewno?")).toBeInTheDocument();
    expect(onWynik).not.toHaveBeenCalled();
  });

  it("pomija okno operacji nieodwracalnej, gdy TO KONKRETNE potwierdzenie jest wyłączone", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(preferencje(true, false));
    const onWynik = vi.fn();

    render(
      <PreferencesProvider>
        <ConfirmProvider>
          <Wywolanie rodzaj="permanent" onWynik={onWynik} />
        </ConfirmProvider>
      </PreferencesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Wywołaj" }));
    expect(screen.queryByText("Na pewno?")).not.toBeInTheDocument();
    expect(onWynik).toHaveBeenCalledExactlyOnceWith(true);
  });
});
