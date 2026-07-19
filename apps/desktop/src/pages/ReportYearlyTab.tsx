import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatNumber, formatPercent } from "../app/reportFormat";
import type { FilteredReport } from "../app/types/report";
import { BreakdownTable } from "./BreakdownTable";
import { ChartCard } from "./ChartCard";
import { GroupBarChart } from "./GroupBarChart";
import { StatCard } from "./StatCard";
import styles from "./ReportsPage.module.css";

export interface ReportYearlyTabProps {
  report: FilteredReport;
  currency: string;
}

export function ReportYearlyTab({ report, currency }: ReportYearlyTabProps): ReactElement {
  return (
    <div className={styles.tabContent}>
      <div className={styles.statsGrid}>
        <StatCard
          label="Wynik netto"
          value={formatMoney(report.stats.net_pnl, currency)}
          tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
        />
        <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
        <StatCard label="Profit factor" value={formatNumber(report.stats.profit_factor)} />
        <StatCard label="Zamknięte transakcje" value={String(report.stats.closed_trades)} />
      </div>
      <ChartCard title="Wynik roczny">
        <GroupBarChart rows={report.yearly} currency={currency} />
      </ChartCard>
      <ChartCard title="Wynik roczny - szczegóły">
        <BreakdownTable rows={report.yearly} currency={currency} />
      </ChartCard>
    </div>
  );
}
