import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TradeInspector } from "./TradeInspector";
import styles from "./TradeInspector.module.css";
import type { Trade } from "../app/types/trade";

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

function wyrenderuj(trade: Trade, overrides: Partial<Parameters<typeof TradeInspector>[0]> = {}) {
  render(
    <TradeInspector
      trade={trade}
      currency="USD"
      pinned={false}
      onTogglePin={vi.fn()}
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onOpenFull={vi.fn()}
      {...overrides}
    />,
  );
}

/**
 * `TradeInspector` - panel szczegółów obok tabeli (model Split View + Inspector), tylko do
 * odczytu. Nieoczywiste reguły: (1) `Row` chowa CAŁY wiersz (etykieta + wartość), gdy wartość jest
 * `null` LUB pustym stringiem - inaczej lista pęczniałaby od pustych "Interwał: " dla każdej
 * transakcji bez interwału; (2) sekcja "Częściowe zamknięcia" i "Notatki" renderują się TYLKO gdy
 * jest co pokazać; (3) "Edytuj" jest wyłączony dla transakcji z ustawionym `deleted_at` (w koszu) -
 * wciąż widoczna w podglądzie, ale nieedytowalna. Dotąd zero testów.
 */
describe("TradeInspector", () => {
  it("wynik null pokazuje 'Brak danych' bez klasy profit/loss", () => {
    wyrenderuj(transakcja({ net_pnl: null }));
    const wynik = screen.getByText("Brak danych");
    expect(wynik.className).not.toContain(styles.profit);
    expect(wynik.className).not.toContain(styles.loss);
  });

  it("dodatni wynik dostaje klasę profit, ujemny klasę loss", () => {
    const { unmount } = render(
      <TradeInspector
        trade={transakcja({ net_pnl: "50.00" })}
        currency="USD"
        pinned={false}
        onTogglePin={vi.fn()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onOpenFull={vi.fn()}
      />,
    );
    expect(screen.getByText("+50,00 USD").className).toContain(styles.profit);
    unmount();
    wyrenderuj(transakcja({ net_pnl: "-50.00" }));
    expect(screen.getByText("-50,00 USD").className).toContain(styles.loss);
  });

  it("pole bez danych (Interwał null) NIE pokazuje wiersza, pole z danymi pokazuje", () => {
    wyrenderuj(transakcja({ interval: null, session: "Londyn" }));
    expect(screen.queryByText("Interwał")).not.toBeInTheDocument();
    expect(screen.getByText("Sesja")).toBeInTheDocument();
    expect(screen.getByText("Londyn")).toBeInTheDocument();
  });

  it("pusty string (nie null) też chowa wiersz", () => {
    wyrenderuj(transakcja({ interval: "" }));
    expect(screen.queryByText("Interwał")).not.toBeInTheDocument();
  });

  it("brak częściowych zamknięć - sekcja nie renderuje się wcale", () => {
    wyrenderuj(transakcja({ partial_closes: [] }));
    expect(screen.queryByText(/Częściowe zamknięcia/)).not.toBeInTheDocument();
  });

  it("częściowe zamknięcia obecne - sekcja pokazuje liczbę w nagłówku", () => {
    wyrenderuj(
      transakcja({
        partial_closes: [{ closed_volume: "0.5", realized_pnl: "10.00" }],
      }),
    );
    expect(screen.getByText("Częściowe zamknięcia (1)")).toBeInTheDocument();
  });

  it("brak notatek (plan_before i conclusion oba null) - sekcja Notatki nie renderuje się", () => {
    wyrenderuj(transakcja({ plan_before: null, conclusion: null }));
    expect(screen.queryByText("Notatki")).not.toBeInTheDocument();
  });

  it("sama jedna notatka (conclusion) wystarczy, by pokazać sekcję Notatki", () => {
    wyrenderuj(transakcja({ plan_before: null, conclusion: "Trzymałem za długo." }));
    expect(screen.getByText("Notatki")).toBeInTheDocument();
    expect(screen.getByText("Trzymałem za długo.")).toBeInTheDocument();
  });

  it("Edytuj jest wyłączony dla transakcji usuniętej (deleted_at ustawiony)", () => {
    wyrenderuj(transakcja({ deleted_at: "2026-07-11T00:00:00Z" }));
    expect(screen.getByRole("button", { name: /Edytuj/ })).toBeDisabled();
  });

  it("Edytuj jest aktywny dla transakcji NIE usuniętej", () => {
    wyrenderuj(transakcja({ deleted_at: null }));
    expect(screen.getByRole("button", { name: /Edytuj/ })).not.toBeDisabled();
  });
});
