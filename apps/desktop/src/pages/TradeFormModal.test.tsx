import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeFormModal } from "./TradeFormModal";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

// Preferencje mockujemy jako jeszcze niewczytane (`null`) - formularz i pola obsługują ten stan
// wartościami domyślnymi, a testowi chodzi wyłącznie o układ, nie o wczytywanie ustawień.
vi.mock("../app/PreferencesProvider", () => ({
  usePreferences: () => ({ preferences: null }),
  useOptionalPreferences: () => null,
}));

const KONTO = {
  id: "k1",
  name: "Vantage Live",
  currency: "USD",
  balance: "12345.67",
  template_id: "t1",
  archived_at: null,
};

function stubCommand(name: string): unknown {
  switch (name) {
    case "get_account":
      return KONTO;
    case "list_broker_templates":
      return [{ id: "t1", name: "Vantage STP" }];
    case "list_instruments":
    case "list_strategies":
    case "list_intervals":
    case "list_emotional_states":
      return [];
    default:
      return [];
  }
}

function renderForm(): ReactElement {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <TradeFormModal
          open
          onClose={vi.fn()}
          onSaved={vi.fn()}
          accounts={[KONTO as never]}
          accountId={KONTO.id}
        />
      </ConfirmProvider>
    </ToastProvider>,
  ) as never;
}

describe("TradeFormModal - Guided Workflow", () => {
  beforeEach(() => {
    invokeCommand.mockReset();
    invokeCommand.mockImplementation((name: string) => Promise.resolve(stubCommand(name)));
  });

  it("pokazuje nazwę konta i jego saldo w stałym nagłówku formularza", async () => {
    renderForm();

    // Nagłówek ma być widoczny od razu, bez rozwijania jakiegokolwiek panelu - to on
    // odpowiada za „nagłówek z kontem i aktualnym saldem" z sekcji 8 promptu.
    await waitFor(() => {
      expect(screen.getByText(KONTO.name)).toBeTruthy();
    });
    // Saldo sprawdzamy WEWNĄTRZ nagłówka - ta sama kwota pojawia się też w bocznym panelu
    // obliczeń, więc szukanie po całym dokumencie trafiałoby w wiele elementów.
    const naglowek = screen.getByText(KONTO.name).parentElement;
    expect(naglowek).not.toBeNull();
    expect(within(naglowek as HTMLElement).getByText(/12\s?345[.,]67/)).toBeTruthy();
  });

  it("ma wszystkie trzy akcje paska dolnego", async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Zapisz transakcję" })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Zapisz szkic" })).toBeTruthy();
    // „Anuluj" występuje też w innych miejscach formularza - wystarczy, że pasek je ma.
    expect(screen.getAllByRole("button", { name: "Anuluj" }).length).toBeGreaterThan(0);
  });
});
