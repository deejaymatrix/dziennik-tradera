import type { ReactElement } from "react";
import { formatSignedMoney } from "../app/decimal";
import { formatPercent } from "../app/reportFormat";
import type { GroupBreakdown } from "../app/types/report";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./BreakdownTable.module.css";

export interface BreakdownTableProps {
  rows: GroupBreakdown[];
  currency: string;
  /** Gdy podane, wiersze stają się klikalne (drill-down np. do konkretnego instrumentu). */
  onRowClick?: (key: string) => void;
}

/** Wspólna tabela rozbicia wyniku wg grupy (miesiąc/rok/instrument/strategia) - jeden komponent
 * dla wszystkich podraportów zakładki Raporty (Faza 9). */
export function BreakdownTable({ rows, currency, onRowClick }: BreakdownTableProps): ReactElement {
  if (rows.length === 0) {
    return <p className={styles.empty}>Brak danych.</p>;
  }

  return (
    <Table>
      <thead>
        <tr>
          <th>Nazwa</th>
          <th className={tableStyles.numeric}>Transakcje</th>
          <th className={tableStyles.numeric}>Win rate</th>
          <th className={tableStyles.numeric}>Wynik netto</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            className={onRowClick ? styles.clickableRow : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? "button" : undefined}
            aria-label={onRowClick ? `Pokaż szczegóły: ${row.label}` : undefined}
            onClick={onRowClick ? () => onRowClick(row.key) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row.key);
                    }
                  }
                : undefined
            }
          >
            <td>{row.label}</td>
            <td className={tableStyles.numeric}>{row.trade_count}</td>
            <td className={tableStyles.numeric}>{formatPercent(row.win_rate)}</td>
            <td
              className={[
                tableStyles.numeric,
                Number(row.net_pnl) >= 0 ? styles.profit : styles.loss,
              ].join(" ")}
            >
              {formatSignedMoney(row.net_pnl, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
