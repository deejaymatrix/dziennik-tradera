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
import { formatMoney } from "../app/decimal";
import type { GroupBreakdown } from "../app/types/report";
import { estimateYAxisWidth } from "./chartAxis";
import { makeBarShape } from "./barShape";
import styles from "./GroupBarChart.module.css";
import {
  CHART_GRID_PROPS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from "./chartTheme";

export interface GroupBarChartProps {
  rows: GroupBreakdown[];
  currency: string;
  /** "count" formatuje wartości jako liczby całkowite bez waluty (np. liczba transakcji),
   * zamiast domyślnego formatowania pieniężnego. */
  unit?: "money" | "count";
  valueLabel?: string;
  /**
   * Czy znak wartości niesie znaczenie „zysk/strata".
   *
   * "profit-loss" (domyślne) koloruje słupki zielono/czerwono wg znaku - poprawne dla wyniku
   * netto. "neutral" jest dla wielkości, które są z natury nieujemne albo których znak nie
   * oznacza dobrego wyniku (win rate, liczba transakcji, obsunięcie): tam kolorowanie wg znaku
   * KŁAMIE - 20% win rate świeciłoby na zielono tylko dlatego, że 20 > 0.
   */
  tone?: "profit-loss" | "neutral";
}

interface BarDatum {
  label: string;
  value: number;
}

/** Słupkowy wykres wyniku netto wg grupy (miesiąc/rok/dzień tygodnia/instrument/strategia) -
 * jeden, wspólny komponent Recharts, żeby wszystkie podraporty zakładki Raporty (Faza 9)
 * wizualizowały `GroupBreakdown` z Rust identycznie. */
export function GroupBarChart({
  rows,
  currency,
  unit = "money",
  valueLabel = "Wynik netto",
  tone = "profit-loss",
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
  //
  // Osobny wymiar od LICZBY kategorii: DŁUGOŚĆ etykiety (np. własna nazwa strategii/instrumentu).
  // Recharts sam zawija długi tekst na kilka linii (`<tspan>`) zamiast go obcinać - ale bez
  // dodatkowego miejsca ten zawinięty, obrócony blok wystawał POZA obszar wykresu (znalezione
  // przy audycie: zmierzone `getBoundingClientRect()` w przeglądarce pokazało widoczne przecięcie
  // z sąsiednią kartą). `axisHeight`/`marginLeft` rosną, gdy najdłuższa etykieta tego wymaga -
  // liczba kategorii i długość etykiety to dwa NIEZALEŻNE powody potrzeby więcej miejsca.
  const maxLabelLength = data.reduce((max, d) => Math.max(max, d.label.length), 0);
  const hasLongLabels = maxLabelLength > 18;
  const angle = data.length > 20 ? -60 : data.length > 10 ? -35 : -25;
  const tickFontSize = data.length > 20 ? 10 : 11;
  const axisHeight = data.length > 20 ? 62 : hasLongLabels ? 110 : 50;
  const marginLeft = hasLongLabels ? 32 : 0;
  const axisWidth = estimateYAxisWidth(
    data.map((d) => d.value),
    formatAxisValue,
  );

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 32, left: marginLeft }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          dataKey="label"
          interval={0}
          angle={angle}
          textAnchor="end"
          height={axisHeight}
          tick={{ fill: "var(--color-text-muted)", fontSize: tickFontSize }}
        />
        <YAxis
          width={axisWidth}
          allowDecimals={unit !== "count"}
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          tickFormatter={formatAxisValue}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <Tooltip
          formatter={(value) => formatTooltipValue(Number(value))}
          contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
        />
        <Bar
          dataKey="value"
          name={valueLabel}
          shape={makeBarShape(tone)}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
