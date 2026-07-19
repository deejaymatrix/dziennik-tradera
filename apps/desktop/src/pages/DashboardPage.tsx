import { useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router";
import { BarChart2, ListPlus, SlidersHorizontal, Wallet } from "lucide-react";
import { useAccountReport } from "../app/useAccountReport";
import { formatMoney } from "../app/decimal";
import { formatNumber, formatPercent, formatR } from "../app/reportFormat";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { EquityCurveChart } from "./EquityCurveChart";
import { StatCard } from "./StatCard";
import styles from "./DashboardPage.module.css";

const CHECKLIST_DISMISSED_KEY = "dziennik-tradera.dashboard-checklist-dismissed";

export function DashboardPage(): ReactElement {
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "true",
  );
  const {
    accounts,
    accountsError,
    reloadAccounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    report,
    reportError,
    reloadReport,
  } = useAccountReport();

  const dismiss = (): void => {
    localStorage.setItem(CHECKLIST_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className={styles.page}>
      {!dismissed && (
        <section className={styles.checklist} aria-label="Lista startowa">
          <div className={styles.checklistHeader}>
            <p className={styles.checklistTitle}>Start pracy</p>
            <IconButton icon="×" aria-label="Zamknij listę startową" onClick={dismiss} />
          </div>
          <ul className={styles.checklistItems}>
            <li>
              <Link to="/konta" className={styles.checklistLink}>
                <Wallet size={16} aria-hidden="true" />
                Utwórz konto
              </Link>
            </li>
            <li>
              <Link to="/instrumenty" className={styles.checklistLink}>
                <SlidersHorizontal size={16} aria-hidden="true" />
                Sprawdź instrumenty
              </Link>
            </li>
            <li>
              <Link to="/transakcje" className={styles.checklistLink}>
                <ListPlus size={16} aria-hidden="true" />
                Dodaj pierwszą transakcję
              </Link>
            </li>
          </ul>
        </section>
      )}

      {accountsError && (
        <ErrorState
          title="Nie udało się wczytać kont"
          description={accountsError}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void reloadAccounts();
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {!accountsError && accounts === null && <Skeleton height="2.5rem" />}

      {!accountsError && accounts !== null && accounts.length === 0 && (
        <EmptyState
          icon={<BarChart2 size={32} aria-hidden="true" />}
          title="Brak danych do podsumowania"
          description="P&L, win rate, profit factor, expectancy i krzywa kapitału pojawią się tutaj, gdy powstaną konta i transakcje."
        />
      )}

      {!accountsError && accounts !== null && accounts.length > 0 && (
        <>
          <Select
            label="Konto"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          />

          {selectedAccount && (
            <div className={styles.statsGrid}>
              <StatCard
                label="Aktualne saldo"
                value={formatMoney(selectedAccount.balance, selectedAccount.currency)}
              />
            </div>
          )}

          {reportError && (
            <ErrorState
              title="Nie udało się wczytać podsumowania"
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

          {!reportError && report === null && <Skeleton height="8rem" />}

          {!reportError && report !== null && selectedAccount && (
            <>
              {report.stats.closed_trades === 0 ? (
                <EmptyState
                  icon={<BarChart2 size={32} aria-hidden="true" />}
                  title="Brak zamkniętych transakcji"
                  description="Statystyki pojawią się, gdy zamkniesz pierwszą pozycję na tym koncie."
                />
              ) : (
                <>
                  <div className={styles.statsGrid}>
                    <StatCard
                      label="Wynik netto"
                      value={formatMoney(report.stats.net_pnl, selectedAccount.currency)}
                      tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
                    />
                    <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
                    <StatCard
                      label="Profit factor"
                      value={formatNumber(report.stats.profit_factor)}
                    />
                    <StatCard
                      label="Expectancy"
                      value={formatMoney(report.stats.expectancy ?? "0", selectedAccount.currency)}
                    />
                    <StatCard label="Śr. R" value={formatR(report.stats.average_r)} />
                    <StatCard
                      label="Zamknięte transakcje"
                      value={String(report.stats.closed_trades)}
                    />
                    <StatCard label="Otwarte pozycje" value={String(report.stats.open_trades)} />
                    <StatCard
                      label="Najlepsza transakcja"
                      value={formatMoney(report.stats.best_trade ?? "0", selectedAccount.currency)}
                      tone="profit"
                    />
                    <StatCard
                      label="Najgorsza transakcja"
                      value={formatMoney(report.stats.worst_trade ?? "0", selectedAccount.currency)}
                      tone="loss"
                    />
                  </div>

                  <div className={styles.chartSection}>
                    <h2 className={styles.sectionTitle}>Krzywa kapitału</h2>
                    <EquityCurveChart
                      points={report.equity_curve}
                      currency={selectedAccount.currency}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
