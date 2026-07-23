import { describe, expect, it } from "vitest";
import {
  decimalSign,
  isValidDecimalString,
  normalizeDecimalInput,
  subtractDecimalStrings,
  sumDecimalStrings,
} from "./decimal";
import { blankTradeFormFields, buildTradeInput, validateTradeFormFormat } from "./tradeForm";

describe("normalizeDecimalInput", () => {
  it("przyjmuje przecinek jako separator dziesiętny (polska klawiatura)", () => {
    expect(normalizeDecimalInput("1,23")).toBe("1.23");
    expect(normalizeDecimalInput("0,01")).toBe("0.01");
    expect(normalizeDecimalInput("0,10")).toBe("0.10");
  });

  it("nie zmienia wartości zapisanych z kropką", () => {
    expect(normalizeDecimalInput("1.23")).toBe("1.23");
    expect(normalizeDecimalInput("0.01")).toBe("0.01");
    expect(normalizeDecimalInput("100")).toBe("100");
  });

  it("ignoruje spacje pełniące rolę separatora tysięcy", () => {
    expect(normalizeDecimalInput(" 1 000,50 ")).toBe("1000.50");
    expect(normalizeDecimalInput("10 000")).toBe("10000");
  });

  it("uzupełnia skrócone zapisy i znak dodatni", () => {
    expect(normalizeDecimalInput(",5")).toBe("0.5");
    expect(normalizeDecimalInput("-,5")).toBe("-0.5");
    expect(normalizeDecimalInput("5,")).toBe("5");
    expect(normalizeDecimalInput("+1,23")).toBe("1.23");
  });

  it("zachowuje wartości ujemne (korekty sald)", () => {
    expect(normalizeDecimalInput("-100,50")).toBe("-100.50");
  });

  it("odrzuca to, co nie jest liczbą", () => {
    expect(normalizeDecimalInput("")).toBeNull();
    expect(normalizeDecimalInput("abc")).toBeNull();
    expect(normalizeDecimalInput("1,2,3")).toBeNull();
    expect(normalizeDecimalInput("1.2.3")).toBeNull();
    expect(normalizeDecimalInput("-")).toBeNull();
  });

  it("isValidDecimalString akceptuje oba separatory", () => {
    expect(isValidDecimalString("1,23")).toBe(true);
    expect(isValidDecimalString("1.23")).toBe(true);
    expect(isValidDecimalString("abc")).toBe(false);
  });
});

describe("lot w formularzu transakcji", () => {
  it("wysyła lot wpisany z przecinkiem jako postać kanoniczną, a nie null", () => {
    const fields = { ...blankTradeFormFields(), volume: "1,23", entryPrice: "1,10500" };

    const input = buildTradeInput(fields, "konto-1");

    expect(input.volume).toBe("1.23");
    expect(input.entry_price).toBe("1.10500");
  });

  it("obsługuje lot ułamkowy 0,01", () => {
    const fields = { ...blankTradeFormFields(), volume: "0,01" };

    expect(buildTradeInput(fields, "konto-1").volume).toBe("0.01");
  });

  it("nie zgłasza błędu formatu dla lota z przecinkiem", () => {
    const fields = { ...blankTradeFormFields(), volume: "1,23" };

    expect(validateTradeFormFormat(fields)).toBeNull();
  });

  it("nadal odrzuca lot, który nie jest liczbą", () => {
    const fields = { ...blankTradeFormFields(), volume: "abc" };

    expect(validateTradeFormFormat(fields)).toContain("Lot");
  });
});

describe("dokładna arytmetyka dziesiętna (licznik lotów)", () => {
  it("sumuje bez błędu liczb zmiennoprzecinkowych", () => {
    // Number: 0.1 + 0.2 === 0.30000000000000004 - taki licznik wyglądałby jak awaria aplikacji.
    expect(sumDecimalStrings(["0.1", "0.2"])).toBe("0.3");
    expect(sumDecimalStrings(["0.3", "0.2"])).toBe("0.5");
  });

  it("radzi sobie z różną liczbą miejsc po przecinku", () => {
    expect(sumDecimalStrings(["0.5", "0.25", "1"])).toBe("1.75");
  });

  it("sumuje kwoty ujemne (częściowe zamknięcie ze stratą)", () => {
    expect(sumDecimalStrings(["45.10", "-12.40"])).toBe("32.7");
  });

  it("pusta lista daje zero, a nie null", () => {
    expect(sumDecimalStrings([])).toBe("0");
  });

  it("odrzuca wartości, które nie są liczbami", () => {
    expect(sumDecimalStrings(["1", "abc"])).toBeNull();
    expect(subtractDecimalStrings("1", "")).toBeNull();
  });

  it("odejmuje dokładnie i schodzi do zera bez reszty", () => {
    expect(subtractDecimalStrings("1.0", "0.3")).toBe("0.7");
    expect(subtractDecimalStrings("1.0", "1.0")).toBe("0");
    expect(subtractDecimalStrings("0.3", "0.5")).toBe("-0.2");
  });

  it("przyjmuje przecinek, tak jak reszta pól formularza", () => {
    expect(sumDecimalStrings(["0,3", "0,2"])).toBe("0.5");
  });

  it("rozpoznaje znak bez konwersji na Number", () => {
    expect(decimalSign("0")).toBe(0);
    expect(decimalSign("0.00")).toBe(0);
    expect(decimalSign("-0.2")).toBe(-1);
    expect(decimalSign("0.2")).toBe(1);
  });
});
