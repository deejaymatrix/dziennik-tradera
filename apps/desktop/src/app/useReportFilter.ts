import { useEffect, useState } from "react";
import { invokeCommand } from "./invokeCommand";
import type { AccountWithBalance } from "./types/account";
import type { InstrumentWithDetails } from "./types/instrument";
import type { Interval } from "./types/interval";
import type { AccountComparisonFilter, FilteredReport, ReportFilter } from "./types/report";
import type { Strategy } from "./types/strategy";
import { blankReportFilter } from "../pages/ReportFilterBar";
import type { ReportFilterBarValue } from "../pages/ReportFilterBar";

export function toReportFilter(f: ReportFilterBarValue): ReportFilter {
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

export function toAccountComparisonFilter(f: ReportFilterBarValue): AccountComparisonFilter {
  return {
    instrument_id: f.instrumentId || null,
    strategy_id: f.strategyId || null,
    interval_id: f.intervalId || null,
    side: f.side || null,
    year: f.year ? Number(f.year) : null,
    month: f.year && f.month ? Number(f.month) : null,
  };
}

const MONTH_LABELS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

export function monthYearLabel(f: ReportFilterBarValue): string {
  if (!f.year || !f.month) {
    return "";
  }
  const label = MONTH_LABELS[Number(f.month) - 1] ?? f.month;
  return `${label} ${f.year}`;
}

export interface UseReportFilterResult {
  accounts: AccountWithBalance[] | null;
  accountsError: string | null;
  instruments: InstrumentWithDetails[];
  strategies: Strategy[];
  intervals: Interval[];
  filter: ReportFilterBarValue;
  setFilter: (value: ReportFilterBarValue) => void;
  availableYears: string[];
  report: FilteredReport | null;
  reportError: string | null;
  selectedAccount: AccountWithBalance | null;
}

/**
 * Wspólny stan filtra raportów - listy wyboru (konta/instrumenty/strategie/interwały),
 * bieżący filtr, lista dostępnych lat i wynikowy `FilteredReport`. Używany przez zakładkę
 * Raporty ORAZ Dashboard - to ten sam pasek filtrów i ten sam `get_filtered_report` w obu
 * miejscach (Faza 9 v2), więc logika pobierania danych żyje w jednym miejscu.
 */
export function useReportFilter(): UseReportFilterResult {
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [instruments, setInstruments] = useState<InstrumentWithDetails[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [filter, setFilter] = useState<ReportFilterBarValue>(() => blankReportFilter(""));
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [report, setReport] = useState<FilteredReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    // Jednorazowe pobranie list wyboru przy otwarciu - ten sam wzorzec co TradeFormModal
    // (instrumenty widoczne, strategie/interwały aktywne).
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

  return {
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
    selectedAccount: accounts?.find((a) => a.id === filter.accountId) ?? null,
  };
}
