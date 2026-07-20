import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import type { TopTradeRow } from "../app/types/report";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./BreakdownTable.module.css";

export interface TopTradesTableProps {
  rows: TopTradeRow[];
  currency: string;
}

function formatOpenedAt(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

/** Tabela TOP N transakcji (najlepsze/najgorsze) - sekcja "TOP 5" w raporcie miesięcznym. */
export function TopTradesTable({ rows, currency }: TopTradesTableProps): ReactElement {
  if (rows.length === 0) {
    return <p className={styles.empty}>Brak transakcji.</p>;
  }

  return (
    <Table>
      <thead>
        <tr>
          <th>Data wejścia</th>
          <th>Instrument</th>
          <th>Strategia</th>
          <th>Kierunek</th>
          <th className={tableStyles.numeric}>P&L netto</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.trade_id}>
            <td>{formatOpenedAt(row.opened_at)}</td>
            <td>{row.instrument_label}</td>
            <td>{row.strategy_label}</td>
            <td>{row.side === "buy" ? "BUY" : "SELL"}</td>
            <td
              className={[
                tableStyles.numeric,
                Number(row.net_pnl) >= 0 ? styles.profit : styles.loss,
              ].join(" ")}
            >
              {formatMoney(row.net_pnl, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
