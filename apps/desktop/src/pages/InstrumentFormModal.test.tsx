import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstrumentFormModal } from "./InstrumentFormModal";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { InstrumentWithDetails, NewInstrumentInput } from "../app/types/instrument";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function instrument(overrides: Partial<InstrumentWithDetails> = {}): InstrumentWithDetails {
  return {
    id: "instr-1",
    display_symbol: "EURUSD",
    source_symbol: "EURUSD.a",
    description: "Euro/Dolar",
    category: "Forex",
    factory_index: null,
    template_id: null,
    canonical_symbol: "EURUSD",
    variant: "STANDARD",
    origin: "user_created",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_visible: true,
    sort_order: 0,
    is_favorite: false,
    version: {
      id: "ver-1",
      instrument_id: "instr-1",
      version_number: 1,
      is_active: true,
      currency_base: "EUR",
      currency_profit: "USD",
      currency_margin: "USD",
      digits: 5,
      point: "0.00001",
      trade_tick_size: "0.00001",
      trade_tick_value: "1",
      tick_value_profit: "1",
      tick_value_loss: "1",
      contract_size: "100000",
      volume_min: "0.01",
      volume_max: "100",
      volume_step: "0.01",
      volume_limit: "0",
      calc_mode: "SYMBOL_CALC_MODE_FOREX",
      trade_mode: "SYMBOL_TRADE_MODE_FULL",
      execution_mode: "SYMBOL_TRADE_EXECUTION_MARKET",
      order_mode_flags: 63,
      filling_mode_flags: 1,
      expiration_mode_flags: 15,
      spread_floating: true,
      stops_level_points: 0,
      freeze_level_points: 0,
      margin_initial: "0",
      margin_maintenance: "0",
      margin_hedged: "0",
      margin_hedged_use_leg: false,
      liquidity_rate: "0",
      margin_rate_buy_initial: "1",
      margin_rate_buy_maintenance: "1",
      margin_rate_sell_initial: "1",
      margin_rate_sell_maintenance: "1",
      swap_mode: "SYMBOL_SWAP_MODE_POINTS",
      swap_long: "0",
      swap_short: "0",
      swap_sunday: "1",
      swap_monday: "1",
      swap_tuesday: "1",
      swap_wednesday: "1",
      swap_thursday: "1",
      swap_friday: "1",
      swap_saturday: "1",
      triple_swap_day: "ENUM_DAY_OF_WEEK::7",
      quote_sessions: "",
      trade_sessions: "",
      start_time: null,
      expiration_time: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  };
}

function pole(label: string): HTMLElement {
  return screen.getByLabelText(new RegExp(`^${label.replace(/[().]/g, "\\$&")}`));
}

function wyrenderuj(props: Partial<Parameters<typeof InstrumentFormModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <ConfirmProvider>
        <InstrumentFormModal open onClose={onClose} onSaved={onSaved} {...props} />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return { onClose, onSaved };
}

function zapisaneInput(): NewInstrumentInput {
  const wywolanie = invokeCommand.mock.calls.find(
    (call: unknown[]) => call[0] === "create_instrument",
  ) as [string, { input: NewInstrumentInput }] | undefined;
  if (!wywolanie) {
    throw new Error("create_instrument nie zostało wywołane");
  }
  return wywolanie[1].input;
}

/**
 * `InstrumentFormModal` - parametry instrumentu (MT5) wpisywane ręcznie, przeliczane na `Decimal`
 * po stronie backendu. Trzy nieoczywiste rzeczy: (1) walidacja przecina ZARÓWNO podstawowe, jak i
 * zaawansowane pola dziesiętne, NIEZALEŻNIE od tego, czy sekcja zaawansowana jest w danej chwili
 * rozwinięta (`showAdvanced`) - pole schowane, ale niepoprawne, wciąż blokuje zapis; (2) `dec()`
 * normalizuje przecinek na kropkę osobno dla KAŻDEGO pola liczbowego przed wysyłką - dokładnie ten
 * sam błąd co gdzie indziej w aplikacji (przecinek trafiający do `Decimal::from_str` w Ruście
 * wywaliłby parsowanie); (3) `factory_index != null` przełącza dolny przycisk między "Przywróć
 * wartości fabryczne" (instrument z katalogu MT5) a "Usuń" (instrument własny) - nigdy oba naraz.
 * Dotąd zero testów.
 */
describe("InstrumentFormModal - nowy instrument", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("niepoprawne Point blokuje zapis komunikatem konkretnego pola, nie woła backendu", async () => {
    // Same spacja (nie prawdziwy pusty string) - natywny `required` przepuszcza spację, a
    // dopiero własna walidacja `isValidDecimalString` w handleSubmit ją odrzuca (ustalony w tej
    // bazie kodu sposób na obejście natywnej blokady submitu dla pustych wymaganych pól).
    const user = userEvent.setup();
    wyrenderuj();
    await user.type(pole("Symbol wyświetlany"), "EURUSD");
    await user.type(pole("Symbol techniczny"), "EURUSD.a");
    await user.type(pole("Opis"), "Euro/Dolar");
    await user.type(pole("Point"), " ");
    await user.type(pole("Wielkość ticka (TradeTickSize)"), "0.00001");
    await user.type(pole("Wartość ticka (TradeTickValue)"), "1");
    await user.type(pole("Wartość ticka dla zysku"), "1");
    await user.type(pole("Wartość ticka dla straty"), "1");
    await user.type(pole("Wielkość kontraktu"), "100000");
    await user.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(screen.getByText("Point musi być liczbą (np. 0,0001 albo 0.0001).")).toBeInTheDocument();
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("przecinek w polu dziesiętnym trafia do backendu jako kropka", async () => {
    const user = userEvent.setup();
    wyrenderuj();
    await user.type(pole("Symbol wyświetlany"), "EURUSD");
    await user.type(pole("Symbol techniczny"), "EURUSD.a");
    await user.type(pole("Opis"), "Euro/Dolar");
    await user.type(pole("Point"), "0,00001");
    await user.type(pole("Wielkość ticka (TradeTickSize)"), "0.00001");
    await user.type(pole("Wartość ticka (TradeTickValue)"), "1");
    await user.type(pole("Wartość ticka dla zysku"), "1");
    await user.type(pole("Wartość ticka dla straty"), "1");
    await user.type(pole("Wielkość kontraktu"), "100000");
    await user.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(zapisaneInput().parameters.point).toBe("0.00001");
    expect(zapisaneInput().display_symbol).toBe("EURUSD");
  });
});

describe("InstrumentFormModal - edycja: fabryczny vs własny", () => {
  it("instrument fabryczny pokazuje 'Przywróć wartości fabryczne', NIE 'Usuń'", () => {
    wyrenderuj({ instrument: instrument({ factory_index: 5 }) });
    expect(screen.getByRole("button", { name: "Przywróć wartości fabryczne" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usuń" })).not.toBeInTheDocument();
  });

  it("instrument własny pokazuje 'Usuń', NIE 'Przywróć wartości fabryczne'", () => {
    wyrenderuj({ instrument: instrument({ factory_index: null }) });
    expect(screen.getByRole("button", { name: "Usuń" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Przywróć wartości fabryczne" }),
    ).not.toBeInTheDocument();
  });

  it("'Usuń' pyta o potwierdzenie - Anuluj NIE woła delete_instrument", async () => {
    const user = userEvent.setup();
    wyrenderuj({ instrument: instrument({ factory_index: null }) });
    await user.click(screen.getByRole("button", { name: "Usuń" }));
    await user.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(invokeCommand).not.toHaveBeenCalledWith("delete_instrument", expect.anything());
  });
});

describe("InstrumentFormModal - edycja: anulowanie zmian", () => {
  it("Anuluj po edycji odrzuca wpisaną wartość, wraca do oryginalnej w podsumowaniu", async () => {
    const user = userEvent.setup();
    wyrenderuj({ instrument: instrument() });
    await user.click(screen.getByRole("button", { name: "Edytuj" }));
    const pointField = pole("Point");
    await user.clear(pointField);
    await user.type(pointField, "9.99999");
    await user.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByLabelText(/^Point/)).not.toBeInTheDocument();
    expect(screen.getByText("Digits / Point").nextElementSibling).toHaveTextContent("0,00001");
  });
});
