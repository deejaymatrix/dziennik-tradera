import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloseTradeModal } from "./CloseTradeModal";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { Trade } from "../app/types/trade";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

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

function wyrenderuj(trade: Trade | null = transakcja()) {
  const onClose = vi.fn();
  const onClosed = vi.fn();
  render(
    <ToastProvider>
      <CloseTradeModal
        open
        onClose={onClose}
        onClosed={onClosed}
        trade={trade}
        accountCurrency="USD"
      />
    </ToastProvider>,
  );
  return { onClose, onClosed };
}

/**
 * `CloseTradeModal` sprawdza cenę wyjścia DWOMA niezależnymi warstwami: wspólnym
 * `validateTradeFormFormat` (format liczby, dzielony ze zwykłym formularzem transakcji) i
 * WŁASNYM dodatkowym `!exitPrice.trim()` - wspólny walidator celowo POMIJA puste/samo-spacjowe
 * pole (`value.trim() && ...`), bo w zwykłym formularzu cena wyjścia bywa opcjonalna. Przy
 * zamykaniu pozycji jest OBOWIĄZKOWA - stąd druga, niezależna warstwa. Dotąd zero testów.
 */
describe("CloseTradeModal - brak transakcji", () => {
  it("trade === null nic nie renderuje (brak okna dialogowego)", () => {
    render(
      <ToastProvider>
        <CloseTradeModal
          open
          onClose={vi.fn()}
          onClosed={vi.fn()}
          trade={null}
          accountCurrency="USD"
        />
      </ToastProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("CloseTradeModal - walidacja ceny wyjścia", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("same spacje w cenie wyjścia: własny komunikat modalu, NIE wspólnego walidatora", async () => {
    const user = userEvent.setup();
    invokeCommand.mockRejectedValue(new Error("nieoczekiwana komenda"));
    wyrenderuj();

    await user.type(screen.getByLabelText(/^Cena wyjścia/), "   ");
    await user.click(screen.getByRole("button", { name: "Zamknij pozycję" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Podaj cenę wyjścia, aby zamknąć pozycję.");
    expect(invokeCommand).not.toHaveBeenCalledWith("update_trade", expect.anything());
  });

  it("nieliczbowa cena wyjścia: komunikat WSPÓLNEGO walidatora formatu", async () => {
    const user = userEvent.setup();
    invokeCommand.mockRejectedValue(new Error("nieoczekiwana komenda"));
    wyrenderuj();

    await user.type(screen.getByLabelText(/^Cena wyjścia/), "abc");
    await user.click(screen.getByRole("button", { name: "Zamknij pozycję" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Cena wyjścia musi być liczbą (np. 1,23 albo 1.23).",
    );
    expect(invokeCommand).not.toHaveBeenCalledWith("update_trade", expect.anything());
  });
});

describe("CloseTradeModal - wynik zamknięcia", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("powodzenie woła update_trade z id i expectedUpdatedAt, potem onClosed I onClose", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "update_trade") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    const trade = transakcja({ id: "t42", updated_at: "2026-07-10T08:30:00Z" });
    const { onClose, onClosed } = wyrenderuj(trade);

    await user.type(screen.getByLabelText(/^Cena wyjścia/), "1.1050");
    await user.click(screen.getByRole("button", { name: "Zamknij pozycję" }));

    await vi.waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith(
        "update_trade",
        expect.objectContaining({ id: "t42", expectedUpdatedAt: "2026-07-10T08:30:00Z" }),
      ),
    );
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("błąd backendu pokazuje jego komunikat, NIE woła onClosed ani onClose", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "update_trade") {
        return Promise.reject(new Error("Transakcja została zmieniona w międzyczasie."));
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    const { onClose, onClosed } = wyrenderuj();

    await user.type(screen.getByLabelText(/^Cena wyjścia/), "1.1050");
    await user.click(screen.getByRole("button", { name: "Zamknij pozycję" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Transakcja została zmieniona w międzyczasie.",
    );
    expect(onClosed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
