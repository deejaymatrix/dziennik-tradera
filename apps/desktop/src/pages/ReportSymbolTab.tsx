import type { ReactElement } from "react";
import { formatPercent, formatMinutes } from "../app/reportFormat";
import type { FilteredReport } from "../app/types/report";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ChartCard } from "./ChartCard";
import { GroupBarChart } from "./GroupBarChart";
import { StatCard } from "./StatCard";
import styles from "./ReportsPage.module.css";

export interface ReportSymbolTabProps {
  report: FilteredReport | null;
  currency: string;
  selectedLabel: string | undefined;
}

/**
 * Raport Symbolu - jak dany instrument zachowuje się pod różnymi kątami: strategie, kierunek,
 * dzień tygodnia, interwał. Wymaga wybrania jednego instrumentu w pasku filtrów (ten sam
 * wymóg co w arkuszu wzorcowym - bez wyboru nie ma czego pokazać).
 */
export function ReportSymbolTab({
  report,
  currency,
  selectedLabel,
}: ReportSymbolTabProps): ReactElement {
  if (!report) {
    return (
      <EmptyState
        title="Najpierw wybierz instrument"
        description="Ten raport pokazuje, jak zachowuje się konkretny symbol: które strategie, kierunki, dni tygodnia i interwały dawały na nim najlepszy lub najgorszy wynik."
      />
    );
  }

  return (
    <div className={styles.tabContent}>
      <h3 className={styles.dimensionLabel}>{selectedLabel}</h3>
      <div className={styles.statsGrid}>
        <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
        <StatCard
          label="Śr. czas w trade"
          value={formatMinutes(report.stats.average_trade_duration_minutes)}
        />
      </div>

      <div className={styles.chartsGrid}>
        <ChartCard title="Wynik wg strategii">
          <GroupBarChart rows={report.by_strategy} currency={currency} />
        </ChartCard>
        <ChartCard title="P&L BUY / SELL">
          <GroupBarChart rows={report.by_side} currency={currency} />
        </ChartCard>
        <ChartCard title="P&L wg dnia tygodnia">
          <GroupBarChart rows={report.by_day_of_week} currency={currency} />
        </ChartCard>
        <ChartCard title="Wynik wg interwału">
          <GroupBarChart rows={report.by_interval} currency={currency} />
        </ChartCard>
      </div>

      <ChartCard title="Opis wykresów">
        <ul className={styles.helpList}>
          <li>
            Wynik wg strategii pokazuje, które strategie na wybranym symbolu dawały najlepszy i
            najgorszy wynik netto.
          </li>
          <li>P&L BUY / SELL pokazuje, czy dany symbol lepiej pracował na longach czy shortach.</li>
          <li>
            P&L wg dnia tygodnia pokazuje, w które dni tygodnia handel na wybranym symbolu był
            najmocniejszy lub najsłabszy.
          </li>
          <li>
            Wynik wg interwału pokazuje, na jakich TF-ach wybrany symbol dawał najlepsze i najgorsze
            rezultaty.
          </li>
        </ul>
      </ChartCard>
    </div>
  );
}
