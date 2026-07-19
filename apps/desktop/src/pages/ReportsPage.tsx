import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { LineChart } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type { InstrumentWithDetails } from "../app/types/instrument";
import type { Interval } from "../app/types/interval";
import type { AccountComparisonRow, FilteredReport, ReportFilter } from "../app/types/report";
import type { Strategy } from "../app/types/strategy";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { ReportAccountComparisonTab } from "./ReportAccountComparisonTab";
import { ReportDimensionTab } from "./ReportDimensionTab";
import { blankReportFilter, ReportFilterBar } from "./ReportFilterBar";
import type { ReportFilterBarValue } from "./ReportFilterBar";
import { ReportMonthlyTab } from "./ReportMonthlyTab";
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

function toReportFilter(f: ReportFilterBarValue): ReportFilter {
  return {
    account_id: f.accountId,
    instrument_id: f.instrumentId || null,
    strategy_id: f.strategyId || null,
    interval_id: f.intervalId || null,
    side: f.side || null,
    year: f.year ? Number(f.year) : null,
    month: f.year && f.month ? Number(f.month) : null,
  };
}

export function ReportsPage(): ReactElement {
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [instruments, setInstruments] = useState<InstrumentWithDetails[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [filter, setFilter] = useState<ReportFilterBarValue>(() => blankReportFilter(""));
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [report, setReport] = useState<FilteredReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("monthly");
  const [comparisonRows, setComparisonRows] = useState<AccountComparisonRow[] | null>(null);

  useEffect(() => {
    // Jednorazowe pobranie list wyboru przy otwarciu zakładki - ten sam wzorzec co
    // TradeFormModal (instrumenty widoczne, strategie/interwały aktywne).
    void (async () => {
      try {
        const [accountsData, instrumentsData, strategiesData, intervalsData] = await Promise.all([
          invokeCommand<AccountWithBalance[]>("list_accounts", { includeArchived: false }),
          invokeCommand<InstrumentWithDetails[]>("list_instruments", {
            filter: { search: null, category: null, visibility: "visible" },
          }),
          invokeCommand<Strategy[]>("list_strategies", { includeArchived: false }),
          invokeCommand<Interval[]>("list_intervals", {
            includeHidden: false,
            includeArchived: false,
          }),
        ]);
        setAccounts(accountsData);
        setInstruments(instrumentsData);
        setStrategies(strategiesData);
        setIntervals(intervalsData);
        setFilter((current) =>
          current.accountId ? current : blankReportFilter(accountsData[0]?.id ?? ""),
        );
      } catch (e) {
        setAccountsError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
      }
    })();
  }, []);

  async function loadAvailableYears(accountId: string): Promise<void> {
    try {
      const probe = await invokeCommand<FilteredReport>("get_filtered_report", {
        filter: {
          account_id: accountId,
          instrument_id: null,
          strategy_id: null,
          interval_id: null,
          side: null,
          year: null,
          month: null,
        },
      });
      const years = probe.yearly.map((y) => y.key);
      const currentYear = String(new Date().getFullYear());
      setAvailableYears(Array.from(new Set([...years, currentYear])).sort());
    } catch {
      setAvailableYears([]);
    }
  }

  useEffect(() => {
    // Lista lat do wyboru w filtrze - liczona niezależnie od aktywnego filtru roku/miesiąca
    // (inaczej wybranie roku zwężałoby też opcje samej listy lat do wyboru).
    if (filter.accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAvailableYears(filter.accountId);
    } else {
      setAvailableYears([]);
    }
  }, [filter.accountId]);

  async function loadReport(currentFilter: ReportFilterBarValue): Promise<void> {
    setReportError(null);
    try {
      const data = await invokeCommand<FilteredReport>("get_filtered_report", {
        filter: toReportFilter(currentFilter),
      });
      setReport(data);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    if (filter.accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadReport(filter);
    } else {
      setReport(null);
    }
  }, [filter]);

  useEffect(() => {
    // Porównanie kont nie zależy od bieżącego filtru wymiarów (instrument/strategia/rok...) -
    // to zestawienie całych kont, patrz komentarz w ReportAccountComparisonTab. Pobierane
    // dopiero po wybraniu tej zakładki, żeby nie liczyć tego niepotrzebnie przy każdej zmianie
    // filtru na innych zakładkach.
    if (activeTab !== "compare" || accounts === null) {
      return;
    }
    void (async () => {
      try {
        const rows = await invokeCommand<AccountComparisonRow[]>("compare_accounts_report", {
          accountIds: accounts.map((a) => a.id),
        });
        setComparisonRows(rows);
      } catch {
        setComparisonRows([]);
      }
    })();
  }, [activeTab, accounts]);

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

  const selectedAccount = accounts.find((a) => a.id === filter.accountId) ?? null;

  return (
    <div className={styles.page}>
      <ReportFilterBar
        value={filter}
        onChange={setFilter}
        accounts={accounts}
        instruments={instruments}
        strategies={strategies}
        intervals={intervals}
        availableYears={availableYears}
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
            onClick={() => setActiveTab(tab.id)}
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
          {activeTab === "monthly" && (
            <ReportMonthlyTab report={report} currency={selectedAccount.currency} />
          )}
          {activeTab === "yearly" && (
            <ReportYearlyTab report={report} currency={selectedAccount.currency} />
          )}
          {activeTab === "instrument" && (
            <ReportDimensionTab
              report={report}
              currency={selectedAccount.currency}
              dimensionLabel="instrumentu"
              pickHint="Kliknij wiersz w tabeli, żeby zobaczyć szczegóły dla jednego instrumentu."
              selectedId={filter.instrumentId}
              selectedLabel={instruments.find((i) => i.id === filter.instrumentId)?.display_symbol}
              breakdownRows={report.by_instrument}
              onSelect={(id) => setFilter({ ...filter, instrumentId: id })}
              onClear={() => setFilter({ ...filter, instrumentId: "" })}
            />
          )}
          {activeTab === "strategy" && (
            <ReportDimensionTab
              report={report}
              currency={selectedAccount.currency}
              dimensionLabel="strategii"
              pickHint="Kliknij wiersz w tabeli, żeby zobaczyć szczegóły dla jednej strategii."
              selectedId={filter.strategyId}
              selectedLabel={strategies.find((s) => s.id === filter.strategyId)?.name}
              breakdownRows={report.by_strategy}
              onSelect={(id) => setFilter({ ...filter, strategyId: id })}
              onClear={() => setFilter({ ...filter, strategyId: "" })}
            />
          )}
        </>
      )}
    </div>
  );
}
