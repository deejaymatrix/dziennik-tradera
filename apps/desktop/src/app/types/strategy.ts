export interface Strategy {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  entry_rules: string | null;
  management_rules: string | null;
  exit_rules: string | null;
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
  entry_rules: string | null;
  management_rules: string | null;
  exit_rules: string | null;
  tags: string[];
}

/** Migawka strategii zamrożona w transakcji w momencie jej utworzenia - patrz app/types/trade.ts. */
export interface StrategySnapshot {
  strategy_id: string;
  name: string;
  color: string | null;
}
