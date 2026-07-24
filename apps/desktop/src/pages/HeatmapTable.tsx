import type { CSSProperties, ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatPercent } from "../app/reportFormat";
import type { GroupBreakdown } from "../app/types/report";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./HeatmapTable.module.css";

export interface HeatmapTableProps {
  rows: GroupBreakdown[];
  currency: string;
}

/** Skala koloru komórki "Wynik netto" - im dalej od zera (w danym kierunku), tym silniejszy
 * odcień zysku/straty. `maxAbs` to największa wartość absolutna w całej tabeli (skala wspólna
 * dla wszystkich wierszy, żeby kolory były porównywalne między sobą). Górna granica 0,55 (nie
 * 0,70 jak poprzednio) - znaleziona podczas audytu O7 realna luka WCAG AA: przy `--color-text`
 * na tle mieszanym z `--color-profit` w motywie ciemnym kontrast schodził poniżej 4,5:1 dopiero
 * powyżej ~0,59 - 0,55 zostawia margines bezpieczeństwa, zweryfikowany w tokens.test.ts. */
function pnlOpacity(value: number, maxAbs: number): number {
  if (maxAbs === 0) {
    return 0;
  }
  return 0.15 + 0.4 * (Math.abs(value) / maxAbs);
}

/**
 * Tabela z komórkami kolorowanymi jak heatmapa (sekcja "Heatmapy" na Dashboardzie) - ten sam
 * `GroupBreakdown` co wykresy słupkowe, tylko inna prezentacja: łatwiej porównać wiele wierszy
 * naraz (np. wszystkie dni tygodnia) niż na wykresie.
 */
export function HeatmapTable({ rows, currency }: HeatmapTableProps): ReactElement {
  const maxAbsPnl = Math.max(1, ...rows.map((r) => Math.abs(Number(r.net_pnl))));

  return (
    <Table>
      <thead>
        <tr>
          <th></th>
          <th className={tableStyles.numeric}>Transakcje</th>
          <th className={tableStyles.numeric}>P&L netto</th>
          <th className={tableStyles.numeric}>Win rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const value = Number(row.net_pnl);
          const tone = value >= 0 ? "profit" : "loss";
          return (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td className={tableStyles.numeric}>{row.trade_count}</td>
              <td
                className={[tableStyles.numeric, styles.cell, styles[tone]].join(" ")}
                style={{ "--cell-opacity": pnlOpacity(value, maxAbsPnl) } as CSSProperties}
              >
                {formatMoney(row.net_pnl, currency)}
              </td>
              <td className={tableStyles.numeric}>{formatPercent(row.win_rate)}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
