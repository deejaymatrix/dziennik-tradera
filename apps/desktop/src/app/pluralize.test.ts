import { describe, expect, it } from "vitest";
import { pluralPl } from "./pluralize";

describe("pluralPl", () => {
  it("liczba 1 daje pierwszą formę", () => {
    expect(pluralPl(1, ["transakcja", "transakcje", "transakcji"])).toBe("transakcja");
  });

  it("2-4 dają drugą formę", () => {
    expect(pluralPl(2, ["transakcja", "transakcje", "transakcji"])).toBe("transakcje");
    expect(pluralPl(3, ["transakcja", "transakcje", "transakcji"])).toBe("transakcje");
    expect(pluralPl(4, ["transakcja", "transakcje", "transakcji"])).toBe("transakcje");
  });

  it("0, 5-21 i wielokrotności dziesiątek dają trzecią formę", () => {
    expect(pluralPl(0, ["transakcja", "transakcje", "transakcji"])).toBe("transakcji");
    expect(pluralPl(5, ["transakcja", "transakcje", "transakcji"])).toBe("transakcji");
    expect(pluralPl(21, ["transakcja", "transakcje", "transakcji"])).toBe("transakcji");
  });

  it("11-14 są wyjątkiem od reguły '2-4' mimo końcówki 2-4", () => {
    expect(pluralPl(12, ["transakcja", "transakcje", "transakcji"])).toBe("transakcji");
    expect(pluralPl(13, ["transakcja", "transakcje", "transakcji"])).toBe("transakcji");
    expect(pluralPl(14, ["transakcja", "transakcje", "transakcji"])).toBe("transakcji");
  });

  it("22-24 wracają do drugiej formy (12-14 to jedyny wyjątek)", () => {
    expect(pluralPl(22, ["transakcja", "transakcje", "transakcji"])).toBe("transakcje");
    expect(pluralPl(24, ["transakcja", "transakcje", "transakcji"])).toBe("transakcje");
  });

  it("działa z inną trójką form (pytanie/pytania/pytań)", () => {
    expect(pluralPl(1, ["pytanie", "pytania", "pytań"])).toBe("pytanie");
    expect(pluralPl(2, ["pytanie", "pytania", "pytań"])).toBe("pytania");
    expect(pluralPl(5, ["pytanie", "pytania", "pytań"])).toBe("pytań");
  });
});
