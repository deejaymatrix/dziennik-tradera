import { describe, expect, it } from "vitest";
import { blankReportFilter, describeReportScope } from "./ReportFilterBar";
import type { ReportScopeLists } from "./ReportFilterBar";

const LISTY: ReportScopeLists = {
  accounts: [{ id: "k1", name: "Vantage Live", currency: "USD" }],
  instruments: [{ id: "i1", display_symbol: "EURUSD" }],
  strategies: [{ id: "s1", name: "Wybicie z konsolidacji" }],
  intervals: [{ id: "in1", label: "H1" }],
};

describe("describeReportScope", () => {
  it("bez zawężeń mówi wprost, że to cała historia konta", () => {
    expect(describeReportScope(blankReportFilter("k1"), LISTY, "monthly")).toBe(
      "Vantage Live (USD) • cała historia",
    );
  });

  it("łączy wszystkie wybrane wymiary w jeden opis", () => {
    const filtr = {
      ...blankReportFilter("k1"),
      year: "2026",
      month: "3",
      instrumentId: "i1",
      strategyId: "s1",
      intervalId: "in1",
      side: "buy" as const,
    };
    expect(describeReportScope(filtr, LISTY, "monthly")).toBe(
      "Vantage Live (USD) • Marzec 2026 • EURUSD • Wybicie z konsolidacji • H1 • BUY",
    );
  });

  it("w raporcie rocznym pomija miesiąc, bo ten raport go nie stosuje", () => {
    const filtr = { ...blankReportFilter("k1"), year: "2026", month: "3" };
    expect(describeReportScope(filtr, LISTY, "yearly")).toBe("Vantage Live (USD) • rok 2026");
  });

  it("w porównaniu kont opisuje zakres jako wszystkie konta, a nie wybrane", () => {
    const filtr = { ...blankReportFilter("k1"), year: "2026" };
    expect(describeReportScope(filtr, LISTY, "compare")).toBe("Wszystkie konta • rok 2026");
  });

  it("nie udaje, że konto jest wybrane, gdy filtr go nie ma", () => {
    expect(describeReportScope(blankReportFilter(""), LISTY, "monthly")).toBe(
      "Bez wybranego konta • cała historia",
    );
  });
});
