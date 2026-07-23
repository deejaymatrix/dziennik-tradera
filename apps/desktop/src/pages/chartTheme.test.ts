import { describe, expect, it } from "vitest";
import {
  CHART_GRID_PROPS,
  CHART_SERIES_COLORS,
  CHART_TOOLTIP_CONTENT_STYLE,
  chartSeriesColor,
} from "./chartTheme";

describe("paleta wykresów", () => {
  it("wszystkie kolory są tokenami CSS, nie literałami", () => {
    // Literał w wykresie oznaczałby, że po przełączeniu motywu seria zostaje w starym kolorze -
    // dokładnie to, czego zabrania sekcja 17 promptu ("przełączenie motywu nie usuwa wykresu").
    const wartosci = [
      ...CHART_SERIES_COLORS,
      CHART_GRID_PROPS.stroke,
      String(CHART_TOOLTIP_CONTENT_STYLE.background),
      String(CHART_TOOLTIP_CONTENT_STYLE.color),
      String(CHART_TOOLTIP_CONTENT_STYLE.border),
    ];
    for (const wartosc of wartosci) {
      expect(wartosc).toContain("var(--");
      expect(wartosc).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("paleta serii dodatkowych jest ograniczona do czterech kolorów", () => {
    expect(CHART_SERIES_COLORS).toHaveLength(4);
    expect(new Set(CHART_SERIES_COLORS).size).toBe(4);
  });

  it("tooltip nie używa tła kart, żeby się z nimi nie zlewał", () => {
    expect(CHART_TOOLTIP_CONTENT_STYLE.background).not.toContain("--color-surface");
    expect(CHART_TOOLTIP_CONTENT_STYLE.background).toContain("--color-tooltip-bg");
  });

  it("chartSeriesColor zawija się i nigdy nie zwraca undefined", () => {
    expect(chartSeriesColor(0)).toBe(CHART_SERIES_COLORS[0]);
    expect(chartSeriesColor(4)).toBe(CHART_SERIES_COLORS[0]);
    expect(chartSeriesColor(5)).toBe(CHART_SERIES_COLORS[1]);
    expect(chartSeriesColor(-1)).toBe(CHART_SERIES_COLORS[3]);
  });

  it("siatka jest przerywana i pozioma, żeby nie konkurowała z serią", () => {
    expect(CHART_GRID_PROPS.strokeDasharray).toBe("3 3");
    expect(CHART_GRID_PROPS.vertical).toBe(false);
  });
});
