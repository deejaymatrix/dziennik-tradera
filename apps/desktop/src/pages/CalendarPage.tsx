import { useState } from "react";
import type { ReactElement } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatSignedMoney } from "../app/decimal";
import { useAccountReport } from "../app/useAccountReport";
import type { DailyPnl } from "../app/types/report";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import styles from "./CalendarPage.module.css";

const WEEKDAY_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
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

function toDateKey(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

interface CalendarCell {
  day: number | null;
  entry: DailyPnl | null;
}

function buildMonthGrid(
  year: number,
  month: number,
  byDate: Map<string, DailyPnl>,
): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay(): 0=niedziela..6=sobota - przesuwamy tak, żeby tydzień zaczynał się w poniedziałek.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push({ day: null, entry: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, entry: byDate.get(toDateKey(year, month, day)) ?? null });
  }
  return cells;
}

export function CalendarPage(): ReactElement {
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
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  function goToPreviousMonth(): void {
    setViewDate(new Date(year, month - 1, 1));
  }
  function goToNextMonth(): void {
    setViewDate(new Date(year, month + 1, 1));
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
        icon={<CalendarDays size={32} aria-hidden="true" />}
        title="Brak aktywnych kont"
        description="Kalendarz P&L pojawi się, gdy powstanie konto z zamkniętymi transakcjami."
      />
    );
  }

  const byDate = new Map((report?.calendar ?? []).map((entry) => [entry.date, entry]));
  const cells = buildMonthGrid(year, month, byDate);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Select
          label="Konto"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
        />
        <div className={styles.monthNav}>
          <IconButton
            icon={<ChevronLeft size={16} />}
            aria-label="Poprzedni miesiąc"
            onClick={goToPreviousMonth}
          />
          <span className={styles.monthLabel}>
            {MONTH_LABELS[month]} {year}
          </span>
          <IconButton
            icon={<ChevronRight size={16} />}
            aria-label="Następny miesiąc"
            onClick={goToNextMonth}
          />
        </div>
      </div>

      {reportError && (
        <ErrorState
          title="Nie udało się wczytać kalendarza"
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

      {!reportError && report === null && <Skeleton height="16rem" />}

      {!reportError && report !== null && selectedAccount && (
        <div className={styles.grid}>
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className={styles.weekdayLabel}>
              {label}
            </div>
          ))}
          {cells.map((cell, index) => {
            if (cell.day === null) {
              return <div key={`blank-${index}`} className={styles.dayCellEmpty} />;
            }
            const netPnl = cell.entry ? Number(cell.entry.net_pnl) : null;
            return (
              <div
                key={cell.day}
                className={[
                  styles.dayCell,
                  netPnl !== null && (netPnl >= 0 ? styles.profitDay : styles.lossDay),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.dayNumber}>{cell.day}</span>
                {cell.entry && (
                  <>
                    <span className={styles.dayPnl}>
                      {formatSignedMoney(cell.entry.net_pnl, selectedAccount.currency)}
                    </span>
                    <span className={styles.dayCount}>
                      {cell.entry.trade_count}{" "}
                      {cell.entry.trade_count === 1 ? "transakcja" : "transakcji"}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
