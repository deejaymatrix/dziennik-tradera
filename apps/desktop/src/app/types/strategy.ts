/** Jedna zasada wejścia - patrz domain::strategy::EntryRule. `required` odróżnia zasady
 * wymagane od opcjonalnych na checkliście transakcji; `archived` chowa zasadę z aktywnej listy
 * bez usuwania. */
export interface EntryRule {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  archived: boolean;
  sort_order: number;
}

/** Zasada zarządzania pozycją - ten sam wzorzec co EntryRule, bez podziału wymagane/opcjonalne. */
export interface ManagementRule {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  sort_order: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  entry_rules: EntryRule[];
  management_rules: ManagementRule[];
  /** Wolny tekst sprzed strukturalizacji zasad - wyłącznie do wglądu, nowy model go nie edytuje. */
  legacy_entry_rules_text: string | null;
  legacy_management_rules_text: string | null;
  /** Zasady wyjścia usunięte z aktywnego modelu - stary wolny tekst zachowany do wglądu. */
  legacy_exit_rules_text: string | null;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface StrategyInput {
  name: string;
  description: string | null;
  color: string | null;
  entry_rules: EntryRule[];
  management_rules: ManagementRule[];
  tags: string[];
}

/** Migawka strategii zamrożona w transakcji w momencie jej utworzenia - patrz app/types/trade.ts. */
export interface StrategySnapshot {
  strategy_id: string;
  name: string;
  color: string | null;
}
