import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import type { AccountWithBalance } from "../app/types/account";
import type { FilteredReport, TradeStats } from "../app/types/report";
import type { Strategy } from "../app/types/strategy";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

const CHECKLIST_DISMISSED_KEY = "dziennik-tradera.dashboard-checklist-dismissed";

function konto(id: string): AccountWithBalance {
  return {
    id,
    name: `Konto ${id}`,
    description: null,
    account_type: null,
    currency: "USD",
    initial_balance: "1000.00",
    template_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    balance: "1000.00",
  };
}

function strategia(id: string): Strategy {
  return {
    id,
    name: `Strategia ${id}`,
    description: null,
    color: null,
    entry_rules: [],
    management_rules: [],
    legacy_entry_rules_text: null,
    legacy_management_rules_text: null,
    legacy_exit_rules_text: null,
    tags: [],
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
  };
}

function statystyki(totalTrades: number, closedTrades: number): TradeStats {
  return {
    total_trades: totalTrades,
    open_trades: 0,
    draft_trades: 0,
    closed_trades: closedTrades,
    win_count: 0,
    loss_count: 0,
    breakeven_count: 0,
    win_rate: null,
    gross_profit: "0",
    gross_loss: "0",
    net_pnl: "0",
    profit_factor: null,
    expectancy: null,
    average_win: null,
    average_loss: null,
    average_r: null,
    best_trade: null,
    worst_trade: null,
    average_trade_duration_minutes: null,
    max_drawdown: null,
    total_commission: "0",
    partially_closed_trades: 0,
    partially_realized_pnl: "0",
  };
}

function raport(totalTrades: number, closedTrades: number): FilteredReport {
  return {
    stats: statystyki(totalTrades, closedTrades),
    equity_curve: [],
    calendar: [],
    by_strategy: [],
    by_instrument: [],
    by_interval: [],
    monthly: [],
    yearly: [],
    quarterly: [],
    calendar_months: [],
    by_day_of_week: [],
    by_four_hour: [],
    by_side: [],
    top_best_trades: [],
    top_worst_trades: [],
    pnl_distribution: [],
    month_calendar: [],
    period_balance: {
      starting_balance: "1000",
      ending_balance: "1000",
      net_cash_flow: "0",
      return_percent: null,
      max_drawdown: "0",
      max_drawdown_percent: null,
    },
  };
}

function nastawKomendy(handlers: {
  accounts?: () => Promise<AccountWithBalance[]>;
  strategies?: () => Promise<Strategy[]>;
  report?: () => Promise<FilteredReport>;
}): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "list_accounts") return (handlers.accounts ?? (() => Promise.resolve([])))();
    if (command === "list_broker_templates") return Promise.resolve([]);
    if (command === "list_strategies") {
      return (handlers.strategies ?? (() => Promise.resolve([])))();
    }
    if (command === "list_intervals") return Promise.resolve([]);
    if (command === "list_instruments") return Promise.resolve([]);
    if (command === "get_filtered_report") {
      return (handlers.report ?? (() => Promise.reject(new Error("brak w teście"))))();
    }
    if (command === "compare_accounts_report") return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

/**
 * `DashboardPage` łączy dużo już przetestowanych osobno komponentów (StatCard, ChartCard,
 * GroupBarChart, HeatmapTable...) - jedyna logika WŁASNA tego ekranu to lista startowa "Start
 * pracy". Nieoczywiste rzeczy: (1) lista chowa się automatycznie, gdy istnieje PIERWSZA własna
 * strategia ORAZ pierwsza transakcja (`strategies.length > 0 && report.stats.total_trades > 0`,
 * oba warunki naraz - jeden bez drugiego nie wystarczy); (2) ręczne zamknięcie przez "×" zapisuje
 * się do `localStorage`, więc lista nie wraca po odświeżeniu, nawet jeśli warunki auto-ukrycia
 * jeszcze nie są spełnione. Sekcja renderuje się NIEZALEŻNIE od stanu kont/raportu (zawsze na
 * samej górze), więc pierwsze trzy testy nie muszą w ogóle mockować kont ani raportu. Dotąd zero
 * testów.
 */
describe("DashboardPage - lista startowa 'Start pracy'", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    localStorage.clear();
  });

  it("pokazuje się, gdy nie ma ani zamkniętej flagi, ani postępu (brak kont/strategii)", async () => {
    nastawKomendy({});
    wyrenderuj();
    expect(await screen.findByText("Start pracy")).toBeInTheDocument();
  });

  it("nie pokazuje się, gdy flaga w localStorage jest już ustawiona", async () => {
    localStorage.setItem(CHECKLIST_DISMISSED_KEY, "true");
    nastawKomendy({});
    wyrenderuj();
    await screen.findByText("Brak danych do podsumowania");
    expect(screen.queryByText("Start pracy")).not.toBeInTheDocument();
  });

  it("klik w '×' chowa listę i zapisuje flagę do localStorage", async () => {
    const user = userEvent.setup();
    nastawKomendy({});
    wyrenderuj();
    await screen.findByText("Start pracy");
    await user.click(screen.getByRole("button", { name: "Zamknij listę startową" }));
    expect(screen.queryByText("Start pracy")).not.toBeInTheDocument();
    expect(localStorage.getItem(CHECKLIST_DISMISSED_KEY)).toBe("true");
  });

  it("chowa się automatycznie, gdy JEST strategia I JEST zamknięta transakcja (oba naraz)", async () => {
    nastawKomendy({
      accounts: () => Promise.resolve([konto("a")]),
      strategies: () => Promise.resolve([strategia("s1")]),
      report: () => Promise.resolve(raport(1, 0)),
    });
    wyrenderuj();
    await screen.findByText("Brak zamkniętych transakcji");
    expect(screen.queryByText("Start pracy")).not.toBeInTheDocument();
  });

  it("NIE chowa się, gdy jest strategia, ale zero transakcji (tylko jeden warunek spełniony)", async () => {
    nastawKomendy({
      accounts: () => Promise.resolve([konto("a")]),
      strategies: () => Promise.resolve([strategia("s1")]),
      report: () => Promise.resolve(raport(0, 0)),
    });
    wyrenderuj();
    await screen.findByText("Brak zamkniętych transakcji");
    expect(screen.getByText("Start pracy")).toBeInTheDocument();
  });
});
