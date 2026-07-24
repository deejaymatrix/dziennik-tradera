import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportSymbolTab } from "./ReportSymbolTab";
import type { FilteredReport, TradeStats } from "../app/types/report";

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
 * `ReportSymbolTab` - czysty komponent prezentacyjny (Raport Symbolu), bez własnych obliczeń poza
 * jednym warunkiem: brak raportu pokazuje pusty stan zamiast statystyk/wykresów. Formatowanie
 * (`formatPercent`/`formatMinutes`) ma już bezpośrednie testy w `reportFormat.test.ts` - tu chodzi
 * tylko o samo okablowanie (czy właściwe pola trafiają do właściwych kart).
 */
describe("ReportSymbolTab", () => {
  it("report === null pokazuje pusty stan 'Najpierw wybierz instrument'", () => {
    render(<ReportSymbolTab report={null} currency="USD" selectedLabel={undefined} />);
    expect(screen.getByText("Najpierw wybierz instrument")).toBeInTheDocument();
  });

  it("z raportem pokazuje etykietę wybranego symbolu i statystyki win rate / śr. czas w trade", () => {
    render(
      <ReportSymbolTab
        report={raport({
          stats: statystyki({ win_rate: "62.5", average_trade_duration_minutes: 90 }),
        })}
        currency="USD"
        selectedLabel="US500"
      />,
    );
    expect(screen.getByText("US500")).toBeInTheDocument();
    expect(screen.getByText("Win rate").nextElementSibling).toHaveTextContent("62.50%");
    expect(screen.getByText("Śr. czas w trade").nextElementSibling).toHaveTextContent(
      "1 godz. 30 min",
    );
  });
});
