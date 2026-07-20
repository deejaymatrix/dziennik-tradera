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
  /** "count" formatuje wartości jako liczby całkowite bez waluty (np. liczba transakcji),
   * zamiast domyślnego formatowania pieniężnego. */
  unit?: "money" | "count";
  valueLabel?: string;
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
export function GroupBarChart({
  rows,
  currency,
  unit = "money",
  valueLabel = "Wynik netto",
}: GroupBarChartProps): ReactElement {
  if (rows.length === 0) {
    return <p className={styles.empty}>Brak danych do pokazania.</p>;
  }

  const formatAxisValue = (value: number): string =>
    unit === "count" ? new Intl.NumberFormat("pl-PL").format(value) : formatMoney(String(value));
  const formatTooltipValue = (value: number): string =>
    unit === "count"
      ? new Intl.NumberFormat("pl-PL").format(value)
      : formatMoney(String(value), currency);

  const data: BarDatum[] = rows.map((row) => ({
    label: row.label,
    value: Number(row.net_pnl),
  }));

  // Każda kategoria musi mieć widoczną etykietę - żadna nie jest pomijana/skracana, żeby nie
  // było wątpliwości, którego dnia/miesiąca/elementu dotyczy dany słupek. Przy wielu kategoriach
  // (np. 31 dni miesiąca) zamiast pomijać etykiety, przekrzywiamy je bardziej i zmniejszamy
  // czcionkę, żeby wszystkie zmieściły się bez nakładania - karty z takimi wykresami są dodatkowo
  // renderowane na całą szerokość siatki (`ChartCard fullWidth`), co daje na to miejsce.
  const angle = data.length > 20 ? -60 : data.length > 10 ? -35 : -25;
  const tickFontSize = data.length > 20 ? 10 : 11;
  const axisHeight = data.length > 20 ? 62 : 50;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 32, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          interval={0}
          angle={angle}
          textAnchor="end"
          height={axisHeight}
          tick={{ fill: "var(--color-text-muted)", fontSize: tickFontSize }}
        />
        <YAxis
          width={72}
          allowDecimals={unit !== "count"}
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          tickFormatter={formatAxisValue}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <Tooltip
          formatter={(value) => formatTooltipValue(Number(value))}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text)",
          }}
        />
        <Bar
          dataKey="value"
          name={valueLabel}
          shape={ProfitLossBarShape}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
