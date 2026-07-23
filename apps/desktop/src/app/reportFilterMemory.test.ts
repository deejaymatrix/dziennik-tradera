import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRememberedFilters,
  loadRememberedFilter,
  saveRememberedFilter,
} from "./reportFilterMemory";
import { blankReportFilter } from "../pages/ReportFilterBar";

describe("pamięć filtrów raportów", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("zapamiętuje filtry osobno dla każdego raportu", () => {
    saveRememberedFilter("monthly", { ...blankReportFilter("k1"), year: "2026" });
    saveRememberedFilter("yearly", { ...blankReportFilter("k1"), year: "2025" });

    expect(loadRememberedFilter("monthly")?.year).toBe("2026");
    expect(loadRememberedFilter("yearly")?.year).toBe("2025");
  });

  it("czyszczenie usuwa zapamiętane filtry WSZYSTKICH raportów", () => {
    // To jest zachowanie po wyłączeniu ustawienia. Bez niego ponowne włączenie przełącznika
    // przywracałoby zakres sprzed miesięcy, którego użytkownik już nie pamięta.
    saveRememberedFilter("monthly", { ...blankReportFilter("k1"), year: "2026" });
    saveRememberedFilter("strategy", { ...blankReportFilter("k1"), strategyId: "s1" });

    clearRememberedFilters();

    expect(loadRememberedFilter("monthly")).toBeNull();
    expect(loadRememberedFilter("strategy")).toBeNull();
  });

  it("czyszczenie nie rusza innych wpisów aplikacji w localStorage", () => {
    localStorage.setItem("dziennik-tradera.trade-form-panels", '{"basics":true}');
    saveRememberedFilter("monthly", blankReportFilter("k1"));

    clearRememberedFilters();

    expect(localStorage.getItem("dziennik-tradera.trade-form-panels")).toBe('{"basics":true}');
  });

  it("uszkodzony zapis nie wywraca raportu, tylko wraca do filtru domyślnego", () => {
    localStorage.setItem("dziennik-tradera.report-filter:monthly", "{to nie jest JSON");
    expect(loadRememberedFilter("monthly")).toBeNull();
  });
});
