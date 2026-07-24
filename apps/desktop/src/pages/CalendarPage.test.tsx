import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPage } from "./CalendarPage";
import type { AccountWithBalance } from "../app/types/account";
import type { AccountReport, DailyPnl } from "../app/types/report";
import type { Trade } from "../app/types/trade";

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

function dzien(date: string, netPnl: string): DailyPnl {
  return { date, net_pnl: netPnl, trade_count: 1, win_count: 1, loss_count: 0 };
}

function raport(calendar: DailyPnl[]): AccountReport {
  return {
    stats: {
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
    },
    equity_curve: [],
    calendar,
    by_strategy: [],
    by_instrument: [],
  };
}

function transakcja(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "1",
    account_id: "a",
    display_number: 1,
    instrument_id: null,
    instrument_spec_snapshot: null,
    strategy_id: null,
    strategy_snapshot: null,
    status: "closed",
    side: "buy",
    opened_at: "2026-03-04T08:00:00",
    closed_at: "2026-03-05T10:00:00",
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
    created_at: "2026-03-04T08:00:00",
    updated_at: "2026-03-05T10:00:00",
    deleted_at: null,
    ...overrides,
  };
}

function nastawKomendy(handlers: {
  accounts?: () => Promise<AccountWithBalance[]>;
  report?: () => Promise<AccountReport>;
  trades?: () => Promise<Trade[]>;
}): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "list_accounts") {
      return (handlers.accounts ?? (() => Promise.resolve([konto("a")])))();
    }
    if (command === "get_account_report") {
      return (handlers.report ?? (() => Promise.resolve(raport([]))))();
    }
    if (command === "list_trades") {
      return (handlers.trades ?? (() => Promise.resolve([])))();
    }
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(<CalendarPage />);
}

/**
 * `CalendarPage` - siatka miesiąca z wynikiem dnia, klik w dzień otwiera podgląd transakcji.
 * Zegar systemowy przypięty na 1 marca 2026 (niedziela) - `leadingBlanks` w `buildMonthGrid`
 * zależy od dnia tygodnia, więc test musi znać dokładny dzień startu miesiąca, żeby policzyć
 * oczekiwaną liczbę pustych komórek na początku siatki (tydzień zaczyna się w poniedziałek).
 * Nieoczywiste rzeczy: (1) dzień bez żadnych zamkniętych transakcji NIE jest klikalny wcale
 * (brak `role="button"`), nie tylko wizualnie wyszarzony; (2) grupowanie transakcji do podglądu
 * dnia dzieje się po LOKALNEJ dacie `closed_at`, a transakcje bez `closed_at` (otwarte/szkice) są
 * pomijane całkowicie - inaczej podgląd dnia pokazywałby transakcje, które nigdy się nie zamknęły.
 * Dotąd zero testów.
 */
describe("CalendarPage", () => {
  beforeEach(() => {
    // Świadomie BEZ `vi.useFakeTimers()` - `findByText`/`waitFor` z testing-library polegają na
    // prawdziwych timerach; samo `setSystemTime` przypina zegar (Date/Date.now), nie ruszając
    // setTimeout, więc asynchroniczne zapytania nadal działają.
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    invokeCommand.mockReset();
  });

  it("marzec 2026 (start w niedzielę) ma 6 pustych komórek przed dniem 1", async () => {
    nastawKomendy({ report: () => Promise.resolve(raport([])) });
    wyrenderuj();
    const jedynka = await screen.findByText("1");
    const siatka = jedynka.parentElement?.parentElement;
    if (!siatka) {
      throw new Error("brak siatki kalendarza");
    }
    const dzieciPrzedJedynka: Element[] = [];
    for (const child of Array.from(siatka.children)) {
      if (child === jedynka.parentElement) {
        break;
      }
      dzieciPrzedJedynka.push(child);
    }
    // Pierwsze 7 dzieci siatki to etykiety dni tygodnia (Pon..Nd), dopiero potem puste komórki.
    expect(dzieciPrzedJedynka.length - 7).toBe(6);
  });

  it("dzień bez transakcji NIE jest klikalny (brak role=button), dzień z wynikiem jest", async () => {
    nastawKomendy({ report: () => Promise.resolve(raport([dzien("2026-03-05", "50")])) });
    wyrenderuj();
    // Świadomie `findByRole` (nie `findByText` na nagłówku miesiąca) - nagłówek renderuje się
    // NATYCHMIAST niezależnie od stanu raportu, więc czekanie na niego nie gwarantuje, że siatka
    // dni (zależna od `report !== null`) już się wyrenderowała - realny wyścig, złapany przy
    // pisaniu tego testu.
    expect(
      await screen.findByRole("button", { name: /Zobacz transakcje: 5 Marzec 2026/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Zobacz transakcje: 6 Marzec 2026/ }),
    ).not.toBeInTheDocument();
  });

  it("dzień z dodatnim wynikiem dostaje klasę zysku, z ujemnym klasę straty", async () => {
    nastawKomendy({
      report: () =>
        Promise.resolve(raport([dzien("2026-03-05", "50"), dzien("2026-03-06", "-20")])),
    });
    wyrenderuj();
    const dzien5 = await screen.findByRole("button", {
      name: /Zobacz transakcje: 5 Marzec 2026/,
    });
    const dzien6 = screen.getByRole("button", { name: /Zobacz transakcje: 6 Marzec 2026/ });
    expect(dzien5.className).toContain("profitDay");
    expect(dzien6.className).toContain("lossDay");
  });

  it("klik w dzień pokazuje TYLKO transakcje zamknięte lokalnie tego dnia, pomija otwarte", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      report: () => Promise.resolve(raport([dzien("2026-03-05", "50")])),
      trades: () =>
        Promise.resolve([
          transakcja({ id: "a", closed_at: "2026-03-05T23:00:00" }),
          transakcja({ id: "b", closed_at: "2026-03-06T01:00:00" }),
          // "c" jest wciąż otwarta (closed_at===null), ale otwarta W TYM SAMYM dniu, co "a" się
          // zamknęła - świadomie, żeby test faktycznie łapał pominięcie warunku `!trade.closed_at`
          // (bez tego "c" trafiłaby błędnie do tej samej grupy dnia 5, bo `opened_at` przypada na
          // ten sam dzień).
          transakcja({
            id: "c",
            closed_at: null,
            status: "open",
            opened_at: "2026-03-05T12:00:00",
          }),
        ]),
    });
    wyrenderuj();
    await user.click(
      await screen.findByRole("button", { name: /Zobacz transakcje: 5 Marzec 2026/ }),
    );
    expect(await screen.findByText("Transakcje - 5 Marzec 2026")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("zmiana miesiąca zamyka otwarty podgląd dnia", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      report: () => Promise.resolve(raport([dzien("2026-03-05", "50")])),
      trades: () => Promise.resolve([transakcja({ id: "a", closed_at: "2026-03-05T23:00:00" })]),
    });
    wyrenderuj();
    await user.click(
      await screen.findByRole("button", { name: /Zobacz transakcje: 5 Marzec 2026/ }),
    );
    expect(await screen.findByText("Transakcje - 5 Marzec 2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Następny miesiąc" }));
    await screen.findByText("Kwiecień 2026");
    expect(screen.queryByText("Transakcje - 5 Marzec 2026")).not.toBeInTheDocument();
  });
});
