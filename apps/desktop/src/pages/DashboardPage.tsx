import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router";
import { BarChart2, ListPlus, SlidersHorizontal, Wallet } from "lucide-react";
import { formatMoney } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import { formatNumber, formatPercent, formatR } from "../app/reportFormat";
import { toAccountComparisonFilter, useReportFilter } from "../app/useReportFilter";
import type { AccountComparisonRow } from "../app/types/report";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { ChartCard } from "./ChartCard";
import { EquityCurveChart } from "./EquityCurveChart";
import { GroupBarChart } from "./GroupBarChart";
import { HeatmapTable } from "./HeatmapTable";
import { ReportAccountComparisonTab } from "./ReportAccountComparisonTab";
import { ALL_ACCOUNTS_VALUE, ReportFilterBar } from "./ReportFilterBar";
import type { ReportFilterBarValue } from "./ReportFilterBar";
import { StatCard } from "./StatCard";
import reportStyles from "./ReportsPage.module.css";
import styles from "./DashboardPage.module.css";

const CHECKLIST_DISMISSED_KEY = "dziennik-tradera.dashboard-checklist-dismissed";
const RANKING_SIZE = 5;

export function DashboardPage(): ReactElement {
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "true",
  );
  const {
    accounts,
    accountsError,
    instruments,
    strategies,
    intervals,
    filter,
    setFilter,
    availableYears,
    report,
    reportError,
    selectedAccount,
  } = useReportFilter();
  const [accountRankingRows, setAccountRankingRows] = useState<AccountComparisonRow[] | null>(null);
  const isAllAccounts = filter.accountId === ALL_ACCOUNTS_VALUE;
  // Konto i instrumenty zawsze istnieją, gdy Dashboard się renderuje (konto jest wymagane do
  // wejścia tutaj, a fabryczny katalog 350 instrumentów jest zawsze dostępny) - jedyne realne
  // "zrobiłem to" do wykrycia to pierwsza własna strategia i pierwsza transakcja. Lista startowa
  // chowa się automatycznie, gdy obie te rzeczy istnieją, niezależnie od ręcznego "×".
  const hasOnboardingProgress =
    strategies.length > 0 && report !== null && report.stats.total_trades > 0;

  const dismiss = (): void => {
    localStorage.setItem(CHECKLIST_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  async function loadAccountRanking(
    accountIds: string[],
    currentFilter: ReportFilterBarValue,
  ): Promise<void> {
    try {
      const rows = await invokeCommand<AccountComparisonRow[]>("compare_accounts_report", {
        accountIds,
        filter: toAccountComparisonFilter(currentFilter),
      });
      setAccountRankingRows(rows);
    } catch {
      setAccountRankingRows([]);
    }
  }

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAccountRanking(
        accounts.map((a) => a.id),
        filter,
      );
    } else {
      setAccountRankingRows(null);
    }
  }, [accounts, filter]);

  return (
    <div className={styles.page}>
      {!dismissed && !hasOnboardingProgress && (
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
        <ErrorState title="Nie udało się wczytać kont" description={accountsError} />
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
          <ReportFilterBar
            value={filter}
            onChange={setFilter}
            accounts={accounts}
            instruments={instruments}
            strategies={strategies}
            intervals={intervals}
            availableYears={availableYears}
            allowAllAccounts
          />

          {isAllAccounts && (
            <ReportAccountComparisonTab rows={accountRankingRows} accounts={accounts} />
          )}

          {!isAllAccounts && selectedAccount && (
            <div className={styles.statsGrid}>
              <StatCard
                label="Aktualne saldo"
                value={formatMoney(selectedAccount.balance, selectedAccount.currency)}
              />
            </div>
          )}

          {!isAllAccounts && reportError && (
            <ErrorState title="Nie udało się wczytać podsumowania" description={reportError} />
          )}

          {!isAllAccounts && !reportError && report === null && <Skeleton height="8rem" />}

          {!isAllAccounts && !reportError && report !== null && selectedAccount && (
            <>
              {report.stats.closed_trades === 0 ? (
                <EmptyState
                  icon={<BarChart2 size={32} aria-hidden="true" />}
                  title="Brak zamkniętych transakcji"
                  description="Statystyki pojawią się, gdy zamkniesz pierwszą pozycję na tym koncie (albo dopasuj filtry powyżej)."
                />
              ) : (
                <>
                  <div className={styles.statsGrid}>
                    <StatCard
                      label="P&L netto"
                      value={formatMoney(report.stats.net_pnl, selectedAccount.currency)}
                      tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
                    />
                    <StatCard
                      label="Liczba transakcji"
                      value={String(report.stats.closed_trades)}
                    />
                    <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
                    <StatCard
                      label="Profit factor"
                      value={formatNumber(report.stats.profit_factor)}
                    />
                    <StatCard
                      label="Średni zysk"
                      value={formatMoney(report.stats.average_win ?? "0", selectedAccount.currency)}
                      tone="profit"
                    />
                    <StatCard
                      label="Średnia strata"
                      value={formatMoney(
                        report.stats.average_loss ?? "0",
                        selectedAccount.currency,
                      )}
                      tone="loss"
                    />
                    <StatCard label="Śr. RR" value={formatR(report.stats.average_r)} />
                    <StatCard
                      label="Max drawdown %"
                      value={formatPercent(report.period_balance.max_drawdown_percent)}
                    />
                  </div>

                  <div className={styles.chartSection}>
                    <h2 className={styles.sectionTitle}>Krzywa kapitału</h2>
                    <EquityCurveChart
                      points={report.equity_curve}
                      currency={selectedAccount.currency}
                    />
                  </div>

                  <div className={reportStyles.chartsGrid}>
                    <ChartCard title="Liczba transakcji per miesiąc" fullWidth>
                      <GroupBarChart
                        rows={report.calendar_months.map((m) => ({
                          ...m,
                          net_pnl: String(m.trade_count),
                        }))}
                        currency=""
                        unit="count"
                        valueLabel="Liczba transakcji"
                      />
                    </ChartCard>
                    <ChartCard title="P&L netto wg dnia tygodnia">
                      <GroupBarChart
                        rows={report.by_day_of_week}
                        currency={selectedAccount.currency}
                      />
                    </ChartCard>
                    <ChartCard title="Wynik wg instrumentu">
                      <GroupBarChart
                        rows={report.by_instrument}
                        currency={selectedAccount.currency}
                      />
                    </ChartCard>
                    <ChartCard title="Wynik wg strategii">
                      <GroupBarChart
                        rows={report.by_strategy}
                        currency={selectedAccount.currency}
                      />
                    </ChartCard>
                    <ChartCard title="P&L netto wg godzin">
                      <GroupBarChart
                        rows={report.by_four_hour}
                        currency={selectedAccount.currency}
                      />
                    </ChartCard>
                  </div>

                  <ChartCard title="Rankingi">
                    <div className={reportStyles.chartsGrid}>
                      <div>
                        <p className={styles.rankingTitle}>Instrument</p>
                        <Table>
                          <thead>
                            <tr>
                              <th>Instrument</th>
                              <th className={tableStyles.numeric}>P&L netto</th>
                              <th className={tableStyles.numeric}>Transakcje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.by_instrument.slice(0, RANKING_SIZE).map((row) => (
                              <tr key={row.key}>
                                <td>{row.label}</td>
                                <td className={tableStyles.numeric}>
                                  {formatMoney(row.net_pnl, selectedAccount.currency)}
                                </td>
                                <td className={tableStyles.numeric}>{row.trade_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                      <div>
                        <p className={styles.rankingTitle}>Strategia</p>
                        <Table>
                          <thead>
                            <tr>
                              <th>Strategia</th>
                              <th className={tableStyles.numeric}>P&L netto</th>
                              <th className={tableStyles.numeric}>Transakcje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.by_strategy.slice(0, RANKING_SIZE).map((row) => (
                              <tr key={row.key}>
                                <td>{row.label}</td>
                                <td className={tableStyles.numeric}>
                                  {formatMoney(row.net_pnl, selectedAccount.currency)}
                                </td>
                                <td className={tableStyles.numeric}>{row.trade_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                      <div>
                        <p className={styles.rankingTitle}>Konto</p>
                        {accountRankingRows === null ? (
                          <Skeleton height="4rem" />
                        ) : (
                          <Table>
                            <thead>
                              <tr>
                                <th>Konto</th>
                                <th className={tableStyles.numeric}>P&L netto</th>
                                <th className={tableStyles.numeric}>Transakcje</th>
                                <th className={tableStyles.numeric}>Max DD %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accountRankingRows.map((row) => {
                                const account = accounts.find((a) => a.id === row.account_id);
                                return (
                                  <tr key={row.account_id}>
                                    <td>{account?.name ?? row.account_id}</td>
                                    <td className={tableStyles.numeric}>
                                      {formatMoney(row.stats.net_pnl, account?.currency)}
                                    </td>
                                    <td className={tableStyles.numeric}>
                                      {row.stats.closed_trades}
                                    </td>
                                    <td className={tableStyles.numeric}>
                                      {formatPercent(row.period_balance.max_drawdown_percent)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        )}
                      </div>
                    </div>
                  </ChartCard>

                  <ChartCard title="Heatmapy">
                    <div className={reportStyles.chartsGrid}>
                      <div>
                        <p className={styles.rankingTitle}>Dzień</p>
                        <HeatmapTable
                          rows={report.by_day_of_week}
                          currency={selectedAccount.currency}
                        />
                      </div>
                      <div>
                        <p className={styles.rankingTitle}>Godziny</p>
                        <HeatmapTable
                          rows={report.by_four_hour}
                          currency={selectedAccount.currency}
                        />
                      </div>
                      <div>
                        <p className={styles.rankingTitle}>Rozkład wyników</p>
                        <Table>
                          <thead>
                            <tr>
                              <th>Wynik</th>
                              <th className={tableStyles.numeric}>Liczba</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.pnl_distribution.map((bucket) => (
                              <tr key={bucket.range_label}>
                                <td>{bucket.range_label}</td>
                                <td className={tableStyles.numeric}>{bucket.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  </ChartCard>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
