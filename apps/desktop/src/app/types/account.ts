/**
 * Kwoty (initial_balance, balance) są typu string - to reprezentacja Decimal z
 * backendu Rust (rust_decimal, serializowany jako string), nigdy nie parsować
 * przez parseFloat/Number() do obliczeń; do wyświetlania i przekazywania z
 * powrotem do backendu wystarczy string.
 */
export interface Account {
  id: string;
  name: string;
  description: string | null;
  account_type: string | null;
  currency: string;
  initial_balance: string;
  /** Szablon instrumentów tego konta. Wiele kont może wskazywać ten sam szablon. */
  template_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface AccountWithBalance extends Account {
  balance: string;
}

export interface NewAccountInput {
  name: string;
  description: string | null;
  account_type: string | null;
  currency: string;
  initial_balance: string;
}

export interface UpdateAccountInput {
  name: string;
  description: string | null;
  account_type: string | null;
  currency: string;
}
