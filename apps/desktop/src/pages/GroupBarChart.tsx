import type { ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BarShapeProps } from "recharts";
import { formatMoney } from "../app/decimal";
import type { GroupBreakdown } from "../app/types/report";
import styles from "./GroupBarChart.module.css";

export interface GroupBarChartProps {
  rows: GroupBreakdown[];
  currency: string;
}

interface BarDatum {
  label: string;
  value: number;
}

function ProfitLossBarShape(props: BarShapeProps): ReactElement {
  const { x, y, width, height, value } = props;
  const numericValue = Array.isArray(value) ? value[0] : value;
  const fill = numericValue >= 0 ? "var(--color-profit)" : "var(--color-loss)";
  // Słupki poniżej zera dostają od Recharts ujemną wysokość - SVG odmawia narysowania <rect>
  // z ujemną szerokością/wysokością (błąd spec., element się nie renderuje), więc trzeba
  // znormalizować do dodatniej wysokości i przesunąć y o różnicę.
  const normalizedY = height < 0 ? y + height : y;
  const normalizedHeight = Math.abs(height);
  return <rect x={x} y={normalizedY} width={width} height={normalizedHeight} fill={fill} />;
}

/** Słupkowy wykres wyniku netto wg grupy (miesiąc/rok/dzień tygodnia/instrument/strategia) -
 * jeden, wspólny komponent Recharts, żeby wszystkie podraporty zakładki Raporty (Faza 9)
 * wizualizowały `GroupBreakdown` z Rust identycznie. */
export function GroupBarChart({ rows, currency }: GroupBarChartProps): ReactElement {
  if (rows.length === 0) {
    return <p className={styles.empty}>Brak danych do pokazania.</p>;
  }

  const data: BarDatum[] = rows.map((row) => ({
    label: row.label,
    value: Number(row.net_pnl),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 32, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          interval={0}
          angle={-25}
          textAnchor="end"
          height={50}
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
        />
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
        <Bar
          dataKey="value"
          name="Wynik netto"
          shape={ProfitLossBarShape}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
