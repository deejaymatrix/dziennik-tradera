import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KalkulatorPozycjiPage } from "./KalkulatorPozycjiPage";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import styles from "./KalkulatorPozycjiPage.module.css";
import type { AccountWithBalance } from "../app/types/account";
import type { InstrumentWithDetails } from "../app/types/instrument";

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

function nastawKomendy(handlers: {
  accounts?: () => Promise<AccountWithBalance[]>;
  instruments?: () => Promise<InstrumentWithDetails[]>;
  calculate?: () => Promise<unknown>;
}): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "get_preferences") return Promise.reject(new Error("brak w teście"));
    if (command === "list_accounts")
      return (handlers.accounts ?? (() => Promise.resolve([konto()])))();
    if (command === "list_broker_templates") return Promise.resolve([]);
    if (command === "list_instruments") {
      return (handlers.instruments ?? (() => Promise.resolve([instrument()])))();
    }
    if (command === "calculate_position_size") {
      return (
        handlers.calculate ??
        (() =>
          Promise.resolve({
            risk_target_amount: "10",
            stop_loss_price: "1.09500",
            stop_distance_price: "0.01",
            stop_distance_points: "100",
            loss_per_lot: "100",
            raw_lot: "0.1",
            suggested_lot: "0.1",
            actual_risk_amount: "10",
            actual_risk_percent: "1",
            units: "10000",
            reward_amount: null,
            rr: null,
            warnings: [],
          }))
      )();
    }
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(
    <PreferencesProvider>
      <ToastProvider>
        <KalkulatorPozycjiPage />
      </ToastProvider>
    </PreferencesProvider>,
  );
}

async function wypelnijWymagane(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Cena wejścia"), "1.10500");
  await user.type(screen.getByLabelText(/Stop loss \(punkty\)|Cena stop lossa/), "200");
}

/**
 * `KalkulatorPozycjiPage` - cała matematyka dzieje się w Rust, frontend tylko zbiera wejście i
 * pokazuje wynik. Nieoczywiste rzeczy: (1) `formatNumber` MUSI ograniczyć `minimumFractionDigits`
 * do `Math.min(2, maxFractionDigits)` - bez tego `Intl.NumberFormat` rzuca `RangeError` i wywala
 * CAŁY ekran, gdy `maximumFractionDigits` jest mniejsze niż domyślne minimum (dokładnie to, co
 * przydarzyło się na żywo przy odległości SL w punktach, gdzie maksimum to 1 miejsce); (2) wynik
 * przelicza się z 250ms opóźnieniem PO uzupełnieniu wszystkich wymaganych pól (konto, instrument,
 * cena wejścia, stop loss, ryzyko) - niekompletne dane kasują wynik BEZ wołania backendu; (3) pole
 * kursu walutowego pokazuje się TYLKO gdy waluta wyniku instrumentu różni się od waluty konta.
 * Dotąd zero testów.
 */
describe("KalkulatorPozycjiPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("niekompletne dane (brak stop lossa) NIE wołają backendu, pokazują podpowiedź", async () => {
    const user = userEvent.setup();
    nastawKomendy({});
    wyrenderuj();
    await screen.findByLabelText("Cena wejścia");
    await user.type(screen.getByLabelText("Cena wejścia"), "1.10500");
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText("Uzupełnij cenę wejścia, stop loss i ryzyko.")).toBeInTheDocument();
    expect(invokeCommand).not.toHaveBeenCalledWith("calculate_position_size", expect.anything());
  });

  it("kompletne dane po opóźnieniu wołają backend i pokazują sugerowany lot", async () => {
    const user = userEvent.setup();
    nastawKomendy({});
    wyrenderuj();
    await screen.findByLabelText("Cena wejścia");
    await wypelnijWymagane(user);
    expect(
      await screen.findByText("0,10", { selector: `.${styles.lotValue}` }, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("odległość SL w punktach (1 miejsce po przecinku) NIE wywala ekranu (RangeError)", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      calculate: () =>
        Promise.resolve({
          risk_target_amount: "10",
          stop_loss_price: "1.09500",
          stop_distance_price: "0.01",
          stop_distance_points: "100.5",
          loss_per_lot: "100",
          raw_lot: "0.1",
          suggested_lot: "0.1",
          actual_risk_amount: "10",
          actual_risk_percent: "1",
          units: "10000",
          reward_amount: null,
          rr: null,
          warnings: [],
        }),
    });
    wyrenderuj();
    await screen.findByLabelText("Cena wejścia");
    await wypelnijWymagane(user);
    expect(await screen.findByText(/100,5 pkt/, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("pole kursu walutowego pokazuje się TYLKO gdy waluta wyniku różni się od waluty konta", async () => {
    nastawKomendy({
      accounts: () => Promise.resolve([konto({ currency: "USD" })]),
      instruments: () =>
        Promise.resolve([
          instrument({ version: { ...instrument().version, currency_profit: "EUR" } }),
        ]),
    });
    wyrenderuj();
    expect(await screen.findByLabelText(/Kurs EUR → USD/)).toBeInTheDocument();
  });

  it("pole kursu walutowego NIE pokazuje się, gdy waluty są takie same", async () => {
    nastawKomendy({
      accounts: () => Promise.resolve([konto({ currency: "USD" })]),
      instruments: () =>
        Promise.resolve([
          instrument({ version: { ...instrument().version, currency_profit: "USD" } }),
        ]),
    });
    wyrenderuj();
    await screen.findByLabelText("Cena wejścia");
    expect(screen.queryByLabelText(/Kurs/)).not.toBeInTheDocument();
  });

  it("ostrzeżenia z backendu renderują się jako lista", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      calculate: () =>
        Promise.resolve({
          risk_target_amount: "10",
          stop_loss_price: "1.09500",
          stop_distance_price: "0.01",
          stop_distance_points: "100",
          loss_per_lot: "100",
          raw_lot: "0.1",
          suggested_lot: "0.1",
          actual_risk_amount: "10",
          actual_risk_percent: "1",
          units: "10000",
          reward_amount: null,
          rr: null,
          warnings: ["Lot poniżej minimalnego kroku brokera."],
        }),
    });
    wyrenderuj();
    await screen.findByLabelText("Cena wejścia");
    await wypelnijWymagane(user);
    expect(
      await screen.findByText("Lot poniżej minimalnego kroku brokera.", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });
});
