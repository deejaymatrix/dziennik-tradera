import { describe, expect, it } from "vitest";
import { monthYearLabel, toAccountComparisonFilter, toReportFilter } from "./useReportFilter";
import { blankReportFilter } from "../pages/ReportFilterBar";

/**
 * `toReportFilter`/`toAccountComparisonFilter` decydują, jaki filtr faktycznie trafia do
 * `get_filtered_report` - błąd tutaj nie psuje interfejsu, tylko cicho pokazuje ZŁE dane
 * (np. wynik za "miesiąc 3 wszystkich lat" zamiast "bez filtra miesiąca"), co użytkownik może
 * wziąć za prawdziwy raport. Te trzy czyste funkcje nie miały żadnego testu, mimo że
 * `useReportFilter` jest współdzielony przez Dashboard I zakładkę Raporty (jedno źródło prawdy
 * dla obu, więc błąd tu dotyka od razu dwóch ekranów).
 */
describe("toReportFilter - konwersja pustych pól na null, nie na puste stringi", () => {
  it("zamienia puste opcjonalne pola na null", () => {
    const filtr = toReportFilter(blankReportFilter("konto-1"));
    expect(filtr).toEqual({
      account_id: "konto-1",
      instrument_id: null,
      strategy_id: null,
      interval_id: null,
      side: null,
      year: null,
      month: null,
    });
  });

  it("miesiąc BEZ roku jest ignorowany (nie ma sensu filtrować po samym miesiącu)", () => {
    const filtr = toReportFilter({ ...blankReportFilter("konto-1"), month: "3" });
    expect(filtr.year).toBeNull();
    expect(filtr.month).toBeNull();
  });

  it("rok z miesiącem razem przechodzą jako liczby", () => {
    const filtr = toReportFilter({
      ...blankReportFilter("konto-1"),
      year: "2026",
      month: "3",
    });
    expect(filtr.year).toBe(2026);
    expect(filtr.month).toBe(3);
  });

  it("sam rok bez miesiąca jest poprawnym filtrem rocznym", () => {
    const filtr = toReportFilter({ ...blankReportFilter("konto-1"), year: "2026" });
    expect(filtr.year).toBe(2026);
    expect(filtr.month).toBeNull();
  });
});

describe("toAccountComparisonFilter - ten sam wzorzec, ale bez account_id", () => {
  it("nie ma pola account_id (porównanie dotyczy wszystkich kont)", () => {
    const filtr = toAccountComparisonFilter(blankReportFilter("konto-1"));
    expect(filtr).not.toHaveProperty("account_id");
  });

  it("miesiąc bez roku też jest tu ignorowany", () => {
    const filtr = toAccountComparisonFilter({ ...blankReportFilter(""), month: "12" });
    expect(filtr.year).toBeNull();
    expect(filtr.month).toBeNull();
  });
});

describe("monthYearLabel - etykieta miesiąc+rok do wyświetlenia", () => {
  it("pusty string, gdy brakuje roku albo miesiąca", () => {
    expect(monthYearLabel(blankReportFilter(""))).toBe("");
    expect(monthYearLabel({ ...blankReportFilter(""), year: "2026" })).toBe("");
    expect(monthYearLabel({ ...blankReportFilter(""), month: "3" })).toBe("");
  });

  it("łączy polską nazwę miesiąca z rokiem", () => {
    expect(monthYearLabel({ ...blankReportFilter(""), year: "2026", month: "3" })).toBe(
      "Marzec 2026",
    );
    expect(monthYearLabel({ ...blankReportFilter(""), year: "2026", month: "12" })).toBe(
      "Grudzień 2026",
    );
  });
});
