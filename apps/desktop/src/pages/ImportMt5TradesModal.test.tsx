import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportMt5TradesModal } from "./ImportMt5TradesModal";
import type { AccountWithBalance } from "../app/types/account";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

const open = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

function konto(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
  return {
    id: "konto-1",
    name: "Konto A",
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

function wiersz(
  overrides: Partial<{
    ticket: string;
    symbol: string;
    side: string;
    volume: string;
    open_time: string;
    close_time: string;
    instrument_id: string | null;
    already_imported: boolean;
  }> = {},
) {
  return {
    ticket: "1",
    symbol: "EURUSD",
    side: "buy",
    volume: "1",
    open_time: "2026-01-01 08:00:00",
    close_time: "2026-01-01 09:00:00",
    instrument_id: "i1",
    already_imported: false,
    ...overrides,
  };
}

const KONTA = [konto({ id: "a", name: "Konto A" }), konto({ id: "b", name: "Konto B" })];

function wyrenderuj(accounts = KONTA) {
  const onClose = vi.fn();
  const onImported = vi.fn().mockResolvedValue(undefined);
  render(<ImportMt5TradesModal accounts={accounts} onClose={onClose} onImported={onImported} />);
  return { onClose, onImported };
}

async function wybierzPlikDlaKonta(user: ReturnType<typeof userEvent.setup>, konto: string) {
  await user.selectOptions(screen.getByLabelText("Konto docelowe"), konto);
  await user.click(screen.getByRole("button", { name: /Wybierz plik xlsx|Zmień plik/ }));
}

/**
 * `ImportMt5TradesModal` liczy "Do zaimportowania" jako przecięcie DWÓCH niezależnych warunków
 * (`instrument_id` rozpoznany I `!already_imported`) - pozycja rozpoznana, ale już
 * zaimportowana, NIE liczy się jako "do zaimportowania", mimo że ma `instrument_id`. Przycisk
 * "Importuj" musi zostać wyłączony, gdy ta liczba wynosi 0, NAWET gdy podgląd istnieje - inaczej
 * użytkownik mógłby kliknąć "Importuj" na podglądzie, z którego nic nowego by nie weszło. Druga
 * ryzykowna część: zmiana konta docelowego musi wyczyścić WSZYSTKIE poprzednie dane (plik,
 * podgląd, wynik) - inaczej podgląd policzony dla jednego konta mógłby zostać zaimportowany na
 * inne. Dotąd zero testów.
 */
describe("ImportMt5TradesModal - wybór pliku wymaga wcześniej wybranego konta", () => {
  it("przycisk wyboru pliku jest wyłączony, dopóki konto nie jest wybrane", () => {
    wyrenderuj();
    expect(screen.getByRole("button", { name: "Wybierz plik xlsx" })).toBeDisabled();
  });
});

describe("ImportMt5TradesModal - zmiana konta czyści poprzedni podgląd", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("po wybraniu pliku i uzyskaniu podglądu, zmiana konta chowa podgląd i nazwę pliku", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\mt5-historia.xlsx");
    invokeCommand.mockResolvedValue({
      row_count: 1,
      matched_count: 1,
      already_imported_count: 0,
      unmatched_symbols: [],
      rows: [wiersz()],
    });
    wyrenderuj();

    await wybierzPlikDlaKonta(user, "a");
    expect(await screen.findByText("mt5-historia.xlsx")).toBeInTheDocument();
    expect(screen.getByText(/Rozpoznano/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Konto docelowe"), "b");

    expect(screen.queryByText("mt5-historia.xlsx")).not.toBeInTheDocument();
    expect(screen.queryByText(/Rozpoznano/)).not.toBeInTheDocument();
  });
});

describe("ImportMt5TradesModal - 'Do zaimportowania' liczy tylko rozpoznane i NIE zaimportowane", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("wiersz rozpoznany, ale już zaimportowany, NIE liczy się do 'Do zaimportowania'", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\mt5-historia.xlsx");
    invokeCommand.mockResolvedValue({
      row_count: 3,
      matched_count: 2,
      already_imported_count: 1,
      unmatched_symbols: ["XAUUSDs"],
      rows: [
        wiersz({ ticket: "1", instrument_id: "i1", already_imported: false }),
        wiersz({ ticket: "2", instrument_id: "i1", already_imported: true }),
        wiersz({ ticket: "3", instrument_id: null, already_imported: false }),
      ],
    });
    wyrenderuj();

    await wybierzPlikDlaKonta(user, "a");

    expect(await screen.findByText("Do zaimportowania: 1")).toBeInTheDocument();
  });

  it("'Importuj' jest wyłączony, gdy 'Do zaimportowania' wynosi 0, mimo że podgląd istnieje", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\mt5-historia.xlsx");
    invokeCommand.mockResolvedValue({
      row_count: 1,
      matched_count: 1,
      already_imported_count: 1,
      unmatched_symbols: [],
      rows: [wiersz({ instrument_id: "i1", already_imported: true })],
    });
    wyrenderuj();

    await wybierzPlikDlaKonta(user, "a");

    await screen.findByText("Do zaimportowania: 0");
    expect(screen.getByRole("button", { name: "Importuj" })).toBeDisabled();
  });
});

describe("ImportMt5TradesModal - status wiersza: already_imported ma pierwszeństwo przed instrument_id", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    open.mockReset();
  });

  it("wiersz rozpoznany I już zaimportowany pokazuje 'już zaimportowana', nie 'gotowa'", async () => {
    const user = userEvent.setup();
    open.mockResolvedValue("C:\\mt5-historia.xlsx");
    invokeCommand.mockResolvedValue({
      row_count: 1,
      matched_count: 1,
      already_imported_count: 1,
      unmatched_symbols: [],
      rows: [wiersz({ instrument_id: "i1", already_imported: true })],
    });
    wyrenderuj();

    await wybierzPlikDlaKonta(user, "a");

    expect(await screen.findByText("już zaimportowana")).toBeInTheDocument();
    expect(screen.queryByText("gotowa")).not.toBeInTheDocument();
  });
});
