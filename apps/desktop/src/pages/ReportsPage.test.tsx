import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "./ReportsPage";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { blankReportFilter } from "./ReportFilterBar";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AccountWithBalance } from "../app/types/account";
import type { FilteredReport, TradeStats } from "../app/types/report";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

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

function statystyki(): TradeStats {
  return {
    total_trades: 1,
    open_trades: 0,
    draft_trades: 0,
    closed_trades: 1,
    win_count: 1,
    loss_count: 0,
    breakeven_count: 0,
    win_rate: "100",
    gross_profit: "50",
    gross_loss: "0",
    net_pnl: "50",
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

function raport(): FilteredReport {
  return {
    stats: statystyki(),
    equity_curve: [],
    calendar: [],
    by_strategy: [],
    by_instrument: [],
    by_interval: [],
    monthly: [],
    yearly: [
      {
        key: "2024",
        label: "2024",
        trade_count: 0,
        win_count: 0,
        loss_count: 0,
        win_rate: null,
        net_pnl: "0",
      },
      {
        key: "2026",
        label: "2026",
        trade_count: 0,
        win_count: 0,
        loss_count: 0,
        win_rate: null,
        net_pnl: "0",
      },
    ],
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
      ending_balance: "1050",
      net_cash_flow: "0",
      return_percent: null,
      max_drawdown: "0",
      max_drawdown_percent: null,
    },
  };
}

function nastawKomendy(): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "get_preferences") return Promise.reject(new Error("brak w teście"));
    if (command === "list_accounts") return Promise.resolve([konto("a")]);
    if (command === "list_broker_templates") return Promise.resolve([]);
    if (command === "list_strategies") return Promise.resolve([]);
    if (command === "list_intervals") return Promise.resolve([]);
    if (command === "list_instruments") return Promise.resolve([]);
    if (command === "get_filtered_report") return Promise.resolve(raport());
    if (command === "compare_accounts_report") return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(
    <PreferencesProvider>
      <ToastProvider>
        <ReportsPage />
      </ToastProvider>
    </PreferencesProvider>,
  );
}

/**
 * `ReportsPage` - pasek zakładek podraportów, każdy z osobnym zapamiętanym filtrem
 * (`localStorage`). Nieoczywiste rzeczy: (1) przełączenie zakładki z ISTNIEJĄCYM zapamiętanym
 * filtrem przywraca go W CAŁOŚCI (nawet z ustawionym miesiącem) i KOŃCZY tam - dopiero gdy
 * zapamiętanego filtru NIE MA, czyści pole miesiąca przy przejściu na "Roczny" (pole "Miesiąc"
 * nie ma tam sensu, inaczej zawężałoby raport w tle, niewidocznie dla użytkownika); (2) Raport
 * Roczny wymaga wybranego roku, Raport Miesięczny wymaga ROKU I MIESIĄCA naraz - inaczej pod-
 * komponent dostaje `report={null}` i pokazuje własny pusty stan. Dotąd zero testów.
 */
describe("ReportsPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    localStorage.clear();
  });

  it("zakładka 'Roczny' bez wybranego roku pokazuje 'Wybierz rok'", async () => {
    const user = userEvent.setup();
    nastawKomendy();
    wyrenderuj();
    await user.click(await screen.findByRole("tab", { name: "Roczny" }));
    expect(await screen.findByText("Wybierz rok")).toBeInTheDocument();
  });

  it("zakładka 'Miesięczny' bez wybranego miesiąca (mimo wybranego roku) pokazuje pusty stan", async () => {
    const user = userEvent.setup();
    nastawKomendy();
    wyrenderuj();
    await screen.findByRole("tab", { name: "Miesięczny" });
    await screen.findByRole("option", { name: "2026" });
    await user.selectOptions(screen.getByLabelText("Rok"), "2026");
    expect(await screen.findByText("Wybierz rok i miesiąc")).toBeInTheDocument();
  });

  it("przyciski eksportu są ukryte na zakładce 'Porównanie kont'", async () => {
    const user = userEvent.setup();
    nastawKomendy();
    wyrenderuj();
    await screen.findByRole("button", { name: "CSV" });
    await user.click(screen.getByRole("tab", { name: "Porównanie kont" }));
    expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
  });

  it("przełączenie na zakładkę z zapamiętanym filtrem przywraca DOKŁADNIE ten filtr", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "dziennik-tradera.report-filter:yearly",
      JSON.stringify({ ...blankReportFilter("a"), year: "2024", month: "3" }),
    );
    nastawKomendy();
    wyrenderuj();
    await screen.findByRole("tab", { name: "Miesięczny" });
    // Miesiąc na wciąż aktywnej (przed przełączeniem) zakładce ustawiony na coś INNEGO niż
    // zapamiętany filtr - żeby test faktycznie odróżniał "przywrócono zapamiętany filtr"
    // od "zignorowano przełączenie i zostały stare wartości".
    await user.selectOptions(screen.getByLabelText("Miesiąc"), "6");
    await user.click(screen.getByRole("tab", { name: "Roczny" }));
    expect(await screen.findByLabelText("Rok")).toHaveValue("2024");
  });

  it("przełączenie na 'Roczny' BEZ zapamiętanego filtru czyści pole miesiąca", async () => {
    // Pole "Miesiąc" jest ukryte na samej zakładce Roczny (nie ma tam sensu), więc czyszczenie
    // sprawdzamy przez PÓŹNIEJSZE przejście na zakładkę "Instrument" (bez własnego zapamiętanego
    // filtru) - dostaje ten sam, już wyczyszczony `filter`, więc pole miesiąca powinno być puste.
    // Powrót na "Miesięczny" NIE nadaje się do tego testu: ten tab ma WŁASNY zapamiętany filtr
    // zapisany automatycznie z miesiącem "3" jeszcze zanim przełączyliśmy się na "Roczny".
    const user = userEvent.setup();
    nastawKomendy();
    wyrenderuj();
    await screen.findByRole("tab", { name: "Miesięczny" });
    await screen.findByRole("option", { name: "2026" });
    await user.selectOptions(screen.getByLabelText("Rok"), "2026");
    await user.selectOptions(screen.getByLabelText("Miesiąc"), "3");
    await user.click(screen.getByRole("tab", { name: "Roczny" }));
    await user.click(screen.getByRole("tab", { name: "Instrument" }));
    expect(screen.getByLabelText("Miesiąc")).toHaveValue("");
  });
});
