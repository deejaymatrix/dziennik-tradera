import { fromDatetimeLocalValue, toDatetimeLocalValue } from "./datetime";
import { isValidDecimalString } from "./decimal";
import type { Trade, TradeEmotions, TradeInput, TradeSide } from "./types/trade";
import { blankTradeEmotions } from "./types/trade";

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
  interval: string;
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
  overrideEnabled: boolean;
  overrideNetPnl: string;
  overrideReason: string;
  emotions: TradeEmotions;
}

export function blankTradeFormFields(): TradeFormFields {
  return {
    instrumentId: "",
    strategyId: "",
    side: "buy",
    openedAt: "",
    closedAt: "",
    interval: "",
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
    overrideEnabled: false,
    overrideNetPnl: "",
    overrideReason: "",
    emotions: blankTradeEmotions(),
  };
}

export function tradeToFormFields(trade: Trade): TradeFormFields {
  return {
    instrumentId: trade.instrument_id ?? "",
    strategyId: trade.strategy_id ?? "",
    side: trade.side,
    openedAt: toDatetimeLocalValue(trade.opened_at),
    closedAt: toDatetimeLocalValue(trade.closed_at),
    interval: trade.interval ?? "",
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
    overrideEnabled: trade.pnl_source === "manual_override",
    overrideNetPnl: trade.net_pnl ?? "",
    overrideReason: trade.pnl_override_reason ?? "",
    emotions: trade.emotions ?? blankTradeEmotions(),
  };
}

function parseOptionalDecimal(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && isValidDecimalString(trimmed) ? trimmed : null;
}

function parseRequiredDecimal(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed && isValidDecimalString(trimmed) ? trimmed : fallback;
}

export function buildTradeInput(fields: TradeFormFields, accountId: string): TradeInput {
  return {
    account_id: accountId,
    instrument_id: fields.instrumentId || null,
    strategy_id: fields.strategyId || null,
    side: fields.side,
    opened_at: fromDatetimeLocalValue(fields.openedAt),
    closed_at: fromDatetimeLocalValue(fields.closedAt),
    interval: fields.interval.trim() ? fields.interval : null,
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
    pnl_override: fields.overrideEnabled
      ? { net_pnl: fields.overrideNetPnl.trim() || "0", reason: fields.overrideReason }
      : null,
    emotions: fields.emotions,
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
  { key: "volume", label: "Wolumen" },
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
      return `${label} musi być liczbą (np. 1.10500).`;
    }
  }
  if (fields.overrideEnabled) {
    if (fields.overrideNetPnl.trim() && !isValidDecimalString(fields.overrideNetPnl)) {
      return "Ręczna kwota wyniku musi być liczbą.";
    }
    if (!fields.overrideReason.trim()) {
      return "Ręczna korekta wyniku wymaga podania uzasadnienia.";
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
