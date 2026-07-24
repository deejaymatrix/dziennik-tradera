import { describe, expect, it } from "vitest";
import { estimateYAxisWidth } from "./chartAxis";

/**
 * Szacuje szerokość osi Y wykresów (EquityCurveChart, GroupBarChart, CumulativeLineChart) na
 * podstawie najdłuższej sformatowanej etykiety - Recharts sam tego nie mierzy, więc błąd tu
 * cicho obcina duże kwoty poza lewy kraniec SVG (np. "000 000,00" zamiast całej liczby). Zero
 * testów dotąd.
 */
describe("estimateYAxisWidth", () => {
  it("pusta tablica wartości daje domyślne minimum 60", () => {
    expect(estimateYAxisWidth([], (v) => String(v))).toBe(60);
  });

  it("bierze NAJDŁUŻSZĄ sformatowaną etykietę, nie pierwszą ani ostatnią", () => {
    const wynik = estimateYAxisWidth([1, 1_000_000, 10], (v) => v.toLocaleString("pl-PL"));
    const najdluzsza = "1 000 000".length;
    expect(wynik).toBe(Math.max(60, (najdluzsza + 2) * 7 + 16));
  });

  it("nigdy nie schodzi poniżej minimum 60, nawet przy bardzo krótkich etykietach", () => {
    expect(estimateYAxisWidth([1, 2, 3], () => "1")).toBe(60);
  });

  it("rośnie liniowo wraz z długością etykiety, zgodnie ze wzorem (dlugosc + 2) * 7 + 16", () => {
    expect(estimateYAxisWidth([1], () => "123456")).toBe((6 + 2) * 7 + 16);
    expect(estimateYAxisWidth([1], () => "123456789012")).toBe((12 + 2) * 7 + 16);
  });
});
