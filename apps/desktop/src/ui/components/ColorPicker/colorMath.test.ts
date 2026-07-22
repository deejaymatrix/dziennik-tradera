import { describe, expect, it } from "vitest";
import { contrastTextFor, hexToHsv, hexToRgb, hsvToHex, normalizeHex, rgbToHex } from "./colorMath";

describe("normalizeHex", () => {
  it("przyjmuje zapis z kratką i bez", () => {
    expect(normalizeHex("#D7B45A")).toBe("#d7b45a");
    expect(normalizeHex("d7b45a")).toBe("#d7b45a");
    expect(normalizeHex("  #D7B45A  ")).toBe("#d7b45a");
  });

  it("rozwija zapis skrócony", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("f00")).toBe("#ff0000");
  });

  it("odrzuca to, co nie jest kolorem", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("zzzzzz")).toBeNull();
    expect(normalizeHex("#d7b45az")).toBeNull();
  });
});

describe("konwersje HSV ↔ HEX", () => {
  it("zachowuje kolor w obie strony", () => {
    for (const hex of ["#d7b45a", "#ff0000", "#00ff00", "#0000ff", "#123456", "#ffffff"]) {
      const hsv = hexToHsv(hex);
      if (!hsv) {
        throw new Error(`nie rozpoznano koloru ${hex}`);
      }
      expect(hsvToHex(hsv)).toBe(hex);
    }
  });

  it("rozpoznaje podstawowe odcienie", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 100, v: 100 });
    expect(hexToHsv("#00ff00")).toEqual({ h: 120, s: 100, v: 100 });
    expect(hexToHsv("#0000ff")).toEqual({ h: 240, s: 100, v: 100 });
  });

  it("czerń i biel nie mają nasycenia", () => {
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hexToHsv("#ffffff")).toEqual({ h: 0, s: 0, v: 100 });
  });

  it("przycina wartości spoza zakresu zamiast produkować śmieci", () => {
    expect(hsvToHex({ h: 400, s: 150, v: 150 })).toBe(hsvToHex({ h: 40, s: 100, v: 100 }));
    expect(hsvToHex({ h: -60, s: -10, v: 50 })).toBe(hsvToHex({ h: 300, s: 0, v: 50 }));
  });
});

describe("hexToRgb / rgbToHex", () => {
  it("czyta i składa kanały", () => {
    expect(hexToRgb("#d7b45a")).toEqual({ r: 215, g: 180, b: 90 });
    expect(rgbToHex({ r: 215, g: 180, b: 90 })).toBe("#d7b45a");
  });

  it("uzupełnia zera wiodące", () => {
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
  });
});

describe("contrastTextFor", () => {
  it("na jasnym tle daje ciemny tekst, na ciemnym jasny", () => {
    expect(contrastTextFor("#ffffff")).toBe("#0b0b0c");
    expect(contrastTextFor("#f5e6a8")).toBe("#0b0b0c");
    expect(contrastTextFor("#000000")).toBe("#ffffff");
    expect(contrastTextFor("#1b2a4a")).toBe("#ffffff");
  });

  it("dla niepoprawnego koloru nie wybucha, tylko zwraca biel", () => {
    expect(contrastTextFor("nie-kolor")).toBe("#ffffff");
  });
});
