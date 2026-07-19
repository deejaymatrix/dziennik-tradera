import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatNumber, formatPercent } from "../app/reportFormat";
import type { AccountWithBalance } from "../app/types/account";
import type { AccountComparisonRow } from "../app/types/report";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { ChartCard } from "./ChartCard";
import styles from "./ReportsPage.module.css";
import tableRowStyles from "./BreakdownTable.module.css";

export interface ReportAccountComparisonTabProps {
  rows: AccountComparisonRow[] | null;
  accounts: AccountWithBalance[];
}

/**
 * Porównanie kont (Faza 9) - statystyki liczone niezależnie dla każdego konta (całościowe, nie
 * zawężone bieżącym filtrem - konta mogą mieć różne waluty, więc jeden wspólny wykres słupkowy
 * mieszający kwoty w różnych walutach byłby wprowadzający w błąd; zamiast tego czytelna tabela
 * z walutą przy każdym koncie).
 */
export function ReportAccountComparisonTab({
  rows,
  accounts,
}: ReportAccountComparisonTabProps): ReactElement {
  if (rows === null) {
    return <Skeleton height="12rem" />;
  }

  const sorted = [...rows].sort((a, b) => Number(b.stats.net_pnl) - Number(a.stats.net_pnl));

  return (
    <div className={styles.tabContent}>
      <ChartCard
        title="Porównanie kont"
        hint="Statystyki liczone dla całej historii każdego konta."
      >
        {sorted.length === 0 ? (
          <p className={tableRowStyles.empty}>Brak kont do porównania.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Konto</th>
                <th className={tableStyles.numeric}>Transakcje</th>
                <th className={tableStyles.numeric}>Win rate</th>
                <th className={tableStyles.numeric}>Profit factor</th>
                <th className={tableStyles.numeric}>Wynik netto</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const account = accounts.find((a) => a.id === row.account_id);
                return (
                  <tr key={row.account_id}>
                    <td>{account ? `${account.name} (${account.currency})` : row.account_id}</td>
                    <td className={tableStyles.numeric}>{row.stats.closed_trades}</td>
                    <td className={tableStyles.numeric}>{formatPercent(row.stats.win_rate)}</td>
                    <td className={tableStyles.numeric}>{formatNumber(row.stats.profit_factor)}</td>
                    <td
                      className={[
                        tableStyles.numeric,
                        Number(row.stats.net_pnl) >= 0
                          ? tableRowStyles.profit
                          : tableRowStyles.loss,
                      ].join(" ")}
                    >
                      {formatMoney(row.stats.net_pnl, account?.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </ChartCard>
    </div>
  );
}
