import { fromDatetimeLocalValue, toDatetimeLocalValue } from "./datetime";
import { isValidDecimalString, normalizeDecimalInput } from "./decimal";
import type { DefaultsPreferences } from "./types/preferences";
import type { StrategyChecklist, Trade, TradeEmotions, TradeInput, TradeSide } from "./types/trade";
import { blankStrategyChecklist, blankTradeEmotions } from "./types/trade";

/**
 * Stan formularza transakcji jako zwykłe stringi (kontrolowane pola) - konwersja na
 * `TradeInput` (typy Decimal-jako-string, daty ISO) dzieje się dopiero w `buildTradeInput`,
 * przy zapisie/podglądzie, nigdy wcześniej. Ten kształt jest też tym, co ląduje w
 * localStorage jako autosave szkicu (patrz `loadDraft`/`saveDraft`).
 */
export interface TradeFormFields {
  instrumentId: string;
  strategyId: string;
  side: TradeSide;
  openedAt: string;
  closedAt: string;
  intervalId: string;
  session: string;
  volume: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  exitPrice: string;
  commission: string;
  swap: string;
  otherFees: string;
  conversionRate: string;
  planBefore: string;
  managementNotes: string;
  postTradeSummary: string;
  conclusion: string;
  planAdherenceRating: string;
  emotions: TradeEmotions;
  checklist: StrategyChecklist;
  partialCloses: PartialCloseRow[];
}

/** Wiersz częściowego zamknięcia w formularzu - surowe stringi, bo to kontrolowane pola tekstowe
 * (użytkownik może w trakcie pisania mieć tam `0,` albo pusto). Na `PartialClose` z kropką
 * dziesiętną zamienia je dopiero `buildTradeInput`. */
export interface PartialCloseRow {
  closedVolume: string;
  realizedPnl: string;
}

export function blankPartialCloseRow(): PartialCloseRow {
  return { closedVolume: "", realizedPnl: "" };
}

/** Wiersz uznajemy za "jeszcze pusty" (świeżo dodany, nic nie wpisano) - taki nie leci do
 * backendu i nie jest błędem. Dzięki temu kliknięcie "Dodaj częściowe zamknięcie" i rozmyślenie
 * się nie blokuje zapisu. */
export function isBlankPartialCloseRow(row: PartialCloseRow): boolean {
  return !row.closedVolume.trim() && !row.realizedPnl.trim();
}

export function blankTradeFormFields(): TradeFormFields {
  return {
    instrumentId: "",
    strategyId: "",
    side: "buy",
    openedAt: "",
    closedAt: "",
    intervalId: "",
    session: "",
    volume: "",
    entryPrice: "",
    stopLoss: "",
    takeProfit: "",
    exitPrice: "",
    commission: "0",
    swap: "0",
    otherFees: "0",
    conversionRate: "",
    planBefore: "",
    managementNotes: "",
    postTradeSummary: "",
    conclusion: "",
    planAdherenceRating: "",
    emotions: blankTradeEmotions(),
    checklist: blankStrategyChecklist(),
    partialCloses: [],
  };
}

/**
 * Nakłada na PUSTY formularz domyślne wartości z ustawień (Ustawienia → Domyślne wartości).
 *
 * Świadomie dotyczy wyłącznie interwału i sesji. Instrument, kierunek BUY/SELL i strategia
 * NIE mają domyślnych wartości - specyfikacja wymaga, żeby te trzy pola zawsze wymagały
 * świadomego wyboru, bo wpisane z przyzwyczajenia fałszują cały dziennik.
 *
 * Nie stosuje się do edycji istniejącej transakcji - tam wartości pochodzą z zapisu.
 */
export function applyNewTradeDefaults(
  fields: TradeFormFields,
  defaults: DefaultsPreferences | undefined,
): TradeFormFields {
  if (!defaults) {
    return fields;
  }
  return {
    ...fields,
    intervalId: defaults.default_interval_id ?? fields.intervalId,
    session: defaults.default_session ?? fields.session,
  };
}

/** Konto podpowiadane w nowej transakcji (Ustawienia → Domyślne wartości → Domyślne konto).
 * `lastUsedAccountId` to konto ostatnio wybrane na liście transakcji. */
