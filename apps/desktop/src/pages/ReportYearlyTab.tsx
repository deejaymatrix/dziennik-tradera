import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatNumber, formatPercent } from "../app/reportFormat";
import type { FilteredReport, GroupBreakdown } from "../app/types/report";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { ChartCard } from "./ChartCard";
import { CumulativeLineChart } from "./CumulativeLineChart";
import { GroupBarChart } from "./GroupBarChart";
import { SimplePieChart } from "./SimplePieChart";
import { StatCard } from "./StatCard";
import styles from "./ReportsPage.module.css";
import tableRowStyles from "./BreakdownTable.module.css";

export interface ReportYearlyTabProps {
  report: FilteredReport;
  currency: string;
  year: string;
}

function bestOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => Number(b.net_pnl) - Number(a.net_pnl))[0];
}

function worstOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => Number(a.net_pnl) - Number(b.net_pnl))[0];
}

function mostActiveOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => b.trade_count - a.trade_count)[0];
}

function leastActiveOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => a.trade_count - b.trade_count)[0];
}

function highestWinRateOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => Number(b.win_rate ?? -1) - Number(a.win_rate ?? -1))[0];
}

export function ReportYearlyTab({ report, currency, year }: ReportYearlyTabProps): ReactElement {
  const months = report.calendar_months;
  const positiveMonths = months.filter((m) => Number(m.net_pnl) > 0).length;
  const negativeMonths = months.filter((m) => Number(m.net_pnl) < 0).length;
  const flatMonths = months.length - positiveMonths - negativeMonths;

  const bestMonth = bestOf(months);
  const worstMonth = worstOf(months);
  const bestQuarter = bestOf(report.quarterly);
  const worstQuarter = worstOf(report.quarterly);
  const mostActiveMonth = mostActiveOf(months);
  const quietestMonth = leastActiveOf(months);
  const bestWinRateMonth = highestWinRateOf(months);
  const bestStrategy = bestOf(report.by_strategy);
  const worstStrategy = worstOf(report.by_strategy);
  const bestInstrument = bestOf(report.by_instrument);
  const worstInstrument = worstOf(report.by_instrument);

  const averageMonthlyPnl = String(months.reduce((sum, m) => sum + Number(m.net_pnl), 0) / 12);
  const averageTradesPerMonth = (report.stats.closed_trades / 12).toFixed(2);

  return (
    <div className={styles.tabContent}>
      <h3 className={styles.dimensionLabel}>Rok {year}</h3>

      <div className={styles.statsGrid}>
        <StatCard label="Liczba transakcji" value={String(report.stats.closed_trades)} />
        <StatCard
          label="P&L netto roku"
          value={formatMoney(report.stats.net_pnl, currency)}
          tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
        />
        <StatCard label="Win rate roku" value={formatPercent(report.stats.win_rate)} />
        <StatCard
          label="Łączna prowizja"
          value={formatMoney(report.stats.total_commission, currency)}
        />
        {/* Osobno od "P&L netto roku" - patrz komentarz w ReportMonthlyTab (sekcja 6.9). */}
        {report.stats.partially_closed_trades > 0 && (
          <StatCard
            label={`Zrealizowane na pozycjach otwartych (${report.stats.partially_closed_trades})`}
            value={formatMoney(report.stats.partially_realized_pnl, currency)}
            tone={Number(report.stats.partially_realized_pnl) >= 0 ? "profit" : "loss"}
          />
        )}
        <StatCard
          label="Saldo początkowe roku"
          value={formatMoney(report.period_balance.starting_balance, currency)}
        />
        <StatCard
          label="Saldo końcowe roku"
          value={formatMoney(report.period_balance.ending_balance, currency)}
        />
        <StatCard
          label="Zwrot roczny"
          value={formatPercent(report.period_balance.return_percent)}
        />
        <StatCard label="Śr. miesięczny P&L" value={formatMoney(averageMonthlyPnl, currency)} />
        <StatCard label="Miesiące dodatnie" value={String(positiveMonths)} tone="profit" />
        <StatCard label="Miesiące ujemne" value={String(negativeMonths)} tone="loss" />
        <StatCard
          label="Max drawdown roku"
          value={formatMoney(report.period_balance.max_drawdown, currency)}
        />
        <StatCard label="Śr. RR roku" value={formatNumber(report.stats.average_r)} />
        <StatCard
          label="Najlepszy miesiąc"
          value={
            bestMonth ? `${bestMonth.label} · ${formatMoney(bestMonth.net_pnl, currency)}` : "—"
          }
        />
        <StatCard
          label="Najgorszy miesiąc"
          value={
            worstMonth ? `${worstMonth.label} · ${formatMoney(worstMonth.net_pnl, currency)}` : "—"
          }
        />
        <StatCard
          label="Najlepszy kwartał"
          value={
            bestQuarter
              ? `${bestQuarter.label} · ${formatMoney(bestQuarter.net_pnl, currency)}`
              : "—"
          }
        />
        <StatCard
          label="Najgorszy kwartał"
          value={
            worstQuarter
              ? `${worstQuarter.label} · ${formatMoney(worstQuarter.net_pnl, currency)}`
              : "—"
          }
        />
        <StatCard label="Śr. transakcji/miesiąc" value={averageTradesPerMonth} />
        <StatCard
          label="Najwyższy win rate (miesiąc)"
          value={
            bestWinRateMonth
              ? `${bestWinRateMonth.label} · ${formatPercent(bestWinRateMonth.win_rate)}`
              : "—"
          }
        />
      </div>

      <div className={styles.chartsGrid}>
        <ChartCard title="Miesięczny P&L netto" fullWidth>
          <GroupBarChart rows={months} currency={currency} />
        </ChartCard>
        <ChartCard title="Skumulowany P&L roku" fullWidth>
          <CumulativeLineChart rows={months} currency={currency} />
        </ChartCard>
        <ChartCard title="Win rate per miesiąc" fullWidth>
          <GroupBarChart
            rows={months.map((m) => ({ ...m, net_pnl: m.win_rate ?? "0" }))}
            currency="%"
          />
        </ChartCard>
        <ChartCard title="P&L netto per kwartał">
          <GroupBarChart rows={report.quarterly} currency={currency} />
        </ChartCard>
        <ChartCard title="Miesiące dodatnie / ujemne">
          <SimplePieChart
            slices={[
              { label: "Dodatnie", value: positiveMonths, color: "var(--color-profit)" },
              { label: "Ujemne", value: negativeMonths, color: "var(--color-loss)" },
              { label: "Bez wyniku", value: flatMonths, color: "var(--color-text-muted)" },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Liderzy roku">
        <dl className={styles.leaderboard}>
          <div className={styles.leaderCard}>
            <span className={styles.leaderLabel}>Najlepsza strategia</span>
            <span className={styles.leaderValue}>{bestStrategy?.label ?? "—"}</span>
          </div>
          <div className={styles.leaderCard}>
            <span className={styles.leaderLabel}>Najgorsza strategia</span>
            <span className={styles.leaderValue}>{worstStrategy?.label ?? "—"}</span>
          </div>
          <div className={styles.leaderCard}>
            <span className={styles.leaderLabel}>Najlepszy instrument</span>
            <span className={styles.leaderValue}>{bestInstrument?.label ?? "—"}</span>
          </div>
          <div className={styles.leaderCard}>
            <span className={styles.leaderLabel}>Najgorszy instrument</span>
            <span className={styles.leaderValue}>{worstInstrument?.label ?? "—"}</span>
          </div>
          <div className={styles.leaderCard}>
            <span className={styles.leaderLabel}>Najaktywniejszy miesiąc</span>
            <span className={styles.leaderValue}>
              {mostActiveMonth ? `${mostActiveMonth.label} (${mostActiveMonth.trade_count})` : "—"}
            </span>
          </div>
          <div className={styles.leaderCard}>
            <span className={styles.leaderLabel}>Najspokojniejszy miesiąc</span>
            <span className={styles.leaderValue}>
              {quietestMonth ? `${quietestMonth.label} (${quietestMonth.trade_count})` : "—"}
            </span>
          </div>
        </dl>
      </ChartCard>

      <ChartCard title="Miesiące roku">
        <Table>
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th className={tableStyles.numeric}>Transakcje</th>
              <th className={tableStyles.numeric}>Zyskowne</th>
              <th className={tableStyles.numeric}>Stratne</th>
              <th className={tableStyles.numeric}>Win rate</th>
              <th className={tableStyles.numeric}>P&L netto</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.key}>
                <td>{month.label}</td>
                <td className={tableStyles.numeric}>{month.trade_count}</td>
                <td className={tableStyles.numeric}>{month.win_count}</td>
                <td className={tableStyles.numeric}>{month.loss_count}</td>
                <td className={tableStyles.numeric}>{formatPercent(month.win_rate)}</td>
                <td
                  className={[
                    tableStyles.numeric,
                    Number(month.net_pnl) >= 0 ? tableRowStyles.profit : tableRowStyles.loss,
                  ].join(" ")}
                >
                  {formatMoney(month.net_pnl, currency)}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Łącznie</strong>
              </td>
              <td className={tableStyles.numeric}>
                {months.reduce((sum, m) => sum + m.trade_count, 0)}
              </td>
              <td className={tableStyles.numeric}>
                {months.reduce((sum, m) => sum + m.win_count, 0)}
              </td>
              <td className={tableStyles.numeric}>
                {months.reduce((sum, m) => sum + m.loss_count, 0)}
              </td>
              <td className={tableStyles.numeric}>—</td>
              <td className={tableStyles.numeric}>{formatMoney(report.stats.net_pnl, currency)}</td>
            </tr>
          </tbody>
        </Table>
      </ChartCard>

      <ChartCard title="Kwartały">
        <Table>
          <thead>
            <tr>
              <th>Kwartał</th>
              <th className={tableStyles.numeric}>Transakcje</th>
              <th className={tableStyles.numeric}>Win rate</th>
              <th className={tableStyles.numeric}>P&L netto</th>
            </tr>
          </thead>
          <tbody>
            {report.quarterly.map((quarter) => (
              <tr key={quarter.key}>
                <td>{quarter.label}</td>
                <td className={tableStyles.numeric}>{quarter.trade_count}</td>
                <td className={tableStyles.numeric}>{formatPercent(quarter.win_rate)}</td>
                <td
                  className={[
                    tableStyles.numeric,
                    Number(quarter.net_pnl) >= 0 ? tableRowStyles.profit : tableRowStyles.loss,
                  ].join(" ")}
                >
                  {formatMoney(quarter.net_pnl, currency)}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Łącznie</strong>
              </td>
              <td className={tableStyles.numeric}>
                {report.quarterly.reduce((sum, q) => sum + q.trade_count, 0)}
              </td>
              <td className={tableStyles.numeric}>—</td>
              <td className={tableStyles.numeric}>{formatMoney(report.stats.net_pnl, currency)}</td>
            </tr>
          </tbody>
        </Table>
      </ChartCard>
    </div>
  );
}
