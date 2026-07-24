import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportStrategyTab } from "./ReportStrategyTab";
import { toAccountBreakdown } from "./accountBreakdown";
import type { AccountWithBalance } from "../app/types/account";
import type {
  AccountComparisonFilter,
  AccountComparisonRow,
  FilteredReport,
  TradeStats,
} from "../app/types/report";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function konto(id: string, name: string): AccountWithBalance {
  return {
    id,
    name,
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

function statystyki(overrides: Partial<TradeStats> = {}): TradeStats {
  return {
    total_trades: 0,
    open_trades: 0,
    draft_trades: 0,
    closed_trades: 0,
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
    ...overrides,
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

function filtrKonta(): AccountComparisonFilter {
  return {
    instrument_id: null,
    strategy_id: "s1",
    interval_id: null,
    side: null,
    year: null,
    month: null,
  };
}

function wierszKonta(accountId: string, netPnl: string): AccountComparisonRow {
  return {
    account_id: accountId,
    stats: statystyki({ net_pnl: netPnl, closed_trades: 3 }),
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

/**
 * `toAccountBreakdown` - wydzielona z `ReportStrategyTab` czysta funkcja, bo `GroupBarChart`
 * (Recharts + `ResponsiveContainer`) nie renderuje etykiet w jsdom (brak `ResizeObserver`/layoutu -
 * ten sam, ustalony w tej bazie kodu problem co przy `barShape`/`computeCumulativeSeries`), więc
 * nazwy kont nigdy nie trafiłyby do drzewa DOM podczas testu renderującego cały komponent.
 * Nieoczywista rzecz: nazwa konta ma fallback do samego `account_id`, gdy konto zniknęło z listy
 * `accounts` między zapytaniami (np. zarchiwizowane w międzyczasie).
 */
describe("toAccountBreakdown", () => {
  it("znane konto dostaje jego nazwę jako etykietę", () => {
    const wynik = toAccountBreakdown([wierszKonta("a", "50")], [konto("a", "Konto A")]);
    expect(wynik[0]?.label).toBe("Konto A");
  });

  it("nieznane konto (brak na liście accounts) dostaje fallback do account_id", () => {
    const wynik = toAccountBreakdown(
      [wierszKonta("usuniete-konto", "50")],
      [konto("a", "Konto A")],
    );
    expect(wynik[0]?.label).toBe("usuniete-konto");
  });
});

/**
 * `ReportStrategyTab` - jedyny podraport dociągający DODATKOWE dane spoza `FilteredReport`
 * (wykres "Wynik wg konta" przez osobne `compare_accounts_report`). Nieoczywiste rzeczy: (1) pusty
 * stan pokazuje się, gdy brakuje ALBO raportu, ALBO filtru konta - obie połówki warunku trzeba
 * sprawdzić osobno; (2) dopóki `compare_accounts_report` nie odpowie, wykres "Wynik wg konta"
 * pokazuje "Wczytywanie..." zamiast pustego/błędnego wykresu. Dotąd zero testów.
 */
describe("ReportStrategyTab", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("report === null pokazuje pusty stan 'Wybór strategii jest wymagany'", () => {
    render(
      <ReportStrategyTab
        report={null}
        currency="USD"
        selectedLabel={undefined}
        accounts={[]}
        accountFilter={filtrKonta()}
      />,
    );
    expect(screen.getByText("Wybór strategii jest wymagany")).toBeInTheDocument();
  });

  it("accountFilter === null (mimo poprawnego raportu) też pokazuje pusty stan", () => {
    render(
      <ReportStrategyTab
        report={raport()}
        currency="USD"
        selectedLabel="Breakout"
        accounts={[]}
        accountFilter={null}
      />,
    );
    expect(screen.getByText("Wybór strategii jest wymagany")).toBeInTheDocument();
  });

  it("dopóki 'Wynik wg konta' się nie wczyta, pokazuje 'Wczytywanie...'", async () => {
    invokeCommand.mockImplementation(() => new Promise(() => undefined));
    render(
      <ReportStrategyTab
        report={raport()}
        currency="USD"
        selectedLabel="Breakout"
        accounts={[konto("a", "Konto A")]}
        accountFilter={filtrKonta()}
      />,
    );
    expect(await screen.findByText("Wczytywanie...")).toBeInTheDocument();
  });
});
