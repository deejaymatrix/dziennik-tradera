export interface TradingRuleCategory {
  id: string;
  name: string;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TradingRule {
  id: string;
  category_id: string;
  question: string;
  answer: string | null;
  is_builtin: boolean;
  template_question: string | null;
  hidden: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TradingRulesState {
  categories: TradingRuleCategory[];
  rules: TradingRule[];
}

export interface TradingRuleCategoryWrite {
  id: string | null;
  name: string;
}

export interface TradingRuleWrite {
  id: string | null;
  category_index: number;
  question: string;
  answer: string | null;
  hidden: boolean;
  archived: boolean;
}

export interface TradingRulesWrite {
  categories: TradingRuleCategoryWrite[];
  rules: TradingRuleWrite[];
}

/** Ta sama normalizacja co `domain::trading_rules::normalize_question` po stronie Rust -
 * frontend ostrzega na żywo, backend jest autorytatywny przy zapisie. */
export function normalizeQuestion(question: string): string {
  return question.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}
