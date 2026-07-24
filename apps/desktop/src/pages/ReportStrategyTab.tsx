import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type {
  AccountComparisonFilter,
  AccountComparisonRow,
  FilteredReport,
} from "../app/types/report";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { toAccountBreakdown } from "./accountBreakdown";
import { ChartCard } from "./ChartCard";
import { GroupBarChart } from "./GroupBarChart";
import styles from "./ReportsPage.module.css";

export interface ReportStrategyTabProps {
  report: FilteredReport | null;
  currency: string;
  selectedLabel: string | undefined;
  accounts: AccountWithBalance[];
  accountFilter: AccountComparisonFilter | null;
}

/**
 * Raport Strategii - jak dana strategia zachowuje się na różnych instrumentach, kontach i
 * interwałach oraz w czasie. Wymaga wybrania jednej strategii w pasku filtrów. "Wynik wg konta"
 * to jedyny wykres tego raportu, który nie pochodzi z `FilteredReport` (ten jest zawężony do
 * JEDNEGO konta) - liczony osobno przez `compare_accounts_report` z tym samym filtrem strategii.
 */
export function ReportStrategyTab({
  report,
  currency,
  selectedLabel,
  accounts,
  accountFilter,
}: ReportStrategyTabProps): ReactElement {
  const [accountRows, setAccountRows] = useState<AccountComparisonRow[] | null>(null);

  async function loadAccountRows(
    accountIds: string[],
    filter: AccountComparisonFilter,
  ): Promise<void> {
    try {
      const rows = await invokeCommand<AccountComparisonRow[]>("compare_accounts_report", {
        accountIds,
        filter,
      });
      setAccountRows(rows);
    } catch {
      setAccountRows([]);
    }
  }

  useEffect(() => {
    if (accountFilter && accounts.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAccountRows(
        accounts.map((a) => a.id),
        accountFilter,
      );
    } else {
      setAccountRows(null);
    }
  }, [accountFilter, accounts]);

  if (!report || !accountFilter) {
    return (
      <EmptyState
        title="Wybór strategii jest wymagany"
        description="Ten raport pokazuje, gdzie dana strategia działa najlepiej: na jakich instrumentach, kontach, interwałach i w których miesiącach generuje wynik."
      />
    );
  }

  const accountBreakdown = accountRows ? toAccountBreakdown(accountRows, accounts) : null;

  return (
    <div className={styles.tabContent}>
      <h3 className={styles.dimensionLabel}>{selectedLabel}</h3>

      <div className={styles.chartsGrid}>
        <ChartCard title="Wynik wg instrumentu">
          <GroupBarChart rows={report.by_instrument} currency={currency} />
        </ChartCard>
        <ChartCard title="Wynik wg konta">
          {accountBreakdown ? (
            <GroupBarChart rows={accountBreakdown} currency={currency} />
          ) : (
            <p className={styles.empty}>Wczytywanie...</p>
          )}
        </ChartCard>
        <ChartCard title="Wynik wg interwału">
          <GroupBarChart rows={report.by_interval} currency={currency} />
        </ChartCard>
        <ChartCard title="P&L wg miesiąca" fullWidth>
          <GroupBarChart rows={report.calendar_months} currency={currency} />
        </ChartCard>
      </div>

      <ChartCard title="Opis wykresów">
        <ul className={styles.helpList}>
          <li>
            Wynik wg instrumentu pokazuje, na jakich walorach wybrana strategia dawała najlepszy i
            najgorszy wynik netto.
          </li>
          <li>
            Wynik wg konta pokazuje, na których kontach wybrana strategia dawała najlepszy i
            najgorszy rezultat.
          </li>
          <li>
            Wynik wg interwału pokazuje, na jakich TF-ach wybrana strategia dawała najlepsze i
            najgorsze rezultaty.
          </li>
          <li>
            P&L wg miesiąca pokazuje, w których miesiącach wybrana strategia była najmocniejsza lub
            najsłabsza.
          </li>
        </ul>
      </ChartCard>
    </div>
  );
}
