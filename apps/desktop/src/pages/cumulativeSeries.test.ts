import { describe, expect, it } from "vitest";
import { computeCumulativeSeries } from "./cumulativeSeries";
import type { GroupBreakdown } from "../app/types/report";

function grupa(label: string, netPnl: string): GroupBreakdown {
  return {
    key: label,
    label,
    trade_count: 1,
    win_count: 1,
    loss_count: 0,
    win_rate: "50",
    net_pnl: netPnl,
  };
}

/**
 * `computeCumulativeSeries` zasila `CumulativeLineChart` - suma narastająca musi być liczona
 * DOKŁADNIE na `sumDecimalStrings` (BigInt), nie przez dodawanie `Number(...)` w pętli. Klasyczny
 * błąd binarnej zmiennoprzecinkowości (`0.1 + 0.2 !== 0.3`) odchylałby ostatni punkt wykresu od
 * salda konta o grosze, bez żadnego sygnału, że coś jest nie tak - dokładnie ten sam błąd, jakiego
 * ta funkcja ma unikać. Dotąd zero testów (logika żyła wprost w komponencie Recharts).
 */
describe("computeCumulativeSeries", () => {
  it("pusta tablica daje pustą serię", () => {
    expect(computeCumulativeSeries([])).toEqual([]);
  });

  it("sumuje kolejne wartości DOKŁADNIE, bez błędu zmiennoprzecinkowego (0.1 + 0.2 + 0.1 = 0.4)", () => {
    const wynik = computeCumulativeSeries([
      grupa("Styczeń", "0.1"),
      grupa("Luty", "0.2"),
      grupa("Marzec", "0.1"),
    ]);
    expect(wynik.map((p) => p.value)).toEqual([0.1, 0.3, 0.4]);
  });

  it("zachowuje etykiety i kolejność wejściowych grup", () => {
    const wynik = computeCumulativeSeries([grupa("Q1", "100"), grupa("Q2", "-50")]);
    expect(wynik.map((p) => p.label)).toEqual(["Q1", "Q2"]);
  });

  it("radzi sobie z ujemnymi wartościami cofającymi sumę poniżej zera", () => {
    const wynik = computeCumulativeSeries([grupa("a", "10"), grupa("b", "-25"), grupa("c", "5")]);
    expect(wynik.map((p) => p.value)).toEqual([10, -15, -10]);
  });
});
