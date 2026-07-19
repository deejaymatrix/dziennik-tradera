import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatMinutes, formatNumber, formatPercent } from "../app/reportFormat";
import type { FilteredReport, GroupBreakdown } from "../app/types/report";
import { Button } from "../ui/components/Button/Button";
import { BreakdownTable } from "./BreakdownTable";
import { ChartCard } from "./ChartCard";
import { EquityCurveChart } from "./EquityCurveChart";
import { GroupBarChart } from "./GroupBarChart";
import { StatCard } from "./StatCard";
import styles from "./ReportsPage.module.css";

export interface ReportDimensionTabProps {
  report: FilteredReport;
  currency: string;
  /** Dopełniacz, np. "instrumentu"/"strategii" - używany w tytule "Wynik wg ...". */
  dimensionLabel: string;
  /** Pełna, odmieniona podpowiedź pod wykresem rankingu, np. "...dla jednego instrumentu."/
   * "...dla jednej strategii." - różna odmiana rodzaju, więc składana przez wywołującego. */
  pickHint: string;
  selectedId: string;
  selectedLabel: string | undefined;
  breakdownRows: GroupBreakdown[];
  onSelect: (id: string) => void;
  onClear: () => void;
}

/**
 * Wspólny szablon podraportu "wg wymiaru" (Instrument/Strategia, Faza 9) - bez wybranej wartości
 * pokazuje ranking (wykres + tabela, klikalne wiersze), z wybraną wartością pokazuje szczegółowy
 * widok (KPI, krzywa kapitału, rozbicie po dniu tygodnia) scopowany do tej jednej wartości - sam
 * `report` już jest przefiltrowany po stronie backendu, więc nic tu nie trzeba przeliczać.
 */
export function ReportDimensionTab({
  report,
  currency,
  dimensionLabel,
  pickHint,
  selectedId,
  selectedLabel,
  breakdownRows,
  onSelect,
  onClear,
}: ReportDimensionTabProps): ReactElement {
  if (!selectedId) {
    return (
      <div className={styles.tabContent}>
        <ChartCard title={`Wynik wg ${dimensionLabel}`} hint={pickHint}>
          <GroupBarChart rows={breakdownRows} currency={currency} />
        </ChartCard>
        <ChartCard title="Szczegóły">
          <BreakdownTable rows={breakdownRows} currency={currency} onRowClick={onSelect} />
        </ChartCard>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.dimensionHeader}>
        <span className={styles.dimensionLabel}>{selectedLabel ?? selectedId}</span>
        <Button variant="secondary" onClick={onClear}>
          Wróć do rankingu
        </Button>
      </div>
      <div className={styles.statsGrid}>
        <StatCard
          label="Wynik netto"
          value={formatMoney(report.stats.net_pnl, currency)}
          tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
        />
        <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
        <StatCard label="Profit factor" value={formatNumber(report.stats.profit_factor)} />
        <StatCard
          label="Maks. obsunięcie"
          value={formatMoney(report.stats.max_drawdown ?? "0", currency)}
        />
        <StatCard
          label="Śr. czas trwania"
          value={formatMinutes(report.stats.average_trade_duration_minutes)}
        />
        <StatCard label="Zamknięte transakcje" value={String(report.stats.closed_trades)} />
      </div>
      <ChartCard title="Krzywa kapitału">
        <EquityCurveChart points={report.equity_curve} currency={currency} />
      </ChartCard>
      <ChartCard title="Wynik wg dnia tygodnia">
        <GroupBarChart rows={report.by_day_of_week} currency={currency} />
      </ChartCard>
    </div>
  );
}
