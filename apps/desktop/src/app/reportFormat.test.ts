import { describe, expect, it } from "vitest";
import { formatMinutes, formatNumber, formatPercent, formatR } from "./reportFormat";

/**
 * Te cztery czyste funkcje formatują wskaźniki raportów (Dashboard, zakładka Raporty,
 * BreakdownTable, HeatmapTable) - używane w 7 miejscach, żadna nie miała dotąd testu.
 * Błąd tutaj cicho zniekształca prezentację prawdziwych wyników finansowych (np. pokazuje
 * "0.00%" zamiast "—" dla brakującej wartości, albo odwrotnie).
 */
describe("formatNumber", () => {
  it("null zamienia na myślnik", () => {
    expect(formatNumber(null)).toBe("—");
  });

  it("zaokrągla do 2 miejsc domyślnie", () => {
    expect(formatNumber("1234.5")).toBe("1234.50");
  });

  it("respektuje niestandardową liczbę miejsc po przecinku", () => {
    expect(formatNumber("1.23456", 4)).toBe("1.2346");
  });

  it("wartość niebędącą liczbą zwraca bez zmian (nie chowa jej pod myślnikiem)", () => {
    expect(formatNumber("abc")).toBe("abc");
  });

  it("pusty string traktuje jako 0, nie jako null", () => {
    expect(formatNumber("")).toBe("0.00");
  });
});

describe("formatPercent", () => {
  it("null zamienia na myślnik", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("dokleja znak procentu do sformatowanej liczby", () => {
    expect(formatPercent("12.5")).toBe("12.50%");
  });
});

describe("formatR", () => {
  it("null zamienia na myślnik", () => {
    expect(formatR(null)).toBe("—");
  });

  it("dokleja R do sformatowanej liczby", () => {
    expect(formatR("2.5")).toBe("2.50R");
  });
});

describe("formatMinutes", () => {
  it("null zamienia na myślnik", () => {
    expect(formatMinutes(null)).toBe("—");
  });

  it("poniżej godziny pokazuje same minuty", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
  });

  it("pełne godziny bez reszty minut nie pokazują '0 min'", () => {
    expect(formatMinutes(60)).toBe("1 godz.");
    expect(formatMinutes(120)).toBe("2 godz.");
  });

  it("godziny z resztą minut pokazują oba składniki", () => {
    expect(formatMinutes(90)).toBe("1 godz. 30 min");
    expect(formatMinutes(125)).toBe("2 godz. 5 min");
  });
});
