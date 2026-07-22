/** Kategorie z fabrycznego katalogu 350 instrumentów - patrz domain::instrument::INSTRUMENT_CATEGORIES. */
export const INSTRUMENT_CATEGORIES = [
  "Forex",
  "Metale",
  "Indeksy",
  "Indeksy mini",
  "Kryptowaluty",
  "Towary",
  "Soft commodities",
  "Akcje",
  "NDF",
  "Instrumenty syntetyczne",
] as const;

export type InstrumentCategory = (typeof INSTRUMENT_CATEGORIES)[number];

/** Stabilna tożsamość instrumentu - patrz domain::instrument::Instrument. */
export interface Instrument {
  id: string;
  display_symbol: string;
  source_symbol: string;
  description: string;
  category: string;
  factory_index: number | null;
  /** Szablon brokera (B1) - izolacja parametrów między brokerami/kontami. */
  template_id: string | null;
  /** Symbol kanoniczny (np. XAUUSD) niezależny od sufiksu brokera. */
  canonical_symbol: string | null;
  /** STANDARD / MINI / itp. */
  variant: string;
  /** `broker_import` (chroniony) albo `user_created` (Dodany przez użytkownika). */
  origin: string;
  created_at: string;
  updated_at: string;
}

export interface BrokerTemplate {
  id: string;
  name: string;
  broker_name: string;
  account_type: string | null;
  source: "broker_import" | "duplicated" | "user_created";
  import_format_version: number | null;
  /** Ile kont korzysta z tego szablonu - powiązanie mieszka na koncie (`Account.template_id`),
   * więc jeden szablon może obsługiwać wiele rachunków u tego samego brokera. */
  account_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  instrument_count: number;
}

export interface NewBrokerTemplate {
  name: string;
  broker_name: string;
  account_type: string | null;
}

/**
 * Kompletny, wersjonowany zestaw parametrów obliczeniowych - odpowiada 1:1 kolumnom katalogu
 * 350 instrumentów. Wszystkie pola liczbowe to Decimal z backendu (string), nigdy nie parsować
 * przez parseFloat/Number() do dalszych obliczeń.
 */
export interface InstrumentVersion {
  id: string;
  instrument_id: string;
  version_number: number;
  is_active: boolean;
  currency_base: string;
  currency_profit: string;
  currency_margin: string;
  digits: number;
  point: string;
  trade_tick_size: string;
  trade_tick_value: string;
  tick_value_profit: string;
  tick_value_loss: string;
  contract_size: string;
  volume_min: string;
  volume_max: string;
  volume_step: string;
  volume_limit: string;
  calc_mode: string;
  trade_mode: string;
  execution_mode: string;
  order_mode_flags: number;
  filling_mode_flags: number;
  expiration_mode_flags: number;
  spread_floating: boolean;
  stops_level_points: number;
  freeze_level_points: number;
  margin_initial: string;
  margin_maintenance: string;
  margin_hedged: string;
  margin_hedged_use_leg: boolean;
  liquidity_rate: string;
  margin_rate_buy_initial: string;
  margin_rate_buy_maintenance: string;
  margin_rate_sell_initial: string;
  margin_rate_sell_maintenance: string;
  swap_mode: string;
  swap_long: string;
  swap_short: string;
  swap_sunday: string;
  swap_monday: string;
  swap_tuesday: string;
  swap_wednesday: string;
  swap_thursday: string;
  swap_friday: string;
  swap_saturday: string;
  triple_swap_day: string;
  quote_sessions: string;
  trade_sessions: string;
  start_time: string | null;
  expiration_time: string | null;
  created_at: string;
}

/** To, co widzi frontend: tożsamość + aktualna wersja + preferencje widoczności/kolejności. */
export interface InstrumentWithDetails extends Instrument {
  version: InstrumentVersion;
  is_visible: boolean;
  sort_order: number;
  is_favorite: boolean;
}

export type InstrumentVisibilityFilter = "all" | "visible" | "hidden";

export interface InstrumentListFilter {
  search?: string | null;
  category?: string | null;
  visibility: InstrumentVisibilityFilter;
  /** Kontekst szablonu (B1) - instrumenty listowane w obrębie jednego szablonu brokera. */
  template_id?: string | null;
  /** Tylko instrumenty dodane ręcznie przez użytkownika (filtr "Dodane przez użytkownika"). */
  user_created_only?: boolean;
}

/** Edytowalny podzbiór parametrów wersji - to, co formularz edycji wysyła do backendu. */
export type InstrumentVersionInput = Omit<
  InstrumentVersion,
  "id" | "instrument_id" | "version_number" | "is_active" | "created_at"
>;

export interface NewInstrumentInput {
  display_symbol: string;
  source_symbol: string;
  description: string;
  category: string;
  /** Szablon docelowy (B1); null = domyślny (najstarszy aktywny) szablon. */
  template_id?: string | null;
  parameters: InstrumentVersionInput;
}
