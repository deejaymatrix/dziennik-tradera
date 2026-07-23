import type { ReactElement } from "react";
import { Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import styles from "./GroupBarChart.module.css";
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from "./chartTheme";

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
          contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
        />
        <Legend wrapperStyle={{ color: "var(--color-text-muted)", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
