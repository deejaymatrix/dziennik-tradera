/**
 * Wszystkie kwoty i wskaźniki liczbowe są typu string - to Decimal z backendu Rust (liczony
 * raz, w Rust, nigdy przeliczany od nowa we frontendzie). Tu tylko formatujemy do wyświetlenia.
 */
export interface TradeStats {
  total_trades: number;
  open_trades: number;
  draft_trades: number;
  closed_trades: number;
  win_count: number;
  loss_count: number;
  breakeven_count: number;
  win_rate: string | null;
  gross_profit: string;
  gross_loss: string;
  net_pnl: string;
  profit_factor: string | null;
  expectancy: string | null;
  average_win: string | null;
  average_loss: string | null;
  average_r: string | null;
  best_trade: string | null;
  worst_trade: string | null;
}

export interface EquityPoint {
  closed_at: string;
  net_pnl: string;
  cumulative_net_pnl: string;
}

/** `date` to YYYY-MM-DD (serializacja chrono::NaiveDate). */
export interface DailyPnl {
  date: string;
  net_pnl: string;
  trade_count: number;
}

export interface GroupBreakdown {
  key: string;
  label: string;
  trade_count: number;
  win_count: number;
  loss_count: number;
  win_rate: string | null;
  net_pnl: string;
}

export interface AccountReport {
  stats: TradeStats;
  equity_curve: EquityPoint[];
  calendar: DailyPnl[];
  by_strategy: GroupBreakdown[];
  by_instrument: GroupBreakdown[];
}
