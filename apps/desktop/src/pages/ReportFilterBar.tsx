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

export interface ReportFilterBarProps {
  value: ReportFilterBarValue;
  onChange: (value: ReportFilterBarValue) => void;
  accounts: AccountWithBalance[];
  instruments: InstrumentWithDetails[];
  strategies: Strategy[];
  intervals: Interval[];
  availableYears: string[];
}

/**
 * Wspólny, lepki pasek filtrów dla wszystkich podraportów zakładki "Raporty" (Faza 9) - konto,
 * instrument, strategia, interwał, rok, miesiąc, kierunek + "Wyczyść". "Wyczyść" celowo nie
 * czyści konta - bez konta nie ma czego raportować, więc to jedyne pole, które zostaje.
 */
export function ReportFilterBar({
  value,
  onChange,
  accounts,
  instruments,
  strategies,
  intervals,
  availableYears,
}: ReportFilterBarProps): ReactElement {
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
        <Select
          label="Konto"
          compact
          value={value.accountId}
          onChange={(e) => set("accountId", e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          className={styles.field}
        />
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
        <Select
          label="Miesiąc"
          compact
          value={value.month}
          onChange={(e) => set("month", e.target.value)}
          options={MONTH_OPTIONS}
          disabled={!value.year}
          className={styles.field}
        />
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
