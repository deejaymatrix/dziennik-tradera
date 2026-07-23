import { useEffect, useState } from "react";
import { usePreferences } from "../app/PreferencesProvider";
import { loadRememberedFilter, saveRememberedFilter } from "../app/reportFilterMemory";
import type { ReactElement } from "react";
import { LineChart } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import { nextTabIndex } from "../app/tablistKeys";
import { exportTrades, toExportFilter } from "../app/exportTrades";
import type { ExportFormat } from "../app/exportTrades";
import { Button } from "../ui/components/Button/Button";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { monthYearLabel, toAccountComparisonFilter, useReportFilter } from "../app/useReportFilter";
import type { AccountComparisonRow } from "../app/types/report";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { ReportAccountComparisonTab } from "./ReportAccountComparisonTab";
import { ReportFilterBar } from "./ReportFilterBar";
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
  const { preferences } = usePreferences();
  const [activeTab, setActiveTab] = useState<TabId>("monthly");
  const [comparisonRows, setComparisonRows] = useState<AccountComparisonRow[] | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const { showToast } = useToast();

  const rememberFilters = preferences?.defaults.report_remember_filters ?? true;

  // Zapis filtru bieżącej zakładki po każdej jego zmianie. Osobno dla każdego raportu, bo tego
  // wprost wymaga ustawienie - miesięczny i roczny mają zwykle inny sens filtrowania.
  useEffect(() => {
    if (rememberFilters && filter.accountId) {
      saveRememberedFilter(activeTab, filter);
    }
  }, [rememberFilters, activeTab, filter]);

  function selectTab(tab: TabId): void {
    setActiveTab(tab);
    // Przy przejściu na inną zakładkę przywracamy JEJ zapamiętany filtr, jeśli istnieje.
    if (rememberFilters) {
      const remembered = loadRememberedFilter(tab);
      if (remembered) {
        setFilter(remembered);
        return;
      }
    }
    // Pole "Miesiąc" jest ukryte w Raporcie Rocznym (patrz ReportFilterBar), ale gdyby zostało
    // ustawione na innej zakładce, po przełączeniu na Roczny zawężałoby raport do jednego
    // miesiąca w tle, niewidocznie dla użytkownika - trzeba je tu jawnie wyczyścić.
    if (tab === "yearly" && filter.month) {
      setFilter({ ...filter, month: "" });
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

  /**
   * Eksport bieżącego podraportu (sekcja 10 promptu). Zawężenie jest DOKŁADNIE tym z paska
   * filtrów, więc plik zawiera to samo, co widać na ekranie - eksport pełnego konta pozostaje
   * na ekranie "Dane".
   *
   * Porównanie kont eksportu nie ma: dotyczy wielu kont naraz, a komenda eksportu z założenia
   * pracuje na jednym. Zrzut "jednego z porównywanych kont" byłby mylący.
   */
  async function handleExport(format: ExportFormat): Promise<void> {
    const account = selectedAccount;
    if (!account) {
      return;
    }
    setExporting(format);
    try {
      const zapisano = await exportTrades({
        accountId: account.id,
        accountName: account.name,
        format,
        filter: toExportFilter(filter, activeTab),
      });
      if (zapisano) {
        showToast(`Eksport ${format.toUpperCase()} zapisany.`, "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setExporting(null);
    }
  }

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
        onChange={setFilter}
        accounts={accounts}
        instruments={instruments}
        strategies={strategies}
        intervals={intervals}
        availableYears={availableYears}
        reportKind={activeTab}
        collapsible
      />

      <div className={styles.tabs} role="tablist" aria-label="Podraporty">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`podraport-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="podraport-panel"
            // Roving tabindex: z całej grupy tylko AKTYWNA zakładka jest w kolejności Tab.
            // Dzięki temu Tab wychodzi poza listę zamiast przechodzić po pięciu przyciskach,
            // a przełącza się strzałkami - tak jak obiecuje rola "tablist".
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={[styles.tab, activeTab === tab.id && styles.tabActive]
              .filter(Boolean)
              .join(" ")}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => {
              const target = nextTabIndex(event.key, index, TABS.length);
              if (target === null) {
                return;
              }
              event.preventDefault();
              const nastepna = TABS[target];
              if (!nastepna) {
                return;
              }
              selectTab(nastepna.id);
              // Focus musi POJŚĆ za zaznaczeniem, inaczej kolejna strzałka liczyłaby od
              // starej pozycji i użytkownik utknąłby między dwiema zakładkami.
              document.getElementById(`podraport-tab-${nastepna.id}`)?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
        {activeTab !== "compare" && selectedAccount && (
          <div className={styles.tabActions}>
            {(["csv", "xlsx", "pdf"] as const).map((format) => (
              <Button
                key={format}
                variant="secondary"
                size="sm"
                disabled={exporting !== null}
                onClick={() => void handleExport(format)}
              >
                {exporting === format ? "Zapisywanie..." : format.toUpperCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Panel zakładek: `aria-labelledby` wiąże go z aktywną zakładką, więc czytnik ekranu po
          przełączeniu strzałką od razu mówi, czego dotyczy zawartość pod spodem. */}
      <div
        id="podraport-panel"
        role="tabpanel"
        aria-labelledby={`podraport-tab-${activeTab}`}
        className={styles.panel}
      >
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
                selectedLabel={
                  instruments.find((i) => i.id === filter.instrumentId)?.display_symbol
                }
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
    </div>
  );
}
