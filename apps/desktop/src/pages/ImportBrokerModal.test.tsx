import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportBrokerModal } from "./ImportBrokerModal";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { BrokerTemplate } from "../app/types/instrument";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

const open = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

function szablon(overrides: Partial<BrokerTemplate> = {}): BrokerTemplate {
  return {
    id: "t1",
    name: "IC Markets RAW",
    broker_name: "IC Markets RAW",
    account_type: null,
    source: "user_created",
    import_format_version: null,
    account_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    instrument_count: 0,
    ...overrides,
  };
}

function wiersz(symbol: string, variant = "STANDARD") {
  return {
    source_symbol: symbol,
    display_symbol: symbol,
    canonical_symbol: symbol,
    variant,
    currency_profit: "USD",
    contract_size: "100000",
  };
}

function wyrenderuj(onImported = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ImportBrokerModal template={szablon()} onClose={onClose} onImported={onImported} />
    </ToastProvider>,
  );
  return { onClose, onImported };
}

/**
 * `ImportBrokerModal` pokazuje podgląd CSV przed importem. Dwie łatwe do przeoczenia granice:
 * (1) anulowanie natywnego okna wyboru pliku musi zostawić modal w spoczynku, bez wywołania
 * `preview_broker_import` - inaczej podgląd próbowałby się wczytać dla `null`/nieistniejącej
 * ścieżki; (2) tabela podglądu obcina się na 50 wierszach z licznikiem reszty - błąd o jeden w
 * tę czy w drugą stronę jest klasyczny i niewidoczny bez testu na DOKŁADNIE granicznej liczbie.
 * Dotąd zero testów.
 */
describe("ImportBrokerModal - anulowanie wyboru pliku", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("anulowanie natywnego okna (null) NIE woła preview_broker_import, nie pokazuje podglądu", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue(null);
    wyrenderuj();

    await user.click(screen.getByRole("button", { name: "Wybierz plik CSV" }));

    expect(invokeCommand).not.toHaveBeenCalled();
    expect(screen.queryByText(/Rozpoznano/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importuj" })).toBeDisabled();
  });
});

describe("ImportBrokerModal - nazwa pliku z pełnej ścieżki", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("ścieżka Windows (backslash): pokazuje samą nazwę pliku", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\Users\\test\\Pulpit\\instrumenty.csv");
    invokeCommand.mockResolvedValue({ row_count: 1, rows: [wiersz("EURUSD")], warnings: [] });
    wyrenderuj();

    await user.click(screen.getByRole("button", { name: "Wybierz plik CSV" }));

    expect(await screen.findByText("instrumenty.csv")).toBeInTheDocument();
  });

  it("ścieżka Unix (forward slash): pokazuje samą nazwę pliku", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("/home/test/instrumenty.csv");
    invokeCommand.mockResolvedValue({ row_count: 1, rows: [wiersz("EURUSD")], warnings: [] });
    wyrenderuj();

    await user.click(screen.getByRole("button", { name: "Wybierz plik CSV" }));

    expect(await screen.findByText("instrumenty.csv")).toBeInTheDocument();
  });
});

describe("ImportBrokerModal - obcinanie podglądu na 50 wierszach", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("dokładnie 50 wierszy: wszystkie widoczne, BEZ licznika 'więcej'", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\dane.csv");
    const rows = Array.from({ length: 50 }, (_, i) => wiersz(`SYM${i}`));
    invokeCommand.mockResolvedValue({ row_count: 50, rows, warnings: [] });
    wyrenderuj();

    await user.click(screen.getByRole("button", { name: "Wybierz plik CSV" }));

    await screen.findAllByText("SYM0");
    // Nagłówek + 50 wierszy danych = 51.
    expect(screen.getAllByRole("row")).toHaveLength(51);
    expect(screen.getAllByText("SYM49").length).toBeGreaterThan(0);
    expect(screen.queryByText(/więcej/)).not.toBeInTheDocument();
  });

  it("51 wierszy: tylko pierwsze 50 widoczne, licznik pokazuje '...i 1 więcej.'", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\dane.csv");
    const rows = Array.from({ length: 51 }, (_, i) => wiersz(`SYM${i}`));
    invokeCommand.mockResolvedValue({ row_count: 51, rows, warnings: [] });
    wyrenderuj();

    await user.click(screen.getByRole("button", { name: "Wybierz plik CSV" }));

    await screen.findAllByText("SYM49");
    // Nagłówek + TYLKO 50 z 51 wierszy danych = 51 (nie 52).
    expect(screen.getAllByRole("row")).toHaveLength(51);
    expect(screen.queryByText("SYM50")).not.toBeInTheDocument();
    expect(screen.getByText("...i 1 więcej.")).toBeInTheDocument();
  });
});

describe("ImportBrokerModal - odznaka wariantu MINI", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("wariant MINI dostaje odznakę, inny wariant myślnik", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\dane.csv");
    invokeCommand.mockResolvedValue({
      row_count: 2,
      rows: [wiersz("EURUSD.mini", "MINI"), wiersz("EURUSD", "STANDARD")],
      warnings: [],
    });
    wyrenderuj();

    await user.click(screen.getByRole("button", { name: "Wybierz plik CSV" }));

    const wiersze = await screen.findAllByRole("row");
    // wiersze[0] to nagłówek.
    expect(wiersze[1]).toHaveTextContent("MINI");
    expect(wiersze[2]).not.toHaveTextContent("MINI");
    expect(wiersze[2]).toHaveTextContent("—");
  });
});
