export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  category: string | null;
  decimal_places: number;
  tick_size: string;
  tick_value_per_lot: string;
  contract_size: string;
  pip_size: string;
  quote_currency: string;
  settlement_currency: string;
  min_lot: string;
  lot_step: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstrumentSpecInput {
  symbol: string;
  name: string;
  category: string | null;
  decimal_places: number;
  tick_size: string;
  tick_value_per_lot: string;
  contract_size: string;
  pip_size: string;
  quote_currency: string;
  settlement_currency: string;
  min_lot: string;
  lot_step: string;
}
