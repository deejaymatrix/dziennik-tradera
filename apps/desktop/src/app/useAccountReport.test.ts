import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccountReport } from "./useAccountReport";
import type { AccountWithBalance } from "./types/account";
import type { AccountReport } from "./types/report";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("./invokeCommand", () => ({ invokeCommand }));

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

function raport(netPnl: string): AccountReport {
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
      net_pnl: netPnl,
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
    calendar: [],
    by_strategy: [],
    by_instrument: [],
  };
}

/**
 * `useAccountReport` to wspólny przepływ "wybierz konto → pobierz raport", używany przez
 * Kalendarz (docelowo też Dashboard/Raporty, patrz komentarz w źródle). Dotąd zero testów.
 * Najbardziej nieoczywista część: `loadAccounts()` po ponownym wczytaniu NIE resetuje wyboru
 * użytkownika do pierwszego konta na liście - `current || (data[0]?.id ?? "")` zachowuje już
 * wybrane konto. Błąd tu (np. zawsze branie `data[0]`) cofnąłby użytkownika na inne konto po
 * każdym odświeżeniu listy - klasyczna, irytująca regresja UX.
 */
describe("useAccountReport", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("po starcie ładuje konta i automatycznie zaznacza PIERWSZE, gdy nic nie było wybrane", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_accounts") {
        return Promise.resolve([konto("a"), konto("b")]);
      }
      return Promise.resolve(raport("100"));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.selectedAccountId).toBe("a"));
    expect(result.current.accounts).toEqual([konto("a"), konto("b")]);
    expect(invokeCommand).toHaveBeenCalledWith("list_accounts", { includeArchived: false });
  });

  it("po wybraniu konta pobiera jego raport przez get_account_report", async () => {
    invokeCommand.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "list_accounts") {
        return Promise.resolve([konto("a"), konto("b")]);
      }
      if (command === "get_account_report") {
        return Promise.resolve(raport(args?.accountId === "b" ? "200" : "100"));
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.report?.stats.net_pnl).toBe("100"));

    act(() => {
      result.current.setSelectedAccountId("b");
    });
    await waitFor(() => expect(result.current.report?.stats.net_pnl).toBe("200"));
    expect(result.current.selectedAccount?.id).toBe("b");
  });

  it("reloadAccounts() NIE cofa już wybranego konta z powrotem na pierwsze z listy", async () => {
    invokeCommand.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "list_accounts") {
        return Promise.resolve([konto("a"), konto("b")]);
      }
      return Promise.resolve(raport(args?.accountId === "b" ? "200" : "100"));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.selectedAccountId).toBe("a"));

    act(() => {
      result.current.setSelectedAccountId("b");
    });
    await waitFor(() => expect(result.current.selectedAccountId).toBe("b"));

    await act(async () => {
      await result.current.reloadAccounts();
    });
    expect(result.current.selectedAccountId).toBe("b");
  });

  it("błąd list_accounts ustawia accountsError, nie rusza reportError", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_accounts") {
        return Promise.reject(new Error("Baza niedostępna."));
      }
      return Promise.resolve(raport("0"));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.accountsError).toBe("Baza niedostępna."));
    expect(result.current.accounts).toBeNull();
    expect(result.current.reportError).toBeNull();
  });

  it("błąd który NIE jest instancją Error dostaje domyślny komunikat po polsku", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_accounts") {
        // Celowo odrzucenie NIE-instancją Error - to właśnie ta gałąź jest testowana.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject("zwykły string, nie Error");
      }
      return Promise.resolve(raport("0"));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.accountsError).toBe("Wystąpił nieoczekiwany błąd."));
  });

  it("błąd get_account_report ustawia reportError, nie rusza accountsError ani listy kont", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_accounts") {
        return Promise.resolve([konto("a")]);
      }
      return Promise.reject(new Error("Raport nieosiągalny."));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.reportError).toBe("Raport nieosiągalny."));
    expect(result.current.accountsError).toBeNull();
    expect(result.current.accounts).toEqual([konto("a")]);
  });

  it("ustawienie pustego selectedAccountId czyści report bez wywołania komendy", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_accounts") {
        return Promise.resolve([konto("a")]);
      }
      return Promise.resolve(raport("100"));
    });

    const { result } = renderHook(() => useAccountReport());
    await waitFor(() => expect(result.current.report).not.toBeNull());

    invokeCommand.mockClear();
    act(() => {
      result.current.setSelectedAccountId("");
    });
    await waitFor(() => expect(result.current.report).toBeNull());
    expect(invokeCommand).not.toHaveBeenCalledWith("get_account_report", expect.anything());
  });
});
