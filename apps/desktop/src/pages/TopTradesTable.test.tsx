import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopTradesTable } from "./TopTradesTable";
import type { TopTradeRow } from "../app/types/report";
import styles from "./BreakdownTable.module.css";

function wiersz(overrides: Partial<TopTradeRow> = {}): TopTradeRow {
  return {
    trade_id: "t1",
    display_number: 1,
    opened_at: "2026-03-05T10:00:00Z",
    instrument_label: "EURUSD",
    strategy_label: "Breakout",
    side: "buy",
    net_pnl: "10.00",
    ...overrides,
  };
}

/**
 * `TopTradesTable` - sekcja "TOP 5" w raporcie miesięcznym. `opened_at` przychodzi z Rusta jako
 * `string | null` (transakcja może nie mieć jeszcze zapisanej daty otwarcia) - brak obsługi `null`
 * wysypałby `new Date(null)` na "Invalid Date" widoczną użytkownikowi zamiast czytelnego "—".
 * Dotąd zero testów.
 */
describe("TopTradesTable", () => {
  it("pusta lista pokazuje komunikat, nie pustą tabelę", () => {
    render(<TopTradesTable rows={[]} currency="USD" />);
    expect(screen.getByText("Brak transakcji.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opened_at === null pokazuje '—' zamiast 'Invalid Date'", () => {
    render(<TopTradesTable rows={[wiersz({ opened_at: null })]} currency="USD" />);
    const wiersze = screen.getAllByRole("row");
    expect(wiersze[1]).toHaveTextContent("—");
    expect(wiersze[1]).not.toHaveTextContent("Invalid Date");
  });

  it("side 'buy' pokazuje 'BUY', 'sell' pokazuje 'SELL'", () => {
    render(
      <TopTradesTable
        rows={[wiersz({ trade_id: "a", side: "buy" }), wiersz({ trade_id: "b", side: "sell" })]}
        currency="USD"
      />,
    );
    const wiersze = screen.getAllByRole("row");
    expect(wiersze[1]).toHaveTextContent("BUY");
    expect(wiersze[2]).toHaveTextContent("SELL");
  });

  it("dodatni net_pnl dostaje klasę profit, ujemny klasę loss", () => {
    render(
      <TopTradesTable
        rows={[
          wiersz({ trade_id: "a", net_pnl: "10.00" }),
          wiersz({ trade_id: "b", net_pnl: "-5.00" }),
        ]}
        currency="USD"
      />,
    );
    const wiersze = screen.getAllByRole("row");
    const wierszZysk = wiersze[1];
    const wierszStrata = wiersze[2];
    if (!wierszZysk || !wierszStrata) {
      throw new Error("brak oczekiwanych wierszy");
    }
    expect(wierszZysk.lastElementChild?.className).toContain(styles.profit);
    expect(wierszStrata.lastElementChild?.className).toContain(styles.loss);
  });
});
