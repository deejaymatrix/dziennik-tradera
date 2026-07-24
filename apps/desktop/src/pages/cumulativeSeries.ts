import { sumDecimalStrings } from "../app/decimal";
import type { GroupBreakdown } from "../app/types/report";

export interface CumulativeSeriesPoint {
  label: string;
  value: number;
}

/**
 * Suma narastająca `GroupBreakdown.net_pnl` w kolejności podanej tablicy, liczona DOKŁADNIE na
 * `sumDecimalStrings` (BigInt), nie przez dodawanie `Number(...)` w pętli. Kwoty przychodzą z
 * Rusta jako napisy właśnie po to, żeby nie przechodziły przez binarny float - zsumowanie
 * kilkuset wyników w `Number` odchylało ostatni punkt wykresu od salda konta o grosze, bez
 * żadnego sygnału, że coś jest nie tak. Konwersja na `number` jest tu OSTATNIM krokiem, wyłącznie
 * do rysowania - `CumulativeLineChart` woła osobno `formatMoney` na napisie do dymka tooltipa.
 */
export function computeCumulativeSeries(rows: GroupBreakdown[]): CumulativeSeriesPoint[] {
  const data: CumulativeSeriesPoint[] = [];
  let narastajaco = "0";
  for (const row of rows) {
    narastajaco = sumDecimalStrings([narastajaco, row.net_pnl]) ?? narastajaco;
    data.push({ label: row.label, value: Number(narastajaco) });
  }
  return data;
}
