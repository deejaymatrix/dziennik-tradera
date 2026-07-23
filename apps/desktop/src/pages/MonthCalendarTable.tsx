import type { ReactElement } from "react";
import { formatSignedMoney } from "../app/decimal";
import type { DailyPnl } from "../app/types/report";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./BreakdownTable.module.css";

export interface MonthCalendarTableProps {
  days: DailyPnl[];
  currency: string;
}

function weekdayLabel(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    weekday: "long",
    timeZone: "UTC",
  });
}

function formatDay(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Dzień-po-dniu tabela miesiąca (sekcja "Kalendarz miesiąca") - `days` jest już zero-wypełnione
 * przez backend (`compute_month_calendar`), tu tylko dodajemy skumulowany wynik (proste
 * narastające sumowanie już policzonych wartości, nie nowa matematyka finansowa). */
export function MonthCalendarTable({ days, currency }: MonthCalendarTableProps): ReactElement {
  return (
    <Table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Dzień tyg.</th>
          <th className={tableStyles.numeric}>Transakcje</th>
          <th className={tableStyles.numeric}>Zyskowne</th>
          <th className={tableStyles.numeric}>Stratne</th>
          <th className={tableStyles.numeric}>P&L netto</th>
          <th className={tableStyles.numeric}>Skum. P&L</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day, index) => {
          const cumulative = days
            .slice(0, index + 1)
            .reduce((sum, d) => sum + Number(d.net_pnl), 0);
          return (
            <tr key={day.date}>
              <td>{formatDay(day.date)}</td>
              <td>{weekdayLabel(day.date)}</td>
              <td className={tableStyles.numeric}>{day.trade_count}</td>
              <td className={tableStyles.numeric}>{day.win_count}</td>
              <td className={tableStyles.numeric}>{day.loss_count}</td>
              <td
                className={[
                  tableStyles.numeric,
                  Number(day.net_pnl) >= 0 ? styles.profit : styles.loss,
                ].join(" ")}
              >
                {formatSignedMoney(day.net_pnl, currency)}
              </td>
              <td
                className={[
                  tableStyles.numeric,
                  cumulative >= 0 ? styles.profit : styles.loss,
                ].join(" ")}
              >
                {formatSignedMoney(String(cumulative), currency)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
