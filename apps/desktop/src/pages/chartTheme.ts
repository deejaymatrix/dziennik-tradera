import type { CSSProperties } from "react";

/**
 * Wspólny wygląd wykresów (sekcja 17 promptu).
 *
 * Wszystkie kolory są tokenami CSS, nie literałami - dzięki temu przełączenie motywu zmienia
 * wykres NA ŻYWO, bez przerysowywania go z Reacta i bez chwilowego zniknięcia serii. Recharts
 * wstawia te wartości wprost do atrybutów SVG, a przeglądarka rozwiązuje `var()` sama.
 */

/** Kolor głównej serii - niebieski akcent motywu. Zysk/strata mają własne kolory semantyczne. */
export const CHART_PRIMARY_COLOR = "var(--color-accent)";

export const CHART_PROFIT_COLOR = "var(--color-profit)";
export const CHART_LOSS_COLOR = "var(--color-loss)";

/**
 * Ograniczona paleta serii dodatkowych - CELOWO tylko cztery kolory. Wykres potrzebujący
 * piątego to wykres do rozbicia na dwa, a nie do dosypania kolorów.
 */
export const CHART_SERIES_COLORS = [
  "var(--color-chart-series-1)",
  "var(--color-chart-series-2)",
  "var(--color-chart-series-3)",
  "var(--color-chart-series-4)",
] as const;

/** Kolor serii o podanym indeksie; zawija się, więc nigdy nie zwraca `undefined`. */
export function chartSeriesColor(index: number): string {
  const i =
    ((index % CHART_SERIES_COLORS.length) + CHART_SERIES_COLORS.length) %
    CHART_SERIES_COLORS.length;
  return CHART_SERIES_COLORS[i] as string;
}

/** Siatka: subtelna, ma pomóc odczytać wartość, nie konkurować z serią. */
export const CHART_GRID_PROPS = {
  stroke: "var(--color-chart-grid)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const CHART_AXIS_TICK = { fill: "var(--color-text-muted)", fontSize: 11 } as const;

/**
 * Tooltip ma WYSOKI kontrast - własne tło, nie `--color-surface`. Tooltip nakłada się na karty
 * o kolorze `--color-surface`, więc użycie tego samego tokenu sprawiało, że zlewał się z tym,
 * co pod nim, i trzeba było go szukać wzrokiem.
 */
export const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: "var(--color-tooltip-bg)",
  border: "1px solid var(--color-tooltip-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-tooltip-text)",
  boxShadow: "var(--shadow-md)",
};

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = { color: "var(--color-tooltip-text)" };

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = { color: "var(--color-tooltip-text)" };
