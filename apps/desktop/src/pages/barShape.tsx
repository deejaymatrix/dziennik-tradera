import type { ReactElement } from "react";
import type { BarShapeProps } from "recharts";
import { chartSeriesColor } from "./chartTheme";

/**
 * Kształt słupka dla `GroupBarChart` - osobny plik (nie eksport z komponentu), żeby Fast Refresh
 * nie tracił stanu przy edycji `GroupBarChart.tsx` (ostrzeżenie eslint
 * `react-refresh/only-export-components` przy eksporcie funkcji obok komponentu).
 *
 * `tone="neutral"` MUSI ignorować znak wartości - metryki jak win rate czy liczba transakcji nie
 * są "zyskiem/stratą" tylko dlatego, że akurat wypadły dodatnie/ujemne.
 */
export function makeBarShape(tone: "profit-loss" | "neutral") {
  return function BarShape(props: BarShapeProps): ReactElement {
    const { x, y, width, height, value } = props;
    const numericValue = Array.isArray(value) ? value[0] : value;
    const fill =
      tone === "neutral"
        ? chartSeriesColor(0)
        : numericValue >= 0
          ? "var(--color-profit)"
          : "var(--color-loss)";
    // Słupki poniżej zera dostają od Recharts ujemną wysokość - SVG odmawia narysowania <rect>
    // z ujemną szerokością/wysokością (błąd spec., element się nie renderuje), więc trzeba
    // znormalizować do dodatniej wysokości i przesunąć y o różnicę.
    const normalizedY = height < 0 ? y + height : y;
    const normalizedHeight = Math.abs(height);
    return <rect x={x} y={normalizedY} width={width} height={normalizedHeight} fill={fill} />;
  };
}
