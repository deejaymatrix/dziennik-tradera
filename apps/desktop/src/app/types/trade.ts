import type { StrategySnapshot } from "./strategy";

/** Status nigdy nie jest wybierany przez użytkownika - backend go wylicza z obecności danych
 * (sekcja "Automatyczny status transakcji"). Tu tylko do wyświetlenia. */
export type TradeStatus = "draft" | "open" | "closed";
export type TradeSide = "buy" | "sell";
export type PnlSource = "auto" | "manual_override";

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  draft: "Szkic",
  open: "Otwarta",
  closed: "Zamknięta",
};

export const TRADE_SIDE_LABELS: Record<TradeSide, string> = {
  buy: "BUY",
  sell: "SELL",
};

/** Zamrożony podzbiór specyfikacji instrumentu zapisany w transakcji - patrz InstrumentSnapshot w Rust. */
export interface InstrumentSnapshot {
  display_symbol: string;
  source_symbol: string;
  description: string;
  category: string;
  instrument_version_id: string;
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
}

/** Dane emocjonalne jednego z trzech momentów transakcji (przed/w trakcie/po) - wielokrotny
 * wybór stanu + natężenie 1-5 + notatka, z jawną flagą "nie uzupełniono" odróżniającą świadomy
 * brak danych od zwykłego pustego formularza. Patrz domain::trade_emotions::MomentEmotion. */
export interface MomentEmotion {
  state_ids: string[];
  intensity: number | null;
  note: string | null;
  not_filled: boolean;
}

export function blankMomentEmotion(): MomentEmotion {
  return { state_ids: [], intensity: null, note: null, not_filled: true };
}

export interface TradeEmotions {
  before: MomentEmotion;
  during: MomentEmotion;
  after: MomentEmotion;
}

export function blankTradeEmotions(): TradeEmotions {
  return {
    before: blankMomentEmotion(),
    during: blankMomentEmotion(),
    after: blankMomentEmotion(),
  };
}

/** Stan jednej pozycji checklisty - dla zasad wejścia czytany jako Spełniona/Niespełniona/Nie
 * dotyczy, dla zasad zarządzania jako Wykonana/Niewykonana/Nie dotyczy. Niespełniona wymagana
 * zasada nie blokuje zapisu, tylko oznacza naruszenie planu. Patrz
 * domain::strategy_checklist::ChecklistStatus. */
export type ChecklistStatus = "fulfilled" | "unfulfilled" | "not_applicable";

/** Zamrożona pozycja checklisty - niesie nazwę/required wprost, więc późniejsza edycja/usunięcie
 * zasady w definicji strategii nigdy nie zmienia już zapisanej historycznej checklisty. */
export interface ChecklistItem {
  rule_id: string;
  name: string;
  required: boolean;
  status: ChecklistStatus;
}

/** Migawka checklisty zasad strategii z momentu jej wyboru na transakcji (sekcja "Checklist w
 * transakcji") - świeża przy zmianie strategii na inną, zachowana bez zmian gdy strategia się
 * nie zmienia (nawet jeśli w międzyczasie zmieniono jej definicję). */
export interface StrategyChecklist {
  entry: ChecklistItem[];
  management: ChecklistItem[];
}

export function blankStrategyChecklist(): StrategyChecklist {
  return { entry: [], management: [] };
}

/**
 * Wszystkie pola liczbowe (kwoty, wolumen, ceny) są typu string - to Decimal z backendu Rust,
 * nigdy nie parsować przez parseFloat/Number() do dalszych obliczeń, tylko do wyświetlenia.
 */
export interface Trade {
  id: string;
  account_id: string;
  display_number: number;
  instrument_id: string | null;
  instrument_spec_snapshot: InstrumentSnapshot | null;
  strategy_id: string | null;
  strategy_snapshot: StrategySnapshot | null;
  status: TradeStatus;
  side: TradeSide;
  opened_at: string | null;
  closed_at: string | null;
  interval_id: string | null;
  /** Zamrożona etykieta interwału z momentu zapisu (np. "M15") - patrz doc-comment na
   * Trade::interval w Rust. Późniejsza zmiana/archiwizacja interwału na zarządzanej liście nie
   * zmienia już zapisanej historycznej etykiety. */
  interval: string | null;
  session: string | null;
  volume: string | null;
  entry_price: string | null;
  stop_loss: string | null;
  take_profit: string | null;
  exit_price: string | null;
  commission: string;
  swap: string;
  other_fees: string;
  conversion_rate: string | null;
  gross_pnl: string | null;
  net_pnl: string | null;
  pnl_points: string | null;
  pnl_percent: string | null;
  pnl_r: string | null;
  risk_amount: string | null;
  risk_percent: string | null;
  plan_before: string | null;
  management_notes: string | null;
  post_trade_summary: string | null;
  conclusion: string | null;
  tags: string[];
  plan_adherence_rating: number | null;
  pnl_source: PnlSource;
  pnl_override_reason: string | null;
  emotions: TradeEmotions | null;
  checklist: StrategyChecklist | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TradeInput {
  account_id: string;
  instrument_id: string | null;
  strategy_id: string | null;
  side: TradeSide;
  opened_at: string | null;
  closed_at: string | null;
  interval_id: string | null;
  session: string | null;
  volume: string | null;
  entry_price: string | null;
  stop_loss: string | null;
  take_profit: string | null;
  exit_price: string | null;
  commission: string;
  swap: string;
  other_fees: string;
  conversion_rate: string | null;
  plan_before: string | null;
  management_notes: string | null;
  post_trade_summary: string | null;
  conclusion: string | null;
  plan_adherence_rating: number | null;
  emotions: TradeEmotions | null;
  checklist: StrategyChecklist | null;
}

/** Saldo konta przed/po tej konkretnej transakcji + aktualne saldo konta (sekcja "Saldo
 * przed/po/aktualne") - patrz application::trades::TradeBalanceContext w Rust. */
export interface TradeBalanceContext {
  balance_before: string;
  balance_after: string;
  current_balance: string;
}

/** Jedna zmiana pola w dzienniku edycji transakcji - patrz domain::trade_audit::FieldChange. */
export interface FieldChange {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

/** Wpis lokalnego dziennika zmian transakcji (sekcja "Tryb odczytu i przycisk Edytuj") - jeden
 * wpis na zapisaną edycję z realnie zmienionymi polami. */
export interface TradeAuditEntry {
  id: string;
  trade_id: string;
  changed_at: string;
  changes: FieldChange[];
}

/** Wynik silnika przeliczeń (domain::trade_calculations) - podgląd na żywo w formularzu. */
export interface TradeCalculation {
  pnl_points: string | null;
  gross_pnl: string | null;
  net_pnl: string | null;
  pnl_percent: string | null;
  pnl_r: string | null;
  risk_amount: string | null;
  risk_percent: string | null;
  reward_amount: string | null;
  rr_planned: string | null;
  requires_conversion_rate: boolean;
}
