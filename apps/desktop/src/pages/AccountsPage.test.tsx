import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountsPage } from "./AccountsPage";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AccountWithBalance } from "../app/types/account";

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

/**
 * `AccountFormModal` jest zamontowany ZAWSZE (nawet gdy `open={false}`) i sam wywołuje
 * `list_broker_templates` przy montowaniu - `invokeCommand` jest jedną, współdzieloną komendą,
 * więc trzeba ją rozróżniać po nazwie, inaczej odpowiedź przeznaczona dla `list_accounts` trafia
 * do niewłaściwego wywołania (i odwrotnie), co objawia się losowym `accounts === undefined`.
 */
function nastawKomendy(listAccounts: () => Promise<AccountWithBalance[]>): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "list_broker_templates") return Promise.resolve([]);
    if (command === "list_accounts") return listAccounts();
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <AccountsPage />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

/**
 * `AccountsPage` - lista kont z filtrem "Pokaż zarchiwizowane" i akcjami archiwizacji. Nieoczywiste
 * rzeczy: (1) przełączenie filtra wywołuje `list_accounts` PONOWNIE z nową wartością
 * `includeArchived` (efekt zależny od stanu filtra, nie renderowanie pochodne); (2) przycisk
 * archiwizacji/przywracania i odznaka statusu zależą od `archived_at` - konto zarchiwizowane NIGDY
 * nie pokazuje obu przycisków naraz. Dotąd zero testów.
 */
describe("AccountsPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pusta lista kont pokazuje EmptyState, nie tabelę", async () => {
    nastawKomendy(() => Promise.resolve([]));
    wyrenderuj();
    expect(await screen.findByText("Brak kont")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("błąd wczytywania pokazuje ErrorState z komunikatem, 'Spróbuj ponownie' woła list_accounts ponownie", async () => {
    const user = userEvent.setup();
    let liczbaWywolan = 0;
    nastawKomendy(() => {
      liczbaWywolan += 1;
      return liczbaWywolan === 1
        ? Promise.reject(new Error("Baza danych niedostępna."))
        : Promise.resolve([]);
    });
    wyrenderuj();
    expect(await screen.findByText("Baza danych niedostępna.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText("Brak kont")).toBeInTheDocument();
  });

  it("przełączenie 'Pokaż zarchiwizowane' woła list_accounts z includeArchived: true", async () => {
    const user = userEvent.setup();
    nastawKomendy(() => Promise.resolve([konto()]));
    wyrenderuj();
    await screen.findByText("Konto główne");
    invokeCommand.mockClear();

    await user.click(screen.getByRole("switch", { name: "Pokaż zarchiwizowane" }));
    await waitFor(() => {
      expect(invokeCommand).toHaveBeenCalledWith("list_accounts", { includeArchived: true });
    });
  });

  it("konto aktywne pokazuje odznakę 'Aktywne' i przycisk 'Archiwizuj', nie 'Przywróć'", async () => {
    nastawKomendy(() => Promise.resolve([konto({ archived_at: null })]));
    wyrenderuj();
    await screen.findByText("Konto główne");
    expect(screen.getByText("Aktywne")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Archiwizuj/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Przywróć/ })).not.toBeInTheDocument();
  });

  it("konto zarchiwizowane pokazuje odznakę 'Zarchiwizowane' i przycisk 'Przywróć', nie 'Archiwizuj'", async () => {
    nastawKomendy(() => Promise.resolve([konto({ archived_at: "2026-02-01T00:00:00Z" })]));
    wyrenderuj();
    await screen.findByText("Konto główne");
    expect(screen.getByText("Zarchiwizowane")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Przywróć/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Archiwizuj/ })).not.toBeInTheDocument();
  });
});
