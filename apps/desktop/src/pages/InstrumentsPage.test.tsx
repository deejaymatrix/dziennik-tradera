import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstrumentsPage } from "./InstrumentsPage";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type {
  BrokerTemplate,
  InstrumentListFilter,
  InstrumentWithDetails,
} from "../app/types/instrument";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

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
    instrument_count: 1,
    ...overrides,
  };
}

function instrument(overrides: Partial<InstrumentWithDetails> = {}): InstrumentWithDetails {
  return {
    id: "instr-1",
    display_symbol: "EURUSD",
    source_symbol: "EURUSD.a",
    description: "Euro/Dolar",
    category: "Forex",
    factory_index: null,
    template_id: "t1",
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

/**
 * `list_instruments` woła się DWA RAZY per `load()` (Promise.all) - raz z pełnym filtrem UI
 * (główna tabela), raz na sztywno z `visibility: "visible"` dla sekcji kolejności. Żaden z tych
 * testów nie sprawdza sekcji kolejności, więc druga odpowiedź jest zawsze pustą listą - inaczej
 * te same instrumenty (domyślnie `is_visible: true`) renderowałyby się DWA RAZY (w tabeli i w
 * liście kolejności), co psuje zapytania po samym tekście symbolu.
 */
function nastawKomendy(handlers: {
  templates?: () => Promise<BrokerTemplate[]>;
  instruments?: (filter: InstrumentListFilter) => Promise<InstrumentWithDetails[]>;
}): void {
  invokeCommand.mockImplementation((command: string, args?: { filter?: InstrumentListFilter }) => {
    if (command === "list_broker_templates") {
      return (handlers.templates ?? (() => Promise.resolve([szablon()])))();
    }
    if (command === "list_instruments") {
      const filter = args?.filter as InstrumentListFilter;
      if (filter.visibility === "visible") {
        return Promise.resolve([]);
      }
      return (handlers.instruments ?? (() => Promise.resolve([])))(filter);
    }
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <InstrumentsPage />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * `InstrumentsPage` - lista instrumentów w obrębie wybranego szablonu brokera, z widocznością,
 * kategorią i wyszukiwaniem. Nieoczywiste rzeczy: (1) odznaka "MINI" pokazuje się TYLKO dla
 * symboli kończących się na "-MINI"; (2) przycisk usuwania jest CAŁKOWICIE ukryty (nie tylko
 * wyłączony) dla instrumentów fabrycznych (`factory_index !== null`) - fabrycznych nie da się
 * usunąć wcale, tylko przywrócić do wartości domyślnych gdzie indziej; (3) "Zaznacz wszystkie na
 * tej stronie" jest przełącznikiem zależnym od stanu (ten sam wzorzec co `KoszPage`). Dotąd zero
 * testów.
 */
describe("InstrumentsPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pusta lista instrumentów pokazuje EmptyState, nie tabelę", async () => {
    nastawKomendy({ instruments: () => Promise.resolve([]) });
    wyrenderuj();
    expect(await screen.findByText("Brak instrumentów spełniających filtr")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("symbol kończący się na '-MINI' dostaje odznakę MINI, zwykły symbol nie", async () => {
    nastawKomendy({
      instruments: () =>
        Promise.resolve([
          instrument({ id: "a", display_symbol: "US500" }),
          instrument({ id: "b", display_symbol: "US500-MINI" }),
        ]),
    });
    wyrenderuj();
    await screen.findByText("US500");
    const [, wierszUS500, wierszMini] = screen.getAllByRole("row");
    if (!wierszUS500 || !wierszMini) {
      throw new Error("brak oczekiwanych wierszy");
    }
    // Świadomie `queryByText` (dopasowanie DOKŁADNE, nie "zawiera") - inaczej "US500-MINI" jako
    // surowy tekst symbolu fałszywie zaliczyłby się jako "zawiera MINI", nawet bez samej odznaki.
    expect(within(wierszUS500).queryByText("MINI")).not.toBeInTheDocument();
    expect(within(wierszMini).getByText("MINI")).toBeInTheDocument();
  });

  it("instrument fabryczny NIE pokazuje przycisku usuwania, własny pokazuje", async () => {
    nastawKomendy({
      instruments: () =>
        Promise.resolve([
          instrument({ id: "a", display_symbol: "EURUSD", factory_index: 3 }),
          instrument({ id: "b", display_symbol: "GBPUSD", factory_index: null }),
        ]),
    });
    wyrenderuj();
    await screen.findByText("EURUSD");
    expect(screen.queryByRole("button", { name: "Usuń EURUSD" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuń GBPUSD" })).toBeInTheDocument();
  });

  it("widoczny instrument pokazuje odznakę 'Widoczny', ukryty odznakę 'Ukryty'", async () => {
    nastawKomendy({
      instruments: () =>
        Promise.resolve([
          instrument({ id: "a", display_symbol: "EURUSD", is_visible: true }),
          instrument({ id: "b", display_symbol: "GBPUSD", is_visible: false }),
        ]),
    });
    wyrenderuj();
    await screen.findByText("EURUSD");
    expect(screen.getByText("Widoczny")).toBeInTheDocument();
    expect(screen.getByText("Ukryty")).toBeInTheDocument();
  });

  it("'Zaznacz wszystkie na tej stronie' zaznacza, a ponowny klik odznacza wszystko", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      instruments: () =>
        Promise.resolve([
          instrument({ id: "a", display_symbol: "EURUSD" }),
          instrument({ id: "b", display_symbol: "GBPUSD" }),
        ]),
    });
    wyrenderuj();
    await screen.findByText("EURUSD");

    const zaznaczWszystkie = screen.getByRole("checkbox", {
      name: "Zaznacz wszystkie na tej stronie",
    });
    await user.click(zaznaczWszystkie);
    expect(screen.getByRole("checkbox", { name: "Zaznacz EURUSD" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zaznacz GBPUSD" })).toBeChecked();

    await user.click(zaznaczWszystkie);
    expect(screen.getByRole("checkbox", { name: "Zaznacz EURUSD" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zaznacz GBPUSD" })).not.toBeChecked();
  });
});