export function resolveDefaultAccountId(
  defaults: DefaultsPreferences | undefined,
  lastUsedAccountId: string,
): string {
  if (!defaults) {
    return lastUsedAccountId;
  }
  switch (defaults.default_account.kind) {
    case "specific":
      return defaults.default_account.account_id;
    case "none":
      return "";
    case "last_used":
      return lastUsedAccountId;
  }
}

export function tradeToFormFields(trade: Trade): TradeFormFields {
  return {
    instrumentId: trade.instrument_id ?? "",
    strategyId: trade.strategy_id ?? "",
    side: trade.side,
    openedAt: toDatetimeLocalValue(trade.opened_at),
    closedAt: toDatetimeLocalValue(trade.closed_at),
    intervalId: trade.interval_id ?? "",
    session: trade.session ?? "",
    volume: trade.volume ?? "",
    entryPrice: trade.entry_price ?? "",
    stopLoss: trade.stop_loss ?? "",
    takeProfit: trade.take_profit ?? "",
    exitPrice: trade.exit_price ?? "",
    commission: trade.commission,
    swap: trade.swap,
    otherFees: trade.other_fees,
    conversionRate: trade.conversion_rate ?? "",
    planBefore: trade.plan_before ?? "",
    managementNotes: trade.management_notes ?? "",
    postTradeSummary: trade.post_trade_summary ?? "",
    conclusion: trade.conclusion ?? "",
    planAdherenceRating:
      trade.plan_adherence_rating !== null ? String(trade.plan_adherence_rating) : "",
    emotions: trade.emotions ?? blankTradeEmotions(),
    checklist: trade.checklist ?? blankStrategyChecklist(),
    // Backend zawsze przysyła tablicę (`Vec` serializuje się jako `[]`), więc bez zabezpieczania
    // przed `undefined` - lint słusznie zgłasza je jako martwy warunek.
    partialCloses: trade.partial_closes.map((close) => ({
      closedVolume: close.closed_volume,
      realizedPnl: close.realized_pnl,
    })),
  };
}

/** Do backendu ZAWSZE trafia postać kanoniczna (kropka), niezależnie od tego, czy użytkownik
 * wpisał `1,23` czy `1.23` - patrz `normalizeDecimalInput`. */
function parseOptionalDecimal(value: string): string | null {
  return normalizeDecimalInput(value);
}

function parseRequiredDecimal(value: string, fallback: string): string {
  return normalizeDecimalInput(value) ?? fallback;
}

export function buildTradeInput(fields: TradeFormFields, accountId: string): TradeInput {
  return {
    account_id: accountId,
    instrument_id: fields.instrumentId || null,
    strategy_id: fields.strategyId || null,
    side: fields.side,
    opened_at: fromDatetimeLocalValue(fields.openedAt),
    closed_at: fromDatetimeLocalValue(fields.closedAt),
    interval_id: fields.intervalId || null,
    session: fields.session.trim() ? fields.session : null,
    volume: parseOptionalDecimal(fields.volume),
    entry_price: parseOptionalDecimal(fields.entryPrice),
    stop_loss: parseOptionalDecimal(fields.stopLoss),
    take_profit: parseOptionalDecimal(fields.takeProfit),
    exit_price: parseOptionalDecimal(fields.exitPrice),
    commission: parseRequiredDecimal(fields.commission, "0"),
    swap: parseRequiredDecimal(fields.swap, "0"),
    other_fees: parseRequiredDecimal(fields.otherFees, "0"),
    conversion_rate: parseOptionalDecimal(fields.conversionRate),
    plan_before: fields.planBefore.trim() ? fields.planBefore : null,
    management_notes: fields.managementNotes.trim() ? fields.managementNotes : null,
    post_trade_summary: fields.postTradeSummary.trim() ? fields.postTradeSummary : null,
    conclusion: fields.conclusion.trim() ? fields.conclusion : null,
    plan_adherence_rating: fields.planAdherenceRating
      ? Number.parseInt(fields.planAdherenceRating, 10)
      : null,
    emotions: fields.emotions,
    checklist: fields.checklist,
    // Puste wiersze (dodane i nieuzupełnione) po prostu odpadają - nie są błędem. Wiersz
    // częściowo uzupełniony leci dalej z brakującą kwotą jako "0", a walidację formatu
    // i sensu (lot > 0, suma <= lot transakcji) robi `validateTradeFormFormat` i backend.
    partial_closes: fields.partialCloses
      .filter((row) => !isBlankPartialCloseRow(row))
      .map((row) => ({
        closed_volume: parseRequiredDecimal(row.closedVolume, "0"),
        realized_pnl: parseRequiredDecimal(row.realizedPnl, "0"),
      })),
  };
}

