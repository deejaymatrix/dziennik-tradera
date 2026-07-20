import type { ReactElement } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "../app/decimal";
import type { EquityPoint } from "../app/types/report";
import { estimateYAxisWidth } from "./chartAxis";
import styles from "./EquityCurveChart.module.css";

export interface EquityCurveChartProps {
  points: EquityPoint[];
  currency: string;
}

interface EquityChartDatum {
  index: number;
  value: number;
  closedAt: string;
}

/**
 * Krzywa kapitału (Recharts, Faza 9 - zastąpił dotychczasowy ręczny SVG z Celu 1.6). Wartości są
 * już policzone w Rust (`cumulative_net_pnl`), tu tylko wizualizujemy.
 */
export function EquityCurveChart({ points, currency }: EquityCurveChartProps): ReactElement {
  if (points.length === 0) {
    return <p className={styles.empty}>Brak zamkniętych transakcji do pokazania na wykresie.</p>;
  }

  const data: EquityChartDatum[] = points.map((p, index) => ({
    index,
    value: Number(p.cumulative_net_pnl),
    closedAt: p.closed_at,
  }));
  const finalValue = data[data.length - 1]?.value ?? 0;
  const lineColor = finalValue >= 0 ? "var(--color-profit)" : "var(--color-loss)";
  const formatAxisValue = (value: number): string => formatMoney(String(value));
  const axisWidth = estimateYAxisWidth(
    data.map((d) => d.value),
    formatAxisValue,
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="equityCurveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="index" hide />
        <YAxis
          width={axisWidth}
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          tickFormatter={formatAxisValue}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <Tooltip
          formatter={(value) => formatMoney(String(value), currency)}
          labelFormatter={(_, payload) => {
            const point = payload[0]?.payload as EquityChartDatum | undefined;
            return point ? new Date(point.closedAt).toLocaleString("pl-PL") : "";
          }}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text)",
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          name="Wynik skumulowany"
          stroke={lineColor}
          fill="url(#equityCurveFill)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
