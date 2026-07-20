import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatNumber, formatPercent } from "../app/reportFormat";
import type { AccountWithBalance } from "../app/types/account";
import type { AccountComparisonRow } from "../app/types/report";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { ChartCard } from "./ChartCard";
import { GroupBarChart } from "./GroupBarChart";
import styles from "./ReportsPage.module.css";
import tableRowStyles from "./BreakdownTable.module.css";

export interface ReportAccountComparisonTabProps {
  rows: AccountComparisonRow[] | null;
  accounts: AccountWithBalance[];
}

function accountName(accounts: AccountWithBalance[], accountId: string): string {
  return accounts.find((a) => a.id === accountId)?.name ?? accountId;
}

function pnlClass(value: string): string {
  return (Number(value) >= 0 ? tableRowStyles.profit : tableRowStyles.loss) ?? "";
}

interface LeaderCardProps {
  label: string;
  accountLabel: string;
  value: string;
}

function LeaderCard({ label, accountLabel, value }: LeaderCardProps): ReactElement {
  return (
    <div className={styles.leaderCard}>
      <span className={styles.leaderLabel}>{label}</span>
      <span className={styles.leaderValue}>
        {accountLabel} · {value}
      </span>
    </div>
  );
}

/**
 * Porównanie kont pod kątem wyników, kosztów, aktywności i stabilności (Faza 9, wzorzec "Raport
 * Kont"). Statystyki liczone niezależnie dla każdego konta, zawężone tym samym filtrem
 * (instrument/strategia/interwał/rok/miesiąc/kierunek) co reszta zakładki - poza kontem, bo to
 * właśnie konta są tu porównywane.
 */
