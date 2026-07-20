import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { LineChart } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import { monthYearLabel, toAccountComparisonFilter, useReportFilter } from "../app/useReportFilter";
import type { AccountComparisonRow } from "../app/types/report";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { ReportAccountComparisonTab } from "./ReportAccountComparisonTab";
import { ALL_ACCOUNTS_VALUE, ReportFilterBar } from "./ReportFilterBar";
import type { ReportFilterBarValue } from "./ReportFilterBar";
import { ReportMonthlyTab } from "./ReportMonthlyTab";
import { ReportStrategyTab } from "./ReportStrategyTab";
import { ReportSymbolTab } from "./ReportSymbolTab";
import { ReportYearlyTab } from "./ReportYearlyTab";
import styles from "./ReportsPage.module.css";

type TabId = "monthly" | "yearly" | "compare" | "instrument" | "strategy";

const TABS: { id: TabId; label: string }[] = [
  { id: "monthly", label: "Miesięczny" },
  { id: "yearly", label: "Roczny" },
  { id: "compare", label: "Porównanie kont" },
  { id: "instrument", label: "Instrument" },
  { id: "strategy", label: "Strategia" },
];

export function ReportsPage(): ReactElement {
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
  const [activeTab, setActiveTab] = useState<TabId>("monthly");
  const [comparisonRows, setComparisonRows] = useState<AccountComparisonRow[] | null>(null);

  function selectTab(tab: TabId): void {
    setActiveTab(tab);
    // Pole "Miesiąc" jest ukryte w Raporcie Rocznym (patrz ReportFilterBar), ale gdyby zostało
    // ustawione na innej zakładce, po przełączeniu na Roczny zawężałoby raport do jednego
    // miesiąca w tle, niewidocznie dla użytkownika - trzeba je tu jawnie wyczyścić.
    if (tab === "yearly" && filter.month) {
      setFilter({ ...filter, month: "" });
    }
    // "Konto" i aktywna zakładka są dwustronnie zsynchronizowane: wejście na "Porównanie kont"
    // ustawia sentinel "Wszystkie konta", zejście z niej (przy wciąż ustawionym sentinelu)
    // wraca do pierwszego prawdziwego konta - inne zakładki potrzebują jednego, prawdziwego
    // konta, żeby cokolwiek policzyć.
    if (tab === "compare" && filter.accountId !== ALL_ACCOUNTS_VALUE) {
      setFilter({ ...filter, accountId: ALL_ACCOUNTS_VALUE });
    } else if (tab !== "compare" && filter.accountId === ALL_ACCOUNTS_VALUE) {
      setFilter({ ...filter, accountId: accounts?.[0]?.id ?? "" });
    }
  }

  function handleFilterChange(next: ReportFilterBarValue): void {
    setFilter(next);
    if (next.accountId === ALL_ACCOUNTS_VALUE && activeTab !== "compare") {
      setActiveTab("compare");
    } else if (next.accountId !== ALL_ACCOUNTS_VALUE && activeTab === "compare") {
      setActiveTab("monthly");
    }
  }

  useEffect(() => {
    // Porównanie kont ignoruje konto z filtru (to właśnie konta są tu porównywane), ale
    // respektuje resztę wymiarów (instrument/strategia/interwał/rok/miesiąc/kierunek).
    if (activeTab !== "compare" || accounts === null) {
      return;
    }
    void (async () => {
      try {
        const rows = await invokeCommand<AccountComparisonRow[]>("compare_accounts_report", {
          accountIds: accounts.map((a) => a.id),
          filter: toAccountComparisonFilter(filter),
        });
        setComparisonRows(rows);
      } catch {
        setComparisonRows([]);
      }
    })();
  }, [activeTab, accounts, filter]);

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
        description="Raporty pojawią się, gdy powstanie konto z zamkniętymi transakcjami."
      />
    );
  }

  return (
    <div className={styles.page}>
      <ReportFilterBar
        value={filter}
        onChange={handleFilterChange}
        accounts={accounts}
        instruments={instruments}
        strategies={strategies}
        intervals={intervals}
        availableYears={availableYears}
        reportKind={activeTab}
        allowAllAccounts
      />

      <div className={styles.tabs} role="tablist" aria-label="Podraporty">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={[styles.tab, activeTab === tab.id && styles.tabActive]
              .filter(Boolean)
              .join(" ")}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "compare" && (
        <ReportAccountComparisonTab rows={comparisonRows} accounts={accounts} />
      )}

      {activeTab !== "compare" && reportError && (
        <ErrorState title="Nie udało się wczytać raportu" description={reportError} />
      )}

      {activeTab !== "compare" && !reportError && report === null && <Skeleton height="12rem" />}

      {activeTab !== "compare" && !reportError && report !== null && selectedAccount && (
        <>
          {activeTab === "monthly" &&
            (filter.year && filter.month ? (
              <ReportMonthlyTab
                report={report}
                currency={selectedAccount.currency}
                monthLabel={monthYearLabel(filter)}
              />
            ) : (
              <ReportMonthlyTab report={null} currency={selectedAccount.currency} monthLabel="" />
            ))}
          {activeTab === "yearly" &&
            (filter.year ? (
              <ReportYearlyTab
                report={report}
                currency={selectedAccount.currency}
                year={filter.year}
              />
            ) : (
              <EmptyState
                title="Wybierz rok"
                description="Roczne podsumowanie wyników, rytmu miesięcy i kwartałów oraz najmocniejszych punktów całego roku wymaga wybrania konkretnego roku w filtrze."
              />
            ))}
          {activeTab === "instrument" && (
            <ReportSymbolTab
              report={filter.instrumentId ? report : null}
              currency={selectedAccount.currency}
              selectedLabel={instruments.find((i) => i.id === filter.instrumentId)?.display_symbol}
            />
          )}
          {activeTab === "strategy" && (
            <ReportStrategyTab
              report={filter.strategyId ? report : null}
              currency={selectedAccount.currency}
              selectedLabel={strategies.find((s) => s.id === filter.strategyId)?.name}
              accounts={accounts}
              accountFilter={filter.strategyId ? toAccountComparisonFilter(filter) : null}
            />
          )}
        </>
      )}
    </div>
  );
}
