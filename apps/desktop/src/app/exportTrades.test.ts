import { describe, expect, it } from "vitest";
import { exportFileNameSuffix, sanitizeFileNamePart, toExportFilter } from "./exportTrades";
import { blankReportFilter } from "../pages/ReportFilterBar";

describe("toExportFilter", () => {
  it("pusty filtr nie zawęża żadnego wymiaru", () => {
    expect(toExportFilter(blankReportFilter("k1"))).toEqual({
      instrument_id: null,
      strategy_id: null,
      interval_id: null,
      side: null,
      year: null,
      month: null,
    });
  });

  it("puste pola trafiają jako null, nie jako pusty napis", () => {
    // Pusty napis po stronie Rusta byłby PRAWDZIWYM identyfikatorem i wyciąłby wszystko -
    // to najgroźniejsza pomyłka przy tym mapowaniu, więc pilnuje jej osobny test.
    const wynik = toExportFilter({ ...blankReportFilter("k1"), instrumentId: "", side: "" });
    expect(wynik.instrument_id).toBeNull();
    expect(wynik.side).toBeNull();
  });

  it("rok i miesiąc idą jako liczby", () => {
    const wynik = toExportFilter({ ...blankReportFilter("k1"), year: "2026", month: "3" });
    expect(wynik.year).toBe(2026);
    expect(wynik.month).toBe(3);
  });

  it("raport roczny ignoruje miesiąc, tak jak na ekranie", () => {
    const wynik = toExportFilter(
      { ...blankReportFilter("k1"), year: "2026", month: "3" },
      "yearly",
    );
    expect(wynik.year).toBe(2026);
    expect(wynik.month).toBeNull();
  });

  it("przenosi instrument, strategię, interwał i kierunek", () => {
    const wynik = toExportFilter({
      ...blankReportFilter("k1"),
      instrumentId: "i1",
      strategyId: "s1",
      intervalId: "in1",
      side: "sell",
    });
    expect(wynik).toMatchObject({
      instrument_id: "i1",
      strategy_id: "s1",
      interval_id: "in1",
      side: "sell",
    });
  });
});

describe("exportFileNameSuffix", () => {
  it("bez zawężenia nie dokłada niczego do nazwy", () => {
    expect(exportFileNameSuffix(toExportFilter(blankReportFilter("k1")))).toBe("");
  });

  it("koduje rok, miesiąc i kierunek", () => {
    const filtr = toExportFilter({
      ...blankReportFilter("k1"),
      year: "2026",
      month: "3",
      side: "buy",
    });
    expect(exportFileNameSuffix(filtr)).toBe("2026-03-buy");
  });
});

describe("sanitizeFileNamePart", () => {
  it("zamienia znaki spoza [a-z0-9] na podkreślenia", () => {
    expect(sanitizeFileNamePart("Vantage Live #1")).toBe("Vantage_Live_1");
  });

  it("nazwa złożona z samych znaków specjalnych nie daje pustej nazwy pliku", () => {
    expect(sanitizeFileNamePart("///")).toBe("konto");
  });
});
