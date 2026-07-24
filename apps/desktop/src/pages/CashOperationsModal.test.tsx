import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CashOperationsModal } from "./CashOperationsModal";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AccountWithBalance } from "../app/types/account";
import type { NewCashOperationInput } from "../app/types/cashOperation";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function konto(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
  return {
    id: "konto-1",
    name: "Konto główne",
    description: null,
    account_type: null,
    currency: "USD",
    initial_balance: "1000.00",
    template_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    balance: "1000.00",
    ...overrides,
  };
}

function zapisaneInput(): NewCashOperationInput {
  const wywolanie = invokeCommand.mock.calls.find(
    (call: unknown[]) => call[0] === "create_cash_operation",
  ) as [string, { input: NewCashOperationInput }] | undefined;
  if (!wywolanie) {
    throw new Error("create_cash_operation nie zostało wywołane");
  }
  return wywolanie[1].input;
}

function wyrenderuj(account: AccountWithBalance | null = konto()) {
  const onClose = vi.fn();
  const onOperationAdded = vi.fn();
  render(
    <ToastProvider>
      <CashOperationsModal
        open
        onClose={onClose}
        account={account}
        onOperationAdded={onOperationAdded}
      />
    </ToastProvider>,
  );
  return { onClose, onOperationAdded };
}

/**
 * `CashOperationsModal` zapisuje wpłaty/wypłaty/korekty na koncie - bezpośrednio wpływa na
 * saldo. Nieoczywista część: notatka idzie do bazy BEZ przycięcia białych znaków, mimo że
 * decyzja "czy w ogóle wysłać, czy null" opiera się na `note.trim()` - `note.trim() ? note :
 * null` wysyła ORYGINALNY `note`, nie przycięty. Naiwny refaktor mógłby to "poprawić" na
 * `note.trim()`, cicho zmieniając zapisywane dane. Dotąd zero testów.
 */
describe("CashOperationsModal - brak konta", () => {
  it("account === null nic nie renderuje (brak okna dialogowego)", () => {
    invokeCommand.mockResolvedValue([]);
    render(
      <ToastProvider>
        <CashOperationsModal open onClose={vi.fn()} account={null} onOperationAdded={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("CashOperationsModal - walidacja kwoty", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("nieprawidłowa kwota pokazuje błąd, NIE woła create_cash_operation", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue([]);
    wyrenderuj();

    await user.type(screen.getByLabelText(/^Kwota/), "nie liczba");
    await user.click(screen.getByRole("button", { name: "Dodaj operację" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kwota musi być liczbą (np. 100 albo 100,50, dla korekty można poprzedzić znakiem -).",
    );
    expect(invokeCommand).not.toHaveBeenCalledWith("create_cash_operation", expect.anything());
  });
});

describe("CashOperationsModal - normalizacja i notatka", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("kwota z przecinkiem zapisuje się znormalizowana kropką", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_cash_operations") {
        return Promise.resolve([]);
      }
      if (cmd === "create_cash_operation") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await user.type(screen.getByLabelText(/^Kwota/), "100,50");
    await user.click(screen.getByRole("button", { name: "Dodaj operację" }));

    await vi.waitFor(() => expect(zapisaneInput().amount).toBe("100.50"));
  });

  it("notatka z samych spacji zapisuje się jako null, nie pusty string", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_cash_operations") {
        return Promise.resolve([]);
      }
      if (cmd === "create_cash_operation") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await user.type(screen.getByLabelText(/^Kwota/), "50");
    await user.type(screen.getByLabelText("Notatka (opcjonalnie)"), "   ");
    await user.click(screen.getByRole("button", { name: "Dodaj operację" }));

    await vi.waitFor(() => expect(zapisaneInput().note).toBeNull());
  });

  it("niepusta notatka zapisuje się BEZ przycięcia otaczających spacji", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_cash_operations") {
        return Promise.resolve([]);
      }
      if (cmd === "create_cash_operation") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await user.type(screen.getByLabelText(/^Kwota/), "50");
    await user.type(screen.getByLabelText("Notatka (opcjonalnie)"), "  premia  ");
    await user.click(screen.getByRole("button", { name: "Dodaj operację" }));

    await vi.waitFor(() => expect(zapisaneInput().note).toBe("  premia  "));
  });
});

describe("CashOperationsModal - powodzenie zapisu", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("po zapisie czyści pola kwoty i notatki, woła onOperationAdded", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_cash_operations") {
        return Promise.resolve([]);
      }
      if (cmd === "create_cash_operation") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    const { onOperationAdded } = wyrenderuj();

    await user.type(screen.getByLabelText(/^Kwota/), "50");
    await user.type(screen.getByLabelText("Notatka (opcjonalnie)"), "premia");
    await user.click(screen.getByRole("button", { name: "Dodaj operację" }));

    await vi.waitFor(() => expect(onOperationAdded).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(/^Kwota/)).toHaveValue("");
    expect(screen.getByLabelText("Notatka (opcjonalnie)")).toHaveValue("");
  });
});
