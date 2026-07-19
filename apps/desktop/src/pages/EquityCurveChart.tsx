import type { ReactElement } from "react";
import type { EquityPoint } from "../app/types/report";
import styles from "./EquityCurveChart.module.css";

export interface EquityCurveChartProps {
  points: EquityPoint[];
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 12;

/**
 * Prosty własny wykres SVG krzywej kapitału - bez zewnętrznej biblioteki wykresów (projekt
 * celowo unika dodatkowych zależności dla pojedynczego wykresu liniowego). Same wartości są
 * już policzone w Rust (`cumulative_net_pnl`); tu tylko normalizujemy do współrzędnych ekranu.
 */
export function EquityCurveChart({ points }: EquityCurveChartProps): ReactElement {
  if (points.length === 0) {
    return <p className={styles.empty}>Brak zamkniętych transakcji do pokazania na wykresie.</p>;
  }

  const values = points.map((p) => Number(p.cumulative_net_pnl));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const valueRange = maxValue - minValue || 1;

  const toX = (index: number): number =>
    points.length === 1
      ? WIDTH / 2
      : PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
  const toY = (value: number): number =>
    HEIGHT - PADDING - ((value - minValue) / valueRange) * (HEIGHT - PADDING * 2);

  const linePath = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${toX(index)} ${toY(value)}`)
    .join(" ");
  const zeroY = toY(0);
  const finalValue = values[values.length - 1] ?? 0;
  const lineColor = finalValue >= 0 ? "var(--color-profit)" : "var(--color-loss)";

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Krzywa kapitału - skumulowany wynik netto w czasie"
    >
      <line
        x1={PADDING}
        y1={zeroY}
        x2={WIDTH - PADDING}
        y2={zeroY}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} />
    </svg>
  );
}
