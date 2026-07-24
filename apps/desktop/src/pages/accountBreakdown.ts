import type { AccountWithBalance } from "../app/types/account";
import type { AccountComparisonRow, GroupBreakdown } from "../app/types/report";

/** Zamienia surowe wiersze `compare_accounts_report` na `GroupBreakdown` dla wykresu "Wynik wg
 * konta" w `ReportStrategyTab` - nazwa konta ma fallback do samego `account_id`, gdy konto
 * zniknęło z listy `accounts` między zapytaniami (np. zarchiwizowane/usunięte w międzyczasie).
 * Osobny plik (nie eksport z komponentu) - ten sam wzorzec co `barShape.tsx`/`cumulativeSeries.ts`,
 * żeby nie odpalać ostrzeżenia `react-refresh/only-export-components` i żeby dało się to
 * przetestować bez renderowania wykresu Recharts w jsdom (`ResponsiveContainer` nie ma tam
 * layoutu/`ResizeObserver`). */
export function toAccountBreakdown(
  rows: AccountComparisonRow[],
  accounts: AccountWithBalance[],
): GroupBreakdown[] {
  return rows.map((row) => ({
    key: row.account_id,
    label: accounts.find((a) => a.id === row.account_id)?.name ?? row.account_id,
    trade_count: row.stats.closed_trades,
    win_count: row.stats.win_count,
    loss_count: row.stats.loss_count,
    win_rate: row.stats.win_rate,
    net_pnl: row.stats.net_pnl,
  }));
}