type DecimalFieldKey =
  | "volume"
  | "entryPrice"
  | "stopLoss"
  | "takeProfit"
  | "exitPrice"
  | "commission"
  | "swap"
  | "otherFees"
  | "conversionRate";

const DECIMAL_FIELD_LABELS: { key: DecimalFieldKey; label: string }[] = [
  { key: "volume", label: "Lot" },
  { key: "entryPrice", label: "Cena wejścia" },
  { key: "stopLoss", label: "Stop loss" },
  { key: "takeProfit", label: "Take profit" },
  { key: "exitPrice", label: "Cena wyjścia" },
  { key: "commission", label: "Prowizja" },
  { key: "swap", label: "Swap" },
  { key: "otherFees", label: "Dodatkowe opłaty" },
  { key: "conversionRate", label: "Kurs przeliczeniowy" },
];

/** Walidacja WYŁĄCZNIE formatu (czy pole jest poprawną liczbą) - reguły biznesowe
 * (np. wymagany instrument przy otwieraniu pozycji) sprawdza i tak backend z czytelnym
 * komunikatem, nie trzeba ich duplikować tutaj. */
export function validateTradeFormFormat(fields: TradeFormFields): string | null {
  for (const { key, label } of DECIMAL_FIELD_LABELS) {
    const value = fields[key];
    if (value.trim() && !isValidDecimalString(value)) {
      return `${label} musi być liczbą (np. 1,23 albo 1.23).`;
    }
  }

  // Komunikat wskazuje NUMER wpisu, bo częściowych zamknięć bywa wiele i samo "zamknięty lot
  // musi być liczbą" nie powiedziałoby, w którym wierszu szukać.
  for (const [index, row] of fields.partialCloses.entries()) {
    if (isBlankPartialCloseRow(row)) {
      continue;
    }
    const number = index + 1;
    if (!row.closedVolume.trim()) {
      return `Podaj zamknięty lot w częściowym zamknięciu nr ${number}.`;
    }
    if (!isValidDecimalString(row.closedVolume)) {
      return `Zamknięty lot w częściowym zamknięciu nr ${number} musi być liczbą (np. 0,5 albo 0.5).`;
    }
    if (row.realizedPnl.trim() && !isValidDecimalString(row.realizedPnl)) {
      return `Zrealizowany wynik w częściowym zamknięciu nr ${number} musi być liczbą (np. -12,40 albo -12.40).`;
    }
  }

  return null;
}

function draftStorageKey(accountId: string, tradeId: string | undefined): string {
  return `dziennik-tradera:trade-draft:${accountId}:${tradeId ?? "new"}`;
}

export function loadTradeDraft(
  accountId: string,
  tradeId: string | undefined,
): TradeFormFields | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(accountId, tradeId));
    if (!raw) {
      return null;
    }
    // Scalanie z pustym szablonem - szkic zapisany przed dodaniem nowego pola (np. emocji)
    // nie ma go w JSON-ie, więc bez tego brakujące pole zostałoby `undefined` zamiast
    // poprawnej pustej wartości i wywaliłoby formularz przy pierwszym użyciu.
    const parsed = JSON.parse(raw) as Partial<TradeFormFields>;
    return { ...blankTradeFormFields(), ...parsed };
  } catch {
    return null;
  }
}

export function saveTradeDraft(
  accountId: string,
  tradeId: string | undefined,
  fields: TradeFormFields,
): void {
  try {
    localStorage.setItem(draftStorageKey(accountId, tradeId), JSON.stringify(fields));
  } catch {
    // localStorage bywa niedostępny (np. tryb prywatny) - autosave to wygoda, nie funkcja krytyczna.
  }
}

export function clearTradeDraft(accountId: string, tradeId: string | undefined): void {
  try {
    localStorage.removeItem(draftStorageKey(accountId, tradeId));
  } catch {
    // jw.
  }
}
