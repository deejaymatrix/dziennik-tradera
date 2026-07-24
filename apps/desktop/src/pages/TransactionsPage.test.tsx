import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionsPage } from "./TransactionsPage";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AccountWithBalance } from "../app/types/account";
import type { Trade } from "../app/types/trade";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function konto(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
  return {
    id: "konto-1",
    name: "Konto główne",
    description: null,
    account_type: null,
    currency: "USD",
    initial_balance: "1000.00",
    template_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    balance: "1000.00",
    ...overrides,
  };
}

function transakcja(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "1",
    account_id: "konto-1",
    display_number: 1,
    instrument_id: null,
    instrument_spec_snapshot: null,
    strategy_id: null,
    strategy_snapshot: null,
    status: "open",
    side: "buy",
    opened_at: "2026-07-10T08:00:00Z",
    closed_at: null,
    interval_id: null,
    interval: null,
    session: null,
    volume: "1",
    entry_price: "1.1000",
    stop_loss: null,
    take_profit: null,
    exit_price: null,
    commission: "0",
    swap: "0",
    other_fees: "0",
    conversion_rate: null,
    gross_pnl: null,
    net_pnl: null,
    pnl_points: null,
    pnl_percent: null,
    pnl_r: null,
    risk_amount: null,
    risk_percent: null,
    plan_before: null,
    management_notes: null,
    post_trade_summary: null,
    conclusion: null,
    tags: [],
    plan_adherence_rating: null,
    pnl_source: "auto",
    pnl_override_reason: null,
    emotions: null,
    checklist: null,
    partial_closes: [],
    created_at: "2026-07-10T08:00:00Z",
    updated_at: "2026-07-10T08:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function nastawKomendy(handlers: {
  accounts?: () => Promise<AccountWithBalance[]>;
  trades?: (args: { accountId: string; includeDeleted: boolean }) => Promise<Trade[]>;
}): void {
  invokeCommand.mockImplementation(
    (command: string, args?: { accountId: string; includeDeleted: boolean }) => {
      if (command === "get_preferences") {
        return Promise.reject(new Error("brak w teście"));
      }
      if (command === "list_accounts") {
        return (handlers.accounts ?? (() => Promise.resolve([konto()])))();
      }
      if (command === "list_trades") {
        return (handlers.trades ?? (() => Promise.resolve([])))(
          args as { accountId: string; includeDeleted: boolean },
        );
      }
      return Promise.resolve(null);
    },
  );
}

function wyrenderuj() {
  render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <TransactionsPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>,
  );
}

/**
 * `TransactionsPage` - lista transakcji z filtrami status/kierunek/szukaj + panel szczegółów obok
 * tabeli (Split View). Nieoczywiste rzeczy: (1) wyszukiwanie dopasowuje ALBO symbol instrumentu,
 * ALBO nazwę strategii (OR), a wynik łączy się z filtrami statusu i kierunku przez AND; (2) klik w
 * przycisk akcji (Edytuj/Usuń/Zamknij) w wierszu NIE MOŻE przy okazji otworzyć panelu szczegółów -
 * `event.stopPropagation()` na kontenerze akcji rozdziela te dwie intencje w tym samym wierszu;
 * (3) "Zamknij pozycję" pokazuje się TYLKO dla transakcji otwartej i NIE usuniętej - zamkniętej
 * albo znajdującej się w koszu nie da się "zamknąć" ponownie; (4) po przeładowaniu listy (np. po
 * przełączeniu "Pokaż kosz") panel szczegółów zamyka się automatycznie, jeśli inspectowana
 * transakcja zniknęła z nowych danych. Dotąd zero testów.
 */