export function ReportAccountComparisonTab({
  rows,
  accounts,
}: ReportAccountComparisonTabProps): ReactElement {
  if (rows === null) {
    return <Skeleton height="12rem" />;
  }
  if (rows.length === 0) {
    return <p className={styles.empty}>Brak kont do porównania.</p>;
  }

  const sorted = [...rows].sort((a, b) => Number(b.stats.net_pnl) - Number(a.stats.net_pnl));

  const bestByPnl = sorted[0];
  const bestByWinRate = [...rows].sort(
    (a, b) => Number(b.stats.win_rate ?? -1) - Number(a.stats.win_rate ?? -1),
  )[0];
  const highestCommission = [...rows].sort(
    (a, b) => Number(b.stats.total_commission) - Number(a.stats.total_commission),
  )[0];
  const biggestDrawdown = [...rows].sort(
    (a, b) => Number(b.period_balance.max_drawdown) - Number(a.period_balance.max_drawdown),
  )[0];
  const mostActive = [...rows].sort((a, b) => b.stats.closed_trades - a.stats.closed_trades)[0];
  const bestExpectancy = [...rows].sort(
    (a, b) => Number(b.stats.expectancy ?? -Infinity) - Number(a.stats.expectancy ?? -Infinity),
  )[0];

  const currencyOf = (accountId: string): string | undefined =>
    accounts.find((a) => a.id === accountId)?.currency;

  const pnlChartRows = sorted.map((row) => ({
    key: row.account_id,
    label: accountName(accounts, row.account_id),
    trade_count: row.stats.closed_trades,
    win_count: row.stats.win_count,
    loss_count: row.stats.loss_count,
    win_rate: row.stats.win_rate,
    net_pnl: row.stats.net_pnl,
  }));

  return (
    <div className={styles.tabContent}>
      {bestByPnl &&
        bestByWinRate &&
        highestCommission &&
        biggestDrawdown &&
        mostActive &&
        bestExpectancy && (
          <div className={styles.leaderboard}>
            <LeaderCard
              label="Najlepsze konto wg P&L"
              accountLabel={accountName(accounts, bestByPnl.account_id)}
              value={formatMoney(bestByPnl.stats.net_pnl, currencyOf(bestByPnl.account_id))}
            />
            <LeaderCard
              label="Najwyższy win rate"
              accountLabel={accountName(accounts, bestByWinRate.account_id)}
              value={formatPercent(bestByWinRate.stats.win_rate)}
            />
            <LeaderCard
              label="Najwyższa prowizja"
              accountLabel={accountName(accounts, highestCommission.account_id)}
              value={formatMoney(
                highestCommission.stats.total_commission,
                currencyOf(highestCommission.account_id),
              )}
            />
            <LeaderCard
              label="Największy drawdown"
              accountLabel={accountName(accounts, biggestDrawdown.account_id)}
              value={formatMoney(
                biggestDrawdown.period_balance.max_drawdown,
                currencyOf(biggestDrawdown.account_id),
              )}
            />
            <LeaderCard
              label="Najaktywniejsze konto"
              accountLabel={accountName(accounts, mostActive.account_id)}
              value={String(mostActive.stats.closed_trades)}
            />
            <LeaderCard
              label="Najlepszy śr. wynik/trade"
              accountLabel={accountName(accounts, bestExpectancy.account_id)}
              value={formatMoney(
                bestExpectancy.stats.expectancy ?? "0",
                currencyOf(bestExpectancy.account_id),
              )}
            />
          </div>
        )}

      <ChartCard title="Porównanie kont">
        <Table>
          <thead>
            <tr>
              <th>Konto</th>
              <th className={tableStyles.numeric}>Transakcji</th>
              <th className={tableStyles.numeric}>Zyskowne</th>
              <th className={tableStyles.numeric}>Stratne</th>
              <th className={tableStyles.numeric}>Win rate</th>
              <th className={tableStyles.numeric}>P&L netto</th>
              <th className={tableStyles.numeric}>Łączna prowizja</th>
              <th className={tableStyles.numeric}>Śr. wynik/trade</th>
              <th className={tableStyles.numeric}>Saldo początkowe</th>
              <th className={tableStyles.numeric}>Saldo końcowe</th>
              <th className={tableStyles.numeric}>Zwrot</th>
              <th className={tableStyles.numeric}>Max DD</th>
              <th className={tableStyles.numeric}>Najlepsza</th>
              <th className={tableStyles.numeric}>Najgorsza</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const currency = currencyOf(row.account_id);
              return (
                <tr key={row.account_id}>
                  <td>{accountName(accounts, row.account_id)}</td>
                  <td className={tableStyles.numeric}>{row.stats.closed_trades}</td>
                  <td className={tableStyles.numeric}>{row.stats.win_count}</td>
                  <td className={tableStyles.numeric}>{row.stats.loss_count}</td>
                  <td className={tableStyles.numeric}>{formatPercent(row.stats.win_rate)}</td>
                  <td className={[tableStyles.numeric, pnlClass(row.stats.net_pnl)].join(" ")}>
                    {formatMoney(row.stats.net_pnl, currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.stats.total_commission, currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.stats.expectancy ?? "0", currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.period_balance.starting_balance, currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.period_balance.ending_balance, currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatPercent(row.period_balance.return_percent)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.period_balance.max_drawdown, currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.stats.best_trade ?? "0", currency)}
                  </td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(row.stats.worst_trade ?? "0", currency)}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>
                <strong>Łącznie</strong>
              </td>
              <td className={tableStyles.numeric}>
                {sorted.reduce((sum, r) => sum + r.stats.closed_trades, 0)}
              </td>
              <td className={tableStyles.numeric}>
                {sorted.reduce((sum, r) => sum + r.stats.win_count, 0)}
              </td>
              <td className={tableStyles.numeric}>
                {sorted.reduce((sum, r) => sum + r.stats.loss_count, 0)}
              </td>
              <td className={tableStyles.numeric}>—</td>
              <td className={tableStyles.numeric}>
                {formatNumber(String(sorted.reduce((sum, r) => sum + Number(r.stats.net_pnl), 0)))}
              </td>
              <td className={tableStyles.numeric}>
                {formatNumber(
                  String(sorted.reduce((sum, r) => sum + Number(r.stats.total_commission), 0)),
                )}
              </td>
              <td colSpan={6}></td>
            </tr>
          </tbody>
        </Table>
      </ChartCard>

      <div className={styles.chartsGrid}>
        <ChartCard
          title="P&L netto per konto"
          {...(new Set(accounts.map((a) => a.currency)).size > 1
            ? { hint: "Konta mają różne waluty - słupki nie są bezpośrednio porównywalne." }
            : {})}
        >
          <GroupBarChart rows={pnlChartRows} currency="" />
        </ChartCard>
        <ChartCard title="Win rate per konto">
          <GroupBarChart
            rows={sorted.map((r) => ({
              key: r.account_id,
              label: accountName(accounts, r.account_id),
              trade_count: r.stats.closed_trades,
              win_count: r.stats.win_count,
              loss_count: r.stats.loss_count,
              win_rate: r.stats.win_rate,
              net_pnl: r.stats.win_rate ?? "0",
            }))}
            currency="%"
          />
        </ChartCard>
        <ChartCard title="Zwrot per konto">
          <GroupBarChart
            rows={sorted.map((r) => ({
              key: r.account_id,
              label: accountName(accounts, r.account_id),
              trade_count: r.stats.closed_trades,
              win_count: r.stats.win_count,
              loss_count: r.stats.loss_count,
              win_rate: r.stats.win_rate,
              net_pnl: r.period_balance.return_percent ?? "0",
            }))}
            currency="%"
          />
        </ChartCard>
        <ChartCard title="Max DD per konto">
          <GroupBarChart
            rows={sorted.map((r) => ({
              key: r.account_id,
              label: accountName(accounts, r.account_id),
              trade_count: r.stats.closed_trades,
              win_count: r.stats.win_count,
              loss_count: r.stats.loss_count,
              win_rate: r.stats.win_rate,
              net_pnl: r.period_balance.max_drawdown_percent ?? "0",
            }))}
            currency="%"
          />
        </ChartCard>
      </div>
    </div>
  );
}
