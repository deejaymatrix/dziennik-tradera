import type { ReactElement } from "react";
import { Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import styles from "./GroupBarChart.module.css";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface SimplePieChartProps {
  slices: PieSlice[];
}

/** Prosty wykres kołowy (Recharts) - używany np. dla Zysk/Strata (raport miesięczny) i
 * Miesiące dodatnie/ujemne (raport roczny). Zera we wszystkich wycinkach pokazują komunikat
 * "Brak danych" zamiast puste kółko. */
export function SimplePieChart({ slices }: SimplePieChartProps): ReactElement {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className={styles.empty}>Brak danych do pokazania.</p>;
  }

  const data = slices.map((slice) => ({
    label: slice.label,
    value: slice.value,
    fill: slice.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={80}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text)",
          }}
        />
        <Legend wrapperStyle={{ color: "var(--color-text-muted)", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
