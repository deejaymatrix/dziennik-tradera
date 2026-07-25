import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsystentAiPage } from "./AsystentAiPage";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AccountWithBalance } from "../app/types/account";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

function konto(over: Partial<AccountWithBalance> = {}): AccountWithBalance {
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
    ...over,
  };
}

const MODEL_GOTOWY = {
  gotowy: true,
  wlaczony: true,
  etykieta: "Qwen 7B",
  rozmiar_bajtow: 4_700_000_000,
};

// Hub montuje też panele-dzieci, które same odpytują backend - dajemy sensowne domyślne odpowiedzi,
// a `list_accounts` sterujemy per test.
function nastaw(konta: AccountWithBalance[]): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "ai_model_status") return Promise.resolve(MODEL_GOTOWY);
    if (cmd === "list_accounts") return Promise.resolve(konta);
    if (cmd === "ai_analysis_history") return Promise.resolve([]);
    if (cmd === "get_filtered_report")
      return Promise.resolve({ stats: { total_trades: 10, closed_trades: 10 } });
    return Promise.resolve(null);
  });
}

function wyrenderuj(): void {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <AsystentAiPage />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("AsystentAiPage", () => {
  it("model gotowy bez kont: pokazuje stan modelu i prośbę o dodanie konta", async () => {
    nastaw([]);
    wyrenderuj();

    expect(await screen.findByText(/jest pobrany i gotowy/)).toBeInTheDocument();
    expect(await screen.findByText(/Dodaj najpierw konto/)).toBeInTheDocument();
    // Bez kont nie ma selektora konta.
    expect(screen.queryByRole("combobox", { name: "Konto" })).not.toBeInTheDocument();
  });

  it("z kontem: pokazuje selektor konta z wybraną pozycją", async () => {
    nastaw([konto()]);
    wyrenderuj();

    const wybor = await screen.findByRole("combobox", { name: "Konto" });
    expect(wybor).toBeInTheDocument();
    // Konto trafia do opcji jako "nazwa (waluta)".
    expect(screen.getByRole("option", { name: "Konto główne (USD)" })).toBeInTheDocument();
    // Przy włączonym AI hubowego banera o wyłączeniu nie ma.
    expect(screen.queryByText(/Analizy i czat są niedostępne/)).not.toBeInTheDocument();
  });

  it("wyłączony AI: hub pokazuje baner o wyłączeniu (mimo pobranego modelu)", async () => {
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "ai_model_status")
        return Promise.resolve({
          gotowy: true,
          wlaczony: false,
          etykieta: "Qwen 7B",
          rozmiar_bajtow: 4_700_000_000,
        });
      if (cmd === "list_accounts") return Promise.resolve([konto()]);
      if (cmd === "ai_analysis_history") return Promise.resolve([]);
      if (cmd === "get_filtered_report")
        return Promise.resolve({ stats: { total_trades: 10, closed_trades: 10 } });
      return Promise.resolve(null);
    });
    wyrenderuj();

    expect(await screen.findByText(/Analizy i czat są niedostępne/)).toBeInTheDocument();
  });
});
