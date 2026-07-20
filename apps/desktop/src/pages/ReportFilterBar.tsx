import type { ReactElement } from "react";
import type { AccountWithBalance } from "../app/types/account";
import type { InstrumentWithDetails } from "../app/types/instrument";
import type { Interval } from "../app/types/interval";
import type { Strategy } from "../app/types/strategy";
import { Button } from "../ui/components/Button/Button";
import { Select } from "../ui/components/Select/Select";
import styles from "./ReportFilterBar.module.css";

export interface ReportFilterBarValue {
  accountId: string;
  instrumentId: string;
  strategyId: string;
  intervalId: string;
  side: "" | "buy" | "sell";
  year: string;
  month: string;
}

/** Sentinel w polu "Konto" oznaczający porównanie wszystkich kont naraz, zamiast jednego
 * wybranego - patrz `allowAllAccounts` w `ReportFilterBarProps`. */
export const ALL_ACCOUNTS_VALUE = "__all__";

export function blankReportFilter(accountId: string): ReportFilterBarValue {
  return {
    accountId,
    instrumentId: "",
    strategyId: "",
    intervalId: "",
    side: "",
    year: "",
    month: "",
  };
}

const MONTH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Wszystkie miesiące" },
  { value: "1", label: "Styczeń" },
  { value: "2", label: "Luty" },
  { value: "3", label: "Marzec" },
  { value: "4", label: "Kwiecień" },
  { value: "5", label: "Maj" },
  { value: "6", label: "Czerwiec" },
  { value: "7", label: "Lipiec" },
  { value: "8", label: "Sierpień" },
  { value: "9", label: "Wrzesień" },
  { value: "10", label: "Październik" },
  { value: "11", label: "Listopad" },
  { value: "12", label: "Grudzień" },
];

const SIDE_OPTIONS: { value: "" | "buy" | "sell"; label: string }[] = [
  { value: "", label: "Wszystkie kierunki" },
  { value: "buy", label: "BUY" },
  { value: "sell", label: "SELL" },
];

/** Rodzaj widoku, w którym renderuje się pasek filtrów - determinuje, które pola mają sens
 * (patrz `reportKind` poniżej). Dashboard nie podaje tej wartości - tam widoczne są wszystkie
 * pola, bo to jeden ogólny widok, nie zestaw odrębnych, wąsko zdefiniowanych podraportów. */
export type ReportKind = "monthly" | "yearly" | "compare" | "instrument" | "strategy";

export interface ReportFilterBarProps {
  value: ReportFilterBarValue;
  onChange: (value: ReportFilterBarValue) => void;
  accounts: AccountWithBalance[];
  instruments: InstrumentWithDetails[];
  strategies: Strategy[];
  intervals: Interval[];
  availableYears: string[];
  reportKind?: ReportKind;
  /** Dodaje do pola "Konto" opcję "Wszystkie konta (porównanie)" - używane tylko na Dashboardzie,
   * który (w odróżnieniu od zakładki Raporty) nie ma osobnej zakładki "Porównanie kont". */
  allowAllAccounts?: boolean;
}

/**
 * Wspólny, lepki pasek filtrów dla wszystkich podraportów zakładki "Raporty" (Faza 9) - konto,
 * instrument, strategia, interwał, rok, miesiąc, kierunek + "Wyczyść". "Wyczyść" celowo nie
 * czyści konta - bez konta nie ma czego raportować, więc to jedyne pole, które zostaje.
 *
 * `reportKind` ukrywa pola, które dla danego podraportu nie mają sensu albo są mylące: "Miesiąc"
 * w Raporcie Rocznym (zawężenie do jednego miesiąca sprzeczne z samą ideą rocznego podsumowania),
 * "Konto" w Porównaniu kont (ten raport z definicji zawsze porównuje WSZYSTKIE konta - zmiana
 * konta w filtrze nic by tam nie zmieniła, tylko sugerowałaby, że coś robi).
 */
export function ReportFilterBar({
  value,
  onChange,
  accounts,
  instruments,
  strategies,
  intervals,
  availableYears,
  reportKind,
  allowAllAccounts,
}: ReportFilterBarProps): ReactElement {
  const showAccount = reportKind !== "compare";
  const showMonth = reportKind !== "yearly";
  function set<K extends keyof ReportFilterBarValue>(key: K, next: ReportFilterBarValue[K]): void {
    onChange({ ...value, [key]: next });
  }

  const isCleared =
    !value.instrumentId &&
    !value.strategyId &&
    !value.intervalId &&
    !value.side &&
    !value.year &&
    !value.month;

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Zakres</span>
        {showAccount && (
          <Select
            label="Konto"
            compact
            value={value.accountId}
            onChange={(e) => set("accountId", e.target.value)}
            options={[
              ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
              ...(allowAllAccounts
                ? [{ value: ALL_ACCOUNTS_VALUE, label: "Wszystkie konta (porównanie)" }]
                : []),
            ]}
            className={styles.field}
          />
        )}
        <Select
          label="Rok"
          compact
          value={value.year}
          onChange={(e) => set("year", e.target.value)}
          options={[
            { value: "", label: "Wszystkie lata" },
            ...availableYears.map((y) => ({ value: y, label: y })),
          ]}
          className={styles.field}
        />
        {showMonth && (
          <Select
            label="Miesiąc"
            compact
            value={value.month}
            onChange={(e) => set("month", e.target.value)}
            options={MONTH_OPTIONS}
            disabled={!value.year}
            className={styles.field}
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={isCleared}
          onClick={() => onChange(blankReportFilter(value.accountId))}
          className={styles.clearButton}
        >
          Wyczyść
        </Button>
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Filtry</span>
        <Select
          label="Instrument"
          compact
          value={value.instrumentId}
          onChange={(e) => set("instrumentId", e.target.value)}
          options={[
            { value: "", label: "Wszystkie instrumenty" },
            ...instruments.map((i) => ({ value: i.id, label: i.display_symbol })),
          ]}
          className={styles.field}
        />
        <Select
          label="Strategia"
          compact
          value={value.strategyId}
          onChange={(e) => set("strategyId", e.target.value)}
          options={[
            { value: "", label: "Wszystkie strategie" },
            ...strategies.map((s) => ({ value: s.id, label: s.name })),
          ]}
          className={styles.field}
        />
        <Select
          label="Interwał"
          compact
          value={value.intervalId}
          onChange={(e) => set("intervalId", e.target.value)}
          options={[
            { value: "", label: "Wszystkie interwały" },
            ...intervals.map((i) => ({ value: i.id, label: i.label })),
          ]}
          className={styles.field}
        />
        <Select
          label="Kierunek"
          compact
          value={value.side}
          onChange={(e) => set("side", e.target.value as ReportFilterBarValue["side"])}
          options={SIDE_OPTIONS}
          className={styles.field}
        />
      </div>
    </div>
  );
}
