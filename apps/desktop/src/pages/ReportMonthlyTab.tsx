import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatMinutes, formatPercent } from "../app/reportFormat";
import type { FilteredReport } from "../app/types/report";
import { BreakdownTable } from "./BreakdownTable";
import { ChartCard } from "./ChartCard";
import { GroupBarChart } from "./GroupBarChart";
import { StatCard } from "./StatCard";
import styles from "./ReportsPage.module.css";

export interface ReportMonthlyTabProps {
  report: FilteredReport;
  currency: string;
}

export function ReportMonthlyTab({ report, currency }: ReportMonthlyTabProps): ReactElement {
  return (
    <div className={styles.tabContent}>
      <div className={styles.statsGrid}>
        <StatCard
          label="Wynik netto"
          value={formatMoney(report.stats.net_pnl, currency)}
          tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
        />
        <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
        <StatCard
          label="Maks. obsunięcie"
          value={formatMoney(report.stats.max_drawdown ?? "0", currency)}
        />
        <StatCard
          label="Śr. czas trwania"
          value={formatMinutes(report.stats.average_trade_duration_minutes)}
        />
      </div>
      <ChartCard title="Wynik miesięczny">
        <GroupBarChart rows={report.monthly} currency={currency} />
      </ChartCard>
      <ChartCard title="Wynik miesięczny - szczegóły">
        <BreakdownTable rows={report.monthly} currency={currency} />
      </ChartCard>
    </div>
  );
}