describe("TransactionsPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pusta lista transakcji pokazuje 'Brak transakcji', nie tabelę", async () => {
    nastawKomendy({ trades: () => Promise.resolve([]) });
    wyrenderuj();
    expect(await screen.findByText("Brak transakcji")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("szukanie dopasowuje instrument LUB strategię, połączone z filtrem statusu przez AND", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      trades: () =>
        Promise.resolve([
          transakcja({
            id: "a",
            status: "open",
            instrument_spec_snapshot: { display_symbol: "EURUSD" } as never,
          }),
          transakcja({
            id: "b",
            status: "closed",
            strategy_snapshot: { strategy_id: "s1", name: "Breakout", color: null },
          }),
          transakcja({ id: "c", status: "open", instrument_spec_snapshot: null }),
        ]),
    });
    wyrenderuj();
    await screen.findByRole("table");
    // Wiersze mają jawne `role="button"` (całość klikalna) - to NADPISUJE domyślną rolę "row"
    // wiersza tabeli w drzewie dostępności, więc trzeba liczyć po roli "button", nie "row".
    expect(screen.getAllByRole("button", { name: /^Otwórz szczegóły/ })).toHaveLength(3);

    await user.type(screen.getByLabelText("Szukaj"), "breakout");
    // Tylko transakcja "b" pasuje do wyszukiwania (przez nazwę strategii) - reszta znika.
    expect(screen.getAllByRole("button", { name: /^Otwórz szczegóły/ })).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText("Status"), "open");
    // "b" pasuje do wyszukiwania, ale ma status "closed" - filtr AND usuwa go też.
    expect(screen.getByText("Brak transakcji spełniających filtry")).toBeInTheDocument();
  });

  it("klik w przycisk akcji w wierszu NIE otwiera panelu szczegółów", async () => {
    const user = userEvent.setup();
    nastawKomendy({ trades: () => Promise.resolve([transakcja({ id: "a" })]) });
    wyrenderuj();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Edytuj transakcję #1" }));
    expect(screen.queryByLabelText(/Szczegóły transakcji/)).not.toBeInTheDocument();
  });

  it("'Zamknij pozycję' pokazuje się TYLKO dla otwartej i NIE usuniętej transakcji", async () => {
    nastawKomendy({
      trades: () =>
        Promise.resolve([
          transakcja({ id: "a", display_number: 1, status: "open", deleted_at: null }),
          transakcja({ id: "b", display_number: 2, status: "closed", deleted_at: null }),
          transakcja({
            id: "c",
            display_number: 3,
            status: "open",
            deleted_at: "2026-07-11T00:00:00Z",
          }),
        ]),
    });
    wyrenderuj();
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Zamknij pozycję #1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zamknij pozycję #2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zamknij pozycję #3" })).not.toBeInTheDocument();
  });

  it("panel szczegółów zamyka się, gdy inspectowana transakcja znika po przeładowaniu listy", async () => {
    // Lista NIE może zostać pusta po przeładowaniu (transakcja "b" zostaje) - inaczej zewnętrzny
    // warunek `filteredTrades.length > 0` ukryłby panel z zupełnie innego powodu, nie testując
    // faktycznej logiki odświeżania/zamykania inspektora w `loadTrades`.
    const user = userEvent.setup();
    let wywolanie = 0;
    nastawKomendy({
      trades: () => {
        wywolanie += 1;
        return Promise.resolve(
          wywolanie === 1
            ? [
                transakcja({ id: "a", display_number: 1 }),
                transakcja({ id: "b", display_number: 2 }),
              ]
            : [transakcja({ id: "b", display_number: 2 })],
        );
      },
    });
    wyrenderuj();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Otwórz szczegóły transakcji #1" }));
    expect(await screen.findByLabelText(/Szczegóły transakcji/)).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Pokaż kosz" }));
    await screen.findByRole("button", { name: "Otwórz szczegóły transakcji #2" });
    expect(screen.queryByLabelText(/Szczegóły transakcji/)).not.toBeInTheDocument();
  });

  it("Edytuj jest wyłączony dla transakcji w koszu (deleted_at ustawiony)", async () => {
    nastawKomendy({
      trades: () => Promise.resolve([transakcja({ id: "a", deleted_at: "2026-07-11T00:00:00Z" })]),
    });
    wyrenderuj();
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Edytuj transakcję #1" })).toBeDisabled();
  });
});
