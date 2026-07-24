import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportMonthlyTab } from "./ReportMonthlyTab";
import type { FilteredReport, GroupBreakdown, TradeStats } from "../app/types/report";

function grupa(key: string, label: string, netPnl: string): GroupBreakdown {
  return {
    key,
    label,
    trade_count: 1,
    win_count: 1,
    loss_count: 0,
    win_rate: "100",
    net_pnl: netPnl,
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

function raport(overrides: Partial<FilteredReport> = {}): FilteredReport {
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
    ...overrides,
  };
}

/**
 * `ReportMonthlyTab` - czysty komponent prezentacyjny (bez własnych efektów/komend), więc testy
 * nie potrzebują żadnego mockowania `invokeCommand`. Nieoczywiste rzeczy: (1) `formatDayLabel`
 * parsuje datę ISO ze świadomie wymuszoną strefą UTC (`timeZone: "UTC"`) - bez tego "2026-03-01"
 * mógłby wyświetlić się jako "28.02" w strefie z ujemnym przesunięciem względem UTC, bo
 * `new Date("2026-03-01T00:00:00Z")` w LOKALNEJ strefie cofa się na poprzedni dzień; (2) karta
 * "Zrealizowane na pozycjach otwartych" pojawia się TYLKO gdy `partially_closed_trades > 0` - żeby
 * nie zaśmiecać raportu zerem, gdy żadna pozycja nie jest częściowo zamknięta. Dotąd zero testów.
 */
describe("ReportMonthlyTab", () => {
  it("report === null pokazuje 'Wybierz rok i miesiąc'", () => {
    render(<ReportMonthlyTab report={null} currency="USD" monthLabel="" />);
    expect(screen.getByText("Wybierz rok i miesiąc")).toBeInTheDocument();
  });

  it("karta 'zrealizowane na pozycjach otwartych' ukryta, gdy partially_closed_trades === 0", () => {
    render(
      <ReportMonthlyTab
        report={raport({ stats: statystyki({ partially_closed_trades: 0 }) })}
        currency="USD"
        monthLabel="Marzec 2026"
      />,
    );
    expect(screen.queryByText(/Zrealizowane na pozycjach otwartych/)).not.toBeInTheDocument();
  });

  it("karta 'zrealizowane na pozycjach otwartych' pokazuje się z liczbą, gdy > 0", () => {
    render(
      <ReportMonthlyTab
        report={raport({
          stats: statystyki({ partially_closed_trades: 2, partially_realized_pnl: "15" }),
        })}
        currency="USD"
        monthLabel="Marzec 2026"
      />,
    );
    expect(screen.getByText("Zrealizowane na pozycjach otwartych (2)")).toBeInTheDocument();
  });

  it("formatDayLabel NIE cofa dnia przez strefę czasową (UTC wymuszone)", () => {
    // Maszyna uruchamiająca testy bywa w strefie o DODATNIM przesunięciu względem UTC (np.
    // Europe/Berlin) - tam usunięcie `timeZone: "UTC"` nie cofa dnia (dodatnie przesunięcie od
    // północy UTC zostaje w tym samym dniu kalendarzowym). Błąd ujawnia się dopiero w strefie
    // o UJEMNYM przesunięciu (np. USA) - wymuszamy ją tutaj, żeby test faktycznie coś sprawdzał
    // niezależnie od strefy maszyny CI.
    const oryginalnaStrefa = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      render(
        <ReportMonthlyTab
          report={raport({
            month_calendar: [
              { date: "2026-03-01", net_pnl: "50", trade_count: 1, win_count: 1, loss_count: 0 },
            ],
          })}
          currency="USD"
          monthLabel="Marzec 2026"
        />,
      );
      // Jedyny dzień w miesiącu jest jednocześnie najlepszym i najgorszym - stąd dwa dopasowania.
      expect(screen.getAllByText(/01\.03 · 50,00 USD/)).toHaveLength(2);
      expect(screen.queryByText(/28\.02/)).not.toBeInTheDocument();
    } finally {
      process.env.TZ = oryginalnaStrefa;
    }
  });

  it("najlepszy/najgorszy dzień wybiera skrajne wartości net_pnl, nie pierwszy/ostatni wpis", () => {
    render(
      <ReportMonthlyTab
        report={raport({
          month_calendar: [
            { date: "2026-03-05", net_pnl: "-30", trade_count: 1, win_count: 0, loss_count: 1 },
            { date: "2026-03-10", net_pnl: "80", trade_count: 1, win_count: 1, loss_count: 0 },
            { date: "2026-03-15", net_pnl: "10", trade_count: 1, win_count: 1, loss_count: 0 },
          ],
        })}
        currency="USD"
        monthLabel="Marzec 2026"
      />,
    );
    expect(screen.getByText(/10\.03 · 80,00 USD/)).toBeInTheDocument();
    expect(screen.getByText(/05\.03 · -30,00 USD/)).toBeInTheDocument();
  });

  it("brak strategii w raporcie pokazuje '—' zamiast nazwy najlepszej/najgorszej strategii", () => {
    render(
      <ReportMonthlyTab
        report={raport({ by_strategy: [] })}
        currency="USD"
        monthLabel="Marzec 2026"
      />,
    );
    expect(screen.getByText("Najlepsza strategia").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Najgorsza strategia").nextElementSibling).toHaveTextContent("—");
  });

  it("najlepsza/najgorsza strategia wybiera skrajne wartości, nie pierwszy/ostatni wpis", () => {
    render(
      <ReportMonthlyTab
        report={raport({
          by_strategy: [
            grupa("s1", "Breakout", "-10"),
            grupa("s2", "Trend", "40"),
            grupa("s3", "Reversal", "5"),
          ],
        })}
        currency="USD"
        monthLabel="Marzec 2026"
      />,
    );
    expect(screen.getByText("Najlepsza strategia").nextElementSibling).toHaveTextContent("Trend");
    expect(screen.getByText("Najgorsza strategia").nextElementSibling).toHaveTextContent(
      "Breakout",
    );
  });
});
