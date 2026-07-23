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
  average_trade_duration_minutes: number | null;
  max_drawdown: string | null;
  total_commission: string;
  /** Pozycje częściowo zamknięte - wciąż otwarte, ale z już zrealizowaną częścią wyniku. */
  partially_closed_trades: number;
  /** Wynik zrealizowany na tych pozycjach. Trzymany ODDZIELNIE od `net_pnl` i nieliczony do
   * żadnej statystyki transakcji zamkniętych - inaczej ta sama kwota policzyłaby się drugi raz
   * w chwili domknięcia pozycji (sekcja 6.9). */
  partially_realized_pnl: string;
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
  win_count: number;
  loss_count: number;
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

/** Jeden wiersz listy TOP N transakcji - patrz domain::trade_stats::TopTradeRow. */
export interface TopTradeRow {
  trade_id: string;
  display_number: number;
  opened_at: string | null;
  instrument_label: string;
  strategy_label: string;
  side: "buy" | "sell";
  net_pnl: string;
}

/** Saldo i przepływy gotówkowe w okresie - patrz domain::balance::PeriodBalanceSummary. */
export interface PeriodBalanceSummary {
  starting_balance: string;
  ending_balance: string;
  net_cash_flow: string;
  return_percent: string | null;
  max_drawdown: string;
  max_drawdown_percent: string | null;
}

/** Jeden przedział histogramu wyniku netto - patrz domain::trade_stats::PnlDistributionBucket. */
export interface PnlDistributionBucket {
  range_label: string;
  count: number;
}

export interface AccountReport {
  stats: TradeStats;
  equity_curve: EquityPoint[];
  calendar: DailyPnl[];
  by_strategy: GroupBreakdown[];
  by_instrument: GroupBreakdown[];
}

/** Wspólny filtr wszystkich podraportów zakładki "Raporty" - patrz application::reports::
 * ReportFilter. `null` na każdym polu poza `account_id` oznacza brak zawężenia po tym wymiarze. */
export interface ReportFilter {
  account_id: string;
  instrument_id: string | null;
  strategy_id: string | null;
  interval_id: string | null;
  side: "buy" | "sell" | null;
  year: number | null;
  month: number | null;
}

/** Ten sam zestaw wymiarów co ReportFilter, ale bez konta - patrz application::reports::
 * AccountComparisonFilter. */
export interface AccountComparisonFilter {
  instrument_id: string | null;
  strategy_id: string | null;
  interval_id: string | null;
  side: "buy" | "sell" | null;
  year: number | null;
  month: number | null;
}

export interface FilteredReport {
  stats: TradeStats;
  equity_curve: EquityPoint[];
  calendar: DailyPnl[];
  by_strategy: GroupBreakdown[];
  by_instrument: GroupBreakdown[];
  by_interval: GroupBreakdown[];
  monthly: GroupBreakdown[];
  yearly: GroupBreakdown[];
  quarterly: GroupBreakdown[];
  calendar_months: GroupBreakdown[];
  by_day_of_week: GroupBreakdown[];
  by_four_hour: GroupBreakdown[];
  by_side: GroupBreakdown[];
  top_best_trades: TopTradeRow[];
  top_worst_trades: TopTradeRow[];
  pnl_distribution: PnlDistributionBucket[];
  month_calendar: DailyPnl[];
  period_balance: PeriodBalanceSummary;
}

export interface AccountComparisonRow {
  account_id: string;
  stats: TradeStats;
  period_balance: PeriodBalanceSummary;
}
