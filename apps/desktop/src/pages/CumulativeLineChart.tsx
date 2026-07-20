import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "../app/decimal";
import type { GroupBreakdown } from "../app/types/report";
import styles from "./GroupBarChart.module.css";

export interface CumulativeLineChartProps {
  rows: GroupBreakdown[];
  currency: string;
}

/**
 * Skumulowany wynik netto po grupach (miesiące/kwartały) - w odróżnieniu od `EquityCurveChart`
 * (który sumuje pojedyncze transakcje), ten sumuje już zagregowane `GroupBreakdown.net_pnl` w
 * kolejności, w jakiej występują w tablicy (wywołujący musi podać je już w poprawnym porządku
 * chronologicznym - np. `calendar_months`, które backend zawsze zwraca Styczeń..Grudzień).
 */
export function CumulativeLineChart({ rows, currency }: CumulativeLineChartProps): ReactElement {
  if (rows.length === 0) {
    return <p className={styles.empty}>Brak danych do pokazania.</p>;
  }

  const data = rows.map((row, index) => ({
    label: row.label,
    value: rows.slice(0, index + 1).reduce((sum, r) => sum + Number(r.net_pnl), 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
        <YAxis
          width={72}
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          tickFormatter={(value: number) => formatMoney(String(value))}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <Tooltip
          formatter={(value) => formatMoney(String(value), currency)}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text)",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          name="Wynik skumulowany"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
