import type { ReactElement } from "react";
import { LineChart } from "lucide-react";
import { formatMoney } from "../app/decimal";
import { useAccountReport } from "../app/useAccountReport";
import type { GroupBreakdown } from "../app/types/report";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./ReportsPage.module.css";

function formatPercent(value: string | null): string {
  if (value === null) {
    return "—";
  }
  const num = Number(value);
  return Number.isNaN(num) ? value : `${num.toFixed(2)}%`;
}

function BreakdownTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: GroupBreakdown[];
  currency: string;
}): ReactElement {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>Brak danych.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Nazwa</th>
              <th className={tableStyles.numeric}>Transakcje</th>
              <th className={tableStyles.numeric}>Win rate</th>
              <th className={tableStyles.numeric}>Wynik netto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className={tableStyles.numeric}>{row.trade_count}</td>
                <td className={tableStyles.numeric}>{formatPercent(row.win_rate)}</td>
                <td
                  className={[
                    tableStyles.numeric,
                    Number(row.net_pnl) >= 0 ? styles.profit : styles.loss,
                  ].join(" ")}
                >
                  {formatMoney(row.net_pnl, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export function ReportsPage(): ReactElement {
  const {
    accounts,
    accountsError,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    report,
    reportError,
    reloadReport,
  } = useAccountReport();

  if (accountsError) {
    return <ErrorState title="Nie udało się wczytać kont" description={accountsError} />;
  }
  if (accounts === null) {
    return <Skeleton height="2.5rem" />;
  }
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<LineChart size={32} aria-hidden="true" />}
        title="Brak aktywnych kont"
        description="Raporty wg strategii i instrumentu pojawią się, gdy powstanie konto z zamkniętymi transakcjami."
      />
    );
  }

  return (
    <div className={styles.page}>
      <Select
        label="Konto"
        value={selectedAccountId}
        onChange={(e) => setSelectedAccountId(e.target.value)}
        options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
      />

      {reportError && (
        <ErrorState
          title="Nie udało się wczytać raportów"
          description={reportError}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void reloadReport();
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {!reportError && report === null && <Skeleton height="12rem" />}

      {!reportError && report !== null && selectedAccount && (
        <>
          {report.stats.closed_trades === 0 ? (
            <EmptyState
              icon={<LineChart size={32} aria-hidden="true" />}
              title="Brak zamkniętych transakcji"
              description="Raporty pojawią się, gdy zamkniesz pierwszą pozycję na tym koncie."
            />
          ) : (
            <>
              <BreakdownTable
                title="Wynik wg strategii"
                rows={report.by_strategy}
                currency={selectedAccount.currency}
              />
              <BreakdownTable
                title="Wynik wg instrumentu"
                rows={report.by_instrument}
                currency={selectedAccount.currency}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
