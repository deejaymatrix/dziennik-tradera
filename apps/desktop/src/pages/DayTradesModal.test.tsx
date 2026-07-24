import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayTradesModal } from "./DayTradesModal";
import type { Trade } from "../app/types/trade";

function transakcja(overrides: Partial<Trade>): Trade {
  return {
    id: "1",
    account_id: "konto-1",
    display_number: 1,
    instrument_id: null,
    instrument_spec_snapshot: null,
    strategy_id: null,
    strategy_snapshot: null,
    status: "closed",
    side: "buy",
    opened_at: "2026-07-10T08:00:00Z",
    closed_at: "2026-07-10T09:00:00Z",
    interval_id: null,
    interval: null,
    session: null,
    volume: "1",
    entry_price: "1.1000",
    stop_loss: null,
    take_profit: null,
    exit_price: "1.1050",
    commission: "0",
    swap: "0",
    other_fees: "0",
    conversion_rate: null,
    gross_pnl: "50",
    net_pnl: "50",
    pnl_points: "50",
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
    created_at: "2026-07-10T09:00:00Z",
    updated_at: "2026-07-10T09:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

/**
 * O2 redesignu (Blok O) wymaga, żeby kierunek transakcji NIGDY nie polegał wyłącznie na
 * kolorze odznaki (WCAG 1.4.1) - `TRADE_SIDE_LABELS` musi renderować się jako widoczny TEKST
 * obok koloru. To wymaganie nie miało dotąd żadnego testu jednostkowego pilnującego, że tekst
 * faktycznie trafia na ekran, nie tylko że stała `TRADE_SIDE_LABELS` istnieje w kodzie.
 */
describe("DayTradesModal - kierunek transakcji ma jawny tekst, nie tylko kolor (O2)", () => {
  it("BUY i SELL renderują się jako widoczny tekst 'BUY'/'SELL', nie tylko kolorowa odznaka", () => {
    render(
      <DayTradesModal
        dateLabel="10 lipca 2026"
        currency="USD"
        onClose={() => undefined}
        trades={[transakcja({ id: "1", side: "buy" }), transakcja({ id: "2", side: "sell" })]}
      />,
    );

    expect(screen.getByText("BUY")).toBeInTheDocument();
    expect(screen.getByText("SELL")).toBeInTheDocument();
  });
});
