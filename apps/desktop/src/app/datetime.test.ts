import { describe, expect, it } from "vitest";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "./datetime";

/**
 * Te dwie funkcje konwertują między `<input type="datetime-local">` (czas lokalny) a ISO UTC,
 * którego oczekuje backend - używane przy edycji czasu otwarcia/zamknięcia transakcji
 * (TradeFormModal, CloseTradeModal). Błąd tutaj cicho zapisałby transakcję z PRZESUNIĘTYM
 * czasem (np. o offset strefy), co psuje Kalendarz, raporty dzienne i kolejność transakcji -
 * dotąd zero testów. Testy budują oczekiwane wartości przez te same API `Date`, więc działają
 * niezależnie od strefy czasowej maszyny, na której są uruchamiane.
 */
describe("toDatetimeLocalValue", () => {
  it("null zamienia na pusty string", () => {
    expect(toDatetimeLocalValue(null)).toBe("");
  });

  it("pusty string zamienia na pusty string", () => {
    expect(toDatetimeLocalValue("")).toBe("");
  });

  it("nieprawidłowy ISO zamienia na pusty string (nie rzuca wyjątku)", () => {
    expect(toDatetimeLocalValue("nie-data")).toBe("");
  });

  it("dokłada zera wiodące dla miesiąca/dnia/godziny/minuty/sekundy poniżej 10", () => {
    const chwila = new Date(2026, 0, 5, 3, 7, 9);
    expect(toDatetimeLocalValue(chwila.toISOString())).toBe("2026-01-05T03:07:09");
  });

  it("zachowuje dwucyfrowe wartości bez obcinania", () => {
    const chwila = new Date(2026, 10, 23, 14, 35, 59);
    expect(toDatetimeLocalValue(chwila.toISOString())).toBe("2026-11-23T14:35:59");
  });
});

describe("fromDatetimeLocalValue", () => {
  it("pusty string zamienia na null", () => {
    expect(fromDatetimeLocalValue("")).toBeNull();
  });

  it("same spacje zamienia na null", () => {
    expect(fromDatetimeLocalValue("   ")).toBeNull();
  });

  it("nieprawidłową wartość zamienia na null (nie rzuca wyjątku)", () => {
    expect(fromDatetimeLocalValue("nie-data")).toBeNull();
  });

  it("konwertuje lokalny czas na ten sam moment co Date.toISOString", () => {
    const wartosc = "2026-03-15T09:20:30";
    const oczekiwane = new Date(2026, 2, 15, 9, 20, 30).toISOString();
    expect(fromDatetimeLocalValue(wartosc)).toBe(oczekiwane);
  });
});

describe("round-trip: zapis i odczyt tej samej lokalnej chwili", () => {
  it("toDatetimeLocalValue(fromDatetimeLocalValue(x)) zwraca dokładnie x, bez przesunięcia strefy", () => {
    const lokalny = "2026-06-01T00:05:07";
    expect(toDatetimeLocalValue(fromDatetimeLocalValue(lokalny))).toBe(lokalny);
  });
});
