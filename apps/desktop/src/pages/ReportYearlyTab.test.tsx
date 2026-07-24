import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportYearlyTab } from "./ReportYearlyTab";
import type { FilteredReport, GroupBreakdown, TradeStats } from "../app/types/report";

function miesiac(
  key: string,
  label: string,
  netPnl: string,
  overrides: Partial<GroupBreakdown> = {},
): GroupBreakdown {
  return {
    key,
    label,
    trade_count: 1,
    win_count: 1,
    loss_count: 0,
    win_rate: "100",
    net_pnl: netPnl,
    ...overrides,
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
 * `ReportYearlyTab` - czysty komponent prezentacyjny, bez własnych efektów/komend. Trzy
 * nieoczywiste rzeczy: (1) "Śr. miesięczny P&L" sumuje DOKŁADNIE (`sumDecimalStrings`, BigInt) i
 * DOPIERO POTEM dzieli przez 12 - ten sam wzorzec co `MonthCalendarTable`/`computeCumulativeSeries`,
 * choć przy zaledwie 12 składnikach i zaokrągleniu do 2 miejsc błąd zmiennoprzecinkowy jest zbyt mały,
 * żeby dało się go złapać mutacją na poziomie wyrenderowanego tekstu - test niżej sprawdza
 * POPRAWNOŚĆ wyniku, nie samą kolejność operacji; (2) miesiąc z `net_pnl` DOKŁADNIE "0" liczy się
 * jako "bez wyniku" (`flatMonths`), nie jako dodatni ani ujemny; (3) `highestWinRateOf` używa
 * fallbacku `?? -1` dla `null` win_rate - miesiąc BEZ danych o win rate nigdy nie wygrywa z
 * miesiącem z realną wartością, nawet 0%. Dotąd zero testów.
 */
describe("ReportYearlyTab", () => {
  it("Śr. miesięczny P&L liczy DOKŁADNIE (0,1+0,2+0,1 = 0,4), nie przez błąd zmiennoprzecinkowy", () => {
    render(
      <ReportYearlyTab
        report={raport({
          calendar_months: [
            miesiac("2026-01", "Styczeń", "0.1"),
            miesiac("2026-02", "Luty", "0.2"),
            miesiac("2026-03", "Marzec", "0.1"),
          ],
        })}
        currency="USD"
        year="2026"
      />,
    );
    // Suma dokładna to 0,4 USD; 0,4 / 12 = 0,0333... - Intl.NumberFormat obcina do 2 miejsc.
    expect(screen.getByText("Śr. miesięczny P&L").nextElementSibling).toHaveTextContent("0,03 USD");
  });

  it("miesiąc z net_pnl DOKŁADNIE '0' liczy się jako 'bez wyniku', nie dodatni ani ujemny", () => {
    render(
      <ReportYearlyTab
        report={raport({
          calendar_months: [
            miesiac("2026-01", "Styczeń", "50"),
            miesiac("2026-02", "Luty", "-20"),
            miesiac("2026-03", "Marzec", "0"),
          ],
        })}
        currency="USD"
        year="2026"
      />,
    );
    expect(screen.getByText("Miesiące dodatnie").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Miesiące ujemne").nextElementSibling).toHaveTextContent("1");
  });

  it("najlepszy/najgorszy miesiąc wybiera skrajne net_pnl, nie pierwszy/ostatni wpis", () => {
    render(
      <ReportYearlyTab
        report={raport({
          calendar_months: [
            miesiac("2026-01", "Styczeń", "-30"),
            miesiac("2026-02", "Luty", "90"),
            miesiac("2026-03", "Marzec", "10"),
          ],
        })}
        currency="USD"
        year="2026"
      />,
    );
    expect(screen.getByText("Najlepszy miesiąc").nextElementSibling).toHaveTextContent(
      "Luty · 90,00 USD",
    );
    expect(screen.getByText("Najgorszy miesiąc").nextElementSibling).toHaveTextContent(
      "Styczeń · -30,00 USD",
    );
  });

  it("najaktywniejszy/najspokojniejszy miesiąc wybiera skrajną liczbę transakcji", () => {
    render(
      <ReportYearlyTab
        report={raport({
          calendar_months: [
            miesiac("2026-01", "Styczeń", "10", { trade_count: 3 }),
            miesiac("2026-02", "Luty", "10", { trade_count: 20 }),
            miesiac("2026-03", "Marzec", "10", { trade_count: 1 }),
          ],
        })}
        currency="USD"
        year="2026"
      />,
    );
    expect(screen.getByText("Najaktywniejszy miesiąc").nextElementSibling).toHaveTextContent(
      "Luty (20)",
    );
    expect(screen.getByText("Najspokojniejszy miesiąc").nextElementSibling).toHaveTextContent(
      "Marzec (1)",
    );
  });

  it("miesiąc BEZ danych o win rate (null) NIE wygrywa z miesiącem z realną wartością (0%)", () => {
    render(
      <ReportYearlyTab
        report={raport({
          calendar_months: [
            miesiac("2026-01", "Styczeń", "10", { win_rate: null }),
            miesiac("2026-02", "Luty", "10", { win_rate: "0" }),
          ],
        })}
        currency="USD"
        year="2026"
      />,
    );
    expect(screen.getByText("Najwyższy win rate (miesiąc)").nextElementSibling).toHaveTextContent(
      "Luty · 0.00%",
    );
  });

  it("karta 'zrealizowane na pozycjach otwartych' ukryta, gdy partially_closed_trades === 0", () => {
    render(
      <ReportYearlyTab
        report={raport({ stats: statystyki({ partially_closed_trades: 0 }) })}
        currency="USD"
        year="2026"
      />,
    );
    expect(screen.queryByText(/Zrealizowane na pozycjach otwartych/)).not.toBeInTheDocument();
  });
});
