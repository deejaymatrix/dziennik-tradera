import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportAccountComparisonTab } from "./ReportAccountComparisonTab";
import type { AccountWithBalance } from "../app/types/account";
import type { AccountComparisonRow, TradeStats } from "../app/types/report";

function konto(id: string, name: string, currency = "USD"): AccountWithBalance {
  return {
    id,
    name,
    description: null,
    account_type: null,
    currency,
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

function karta(etykieta: string): HTMLElement {
  const el = screen.getByText(etykieta).closest("div");
  if (!el) {
    throw new Error(`Brak karty lidera dla etykiety: ${etykieta}`);
  }
  return el;
}

function wiersz(accountId: string, statsOverrides: Partial<TradeStats> = {}): AccountComparisonRow {
  return {
    account_id: accountId,
    stats: statystyki(statsOverrides),
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
 * `ReportAccountComparisonTab` - porównanie kont, statystyki liczone niezależnie per konto.
 * Nieoczywiste rzeczy: (1) tabela i "liderzy" sortują konta wg net_pnl malejąco, nie wg kolejności
 * z propsów; (2) `bestByWinRate`/`bestExpectancy` mają fallback `?? -1`/`?? -Infinity` - konto BEZ
 * danych nigdy nie wygrywa z kontem z realną (nawet zerową) wartością; (3) nazwa konta ma fallback
 * do surowego `account_id`, gdy konto zniknęło z listy `accounts`; (4) wiersz "Łącznie" sumuje przez
 * `sumDecimalStrings` (dokładna arytmetyka), nie przez zwykłe dodawanie liczb zmiennoprzecinkowych -
 * test niżej sprawdza POPRAWNOŚĆ wyniku; przy zaledwie 2 składnikach i zaokrągleniu do 2 miejsc błąd
 * zmiennoprzecinkowy jest zbyt mały, by złapać go mutacją na poziomie wyrenderowanego tekstu (ten sam,
 * ustalony wcześniej limit metodologii co w `ReportYearlyTab`). Dotąd zero testów.
 */
describe("ReportAccountComparisonTab", () => {
  it("rows === null pokazuje Skeleton", () => {
    const { container } = render(<ReportAccountComparisonTab rows={null} accounts={[]} />);
    expect(container.querySelector('[role="presentation"]')).toBeInTheDocument();
  });

  it("rows.length === 0 pokazuje pusty stan 'Brak kont do porównania.'", () => {
    render(<ReportAccountComparisonTab rows={[]} accounts={[]} />);
    expect(screen.getByText("Brak kont do porównania.")).toBeInTheDocument();
  });

  it("tabela i lider 'Najlepsze konto wg P&L' sortują wg net_pnl malejąco, nie wg kolejności propsów", () => {
    render(
      <ReportAccountComparisonTab
        rows={[wiersz("a", { net_pnl: "10" }), wiersz("b", { net_pnl: "90" })]}
        accounts={[konto("a", "Konto A"), konto("b", "Konto B")]}
      />,
    );
    const rows = screen.getAllByRole("row");
    // rows[0] to nagłówek, rows[1] pierwszy wiersz danych - powinien być Konto B (net_pnl 90)
    expect(within(rows[1] as HTMLElement).getByText("Konto B")).toBeInTheDocument();
    expect(within(karta("Najlepsze konto wg P&L")).getByText(/Konto B/)).toBeInTheDocument();
  });

  it("konto BEZ win rate (null) nie wygrywa z kontem z realną wartością 0%", () => {
    render(
      <ReportAccountComparisonTab
        rows={[
          wiersz("a", { net_pnl: "10", win_rate: null }),
          wiersz("b", { net_pnl: "5", win_rate: "0" }),
        ]}
        accounts={[konto("a", "Konto A"), konto("b", "Konto B")]}
      />,
    );
    expect(within(karta("Najwyższy win rate")).getByText(/Konto B/)).toBeInTheDocument();
  });

  it("konto BEZ expectancy (null) nie wygrywa z kontem z realną, nawet ujemną wartością", () => {
    render(
      <ReportAccountComparisonTab
        rows={[
          wiersz("a", { net_pnl: "10", expectancy: null }),
          wiersz("b", { net_pnl: "5", expectancy: "-5" }),
        ]}
        accounts={[konto("a", "Konto A"), konto("b", "Konto B")]}
      />,
    );
    expect(within(karta("Najlepszy śr. wynik/trade")).getByText(/Konto B/)).toBeInTheDocument();
  });

  it("nieznane konto (brak na liście accounts) w tabeli dostaje fallback do account_id", () => {
    render(
      <ReportAccountComparisonTab
        rows={[wiersz("usuniete-konto", { net_pnl: "10" })]}
        accounts={[]}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("usuniete-konto")).toBeInTheDocument();
  });

  it("wiersz 'Łącznie' sumuje net_pnl przez sumDecimalStrings, nie przez zwykłe dodawanie", () => {
    render(
      <ReportAccountComparisonTab
        rows={[wiersz("a", { net_pnl: "0.1" }), wiersz("b", { net_pnl: "0.2" })]}
        accounts={[konto("a", "Konto A"), konto("b", "Konto B")]}
      />,
    );
    const rows = screen.getAllByRole("row");
    const ostatni = rows[rows.length - 1] as HTMLElement;
    expect(within(ostatni).getByText("0.30")).toBeInTheDocument();
  });

  it("dodatni P&L netto w tabeli dostaje klasę profit, ujemny klasę loss", () => {
    render(
      <ReportAccountComparisonTab
        rows={[wiersz("a", { net_pnl: "50" }), wiersz("b", { net_pnl: "-30" })]}
        accounts={[konto("a", "Konto A"), konto("b", "Konto B")]}
      />,
    );
    const zysk = screen.getByText("50,00 USD");
    const strata = screen.getByText("-30,00 USD");
    expect(zysk.className).toMatch(/profit/);
    expect(strata.className).toMatch(/loss/);
  });

  it("podpowiedź o różnych walutach pojawia się tylko, gdy konta mają więcej niż jedną walutę", () => {
    const { rerender } = render(
      <ReportAccountComparisonTab
        rows={[wiersz("a", { net_pnl: "10" })]}
        accounts={[konto("a", "Konto A", "USD")]}
      />,
    );
    expect(screen.queryByText(/różne waluty/)).not.toBeInTheDocument();

    rerender(
      <ReportAccountComparisonTab
        rows={[wiersz("a", { net_pnl: "10" }), wiersz("b", { net_pnl: "5" })]}
        accounts={[konto("a", "Konto A", "USD"), konto("b", "Konto B", "EUR")]}
      />,
    );
    expect(screen.getByText(/różne waluty/)).toBeInTheDocument();
  });
});
