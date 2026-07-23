import { beforeEach, describe, expect, it } from "vitest";
import {
  applyNewTradeDefaults,
  blankPartialCloseRow,
  blankTradeFormFields,
  buildTradeInput,
  clearTradeDraft,
  isBlankPartialCloseRow,
  loadTradeDraft,
  resolveDefaultAccountId,
  saveTradeDraft,
  validateTradeFormFormat,
} from "./tradeForm";
import type { TradeFormFields } from "./tradeForm";

/**
 * `tradeForm.ts` zamienia pola formularza na dane wysyłane do backendu - to ostatni punkt,
 * w którym da się jeszcze wysłać coś innego, niż użytkownik wpisał. Tu mieszkał błąd, przez
 * który lot `1,23` z polskiej klawiatury szedł do zapisu jako `null`: walidacja przyjmowała
 * tylko kropkę, więc pole „przechodziło" puste, a transakcja zapisywała się bez lota.
 */

function pola(nadpisania: Partial<TradeFormFields> = {}): TradeFormFields {
  return { ...blankTradeFormFields(), ...nadpisania };
}

describe("buildTradeInput - liczby", () => {
  it("przyjmuje przecinek dziesiętny tak samo jak kropkę", () => {
    // To jest ten błąd. Obie postaci muszą dać identyczny wynik.
    const przecinek = buildTradeInput(pola({ volume: "1,23", entryPrice: "1,10500" }), "k1");
    const kropka = buildTradeInput(pola({ volume: "1.23", entryPrice: "1.10500" }), "k1");

    expect(przecinek.volume).toBe("1.23");
    expect(przecinek.volume).toBe(kropka.volume);
    expect(przecinek.entry_price).toBe(kropka.entry_price);
  });

  it("loty z listy obowiązkowych przypadków nie gubią się po drodze", () => {
    const przypadki: [string, string][] = [
      ["0,01", "0.01"],
      ["0,10", "0.10"],
      ["1,00", "1.00"],
      ["1,23", "1.23"],
    ];
    for (const [wpisane, oczekiwane] of przypadki) {
      expect(buildTradeInput(pola({ volume: wpisane }), "k1").volume).toBe(oczekiwane);
    }
  });

  it("puste pole liczbowe idzie jako null, a nie jako zero", () => {
    // Zero i „nie podano" to dwie różne rzeczy: zero jest wartością, brak nie jest.
    const wynik = buildTradeInput(pola(), "k1");
    expect(wynik.volume).toBeNull();
    expect(wynik.entry_price).toBeNull();
    expect(wynik.stop_loss).toBeNull();
  });

  it("koszty bez wpisanej wartości idą jako zero, bo brak kosztu to koszt zerowy", () => {
    const wynik = buildTradeInput(pola(), "k1");
    expect(wynik.commission).toBe("0");
    expect(wynik.swap).toBe("0");
    expect(wynik.other_fees).toBe("0");
  });

  it("wartości ujemne przechodzą - strata i ujemny swap są poprawne", () => {
    const wynik = buildTradeInput(pola({ swap: "-3,20", otherFees: "-0,5" }), "k1");
    expect(wynik.swap).toBe("-3.20");
    expect(wynik.other_fees).toBe("-0.5");
  });
});

describe("buildTradeInput - tekst i identyfikatory", () => {
  it("puste identyfikatory idą jako null, nie jako pusty napis", () => {
    // Pusty napis po stronie Rusta jest PRAWDZIWYM identyfikatorem i nie pasowałby do niczego.
    const wynik = buildTradeInput(pola({ instrumentId: "", strategyId: "", intervalId: "" }), "k1");
    expect(wynik.instrument_id).toBeNull();
    expect(wynik.strategy_id).toBeNull();
    expect(wynik.interval_id).toBeNull();
  });

  it("notatki złożone z samych spacji idą jako null", () => {
    const wynik = buildTradeInput(pola({ planBefore: "   ", conclusion: "\n\t" }), "k1");
    expect(wynik.plan_before).toBeNull();
    expect(wynik.conclusion).toBeNull();
  });

  it("notatka z treścią przechodzi w całości, ze spacjami po bokach", () => {
    // Nie przycinamy treści - użytkownik mógł celowo sformatować notatkę.
    const wynik = buildTradeInput(pola({ planBefore: "  Plan: wybicie  " }), "k1");
    expect(wynik.plan_before).toBe("  Plan: wybicie  ");
  });

  it("konto bierze się z argumentu, nie z pól formularza", () => {
    expect(buildTradeInput(pola(), "konto-xyz").account_id).toBe("konto-xyz");
  });
});

describe("buildTradeInput - częściowe zamknięcia", () => {
  it("puste wiersze odpadają zamiast lecieć jako zera", () => {
    const wynik = buildTradeInput(
      pola({ partialCloses: [blankPartialCloseRow(), blankPartialCloseRow()] }),
      "k1",
    );
    expect(wynik.partial_closes).toEqual([]);
  });

  it("uzupełnione wiersze przechodzą z przecinkiem zamienionym na kropkę", () => {
    const wynik = buildTradeInput(
      pola({
        partialCloses: [
          { closedVolume: "0,5", realizedPnl: "120,50" },
          { closedVolume: "0,5", realizedPnl: "-40,25" },
        ],
      }),
      "k1",
    );
    expect(wynik.partial_closes).toEqual([
      { closed_volume: "0.5", realized_pnl: "120.50" },
      { closed_volume: "0.5", realized_pnl: "-40.25" },
    ]);
  });

  it("wiersz z lotem i bez kwoty leci z kwotą zero, a nie odpada", () => {
    // Odrzucenie takiego wiersza po cichu zmieniłoby wynik pozycji - lepiej, żeby doszedł
    // do backendu i tam został oceniony.
    const wynik = buildTradeInput(
      pola({ partialCloses: [{ closedVolume: "0,5", realizedPnl: "" }] }),
      "k1",
    );
    expect(wynik.partial_closes).toEqual([{ closed_volume: "0.5", realized_pnl: "0" }]);
  });
});

describe("validateTradeFormFormat", () => {
  it("poprawny formularz nie zgłasza nic", () => {
    expect(validateTradeFormFormat(pola({ volume: "1,23", entryPrice: "1.105" }))).toBeNull();
  });

  it("wskazuje POLE, w którym jest błąd, po polsku", () => {
    const komunikat = validateTradeFormFormat(pola({ volume: "abc" }));
    expect(komunikat).toContain("Lot");
    expect(komunikat).toContain("liczbą");
  });

  it("przepuszcza puste pola - brak wartości to nie błąd formatu", () => {
    expect(validateTradeFormFormat(pola())).toBeNull();
  });

  it("wskazuje NUMER wpisu przy błędzie w częściowych zamknięciach", () => {
    // Zamknięć bywa wiele; samo „lot musi być liczbą" nie mówi, gdzie szukać.
    const komunikat = validateTradeFormFormat(
      pola({
        partialCloses: [
          { closedVolume: "0,5", realizedPnl: "10" },
          { closedVolume: "xyz", realizedPnl: "10" },
        ],
      }),
    );
    expect(komunikat).toContain("nr 2");
  });

  it("wymaga lota w uzupełnionym wpisie częściowego zamknięcia", () => {
    const komunikat = validateTradeFormFormat(
      pola({ partialCloses: [{ closedVolume: "", realizedPnl: "10" }] }),
    );
    expect(komunikat).toContain("Podaj zamknięty lot");
  });

  it("pomija wiersze całkiem puste", () => {
    expect(validateTradeFormFormat(pola({ partialCloses: [blankPartialCloseRow()] }))).toBeNull();
  });
});

describe("isBlankPartialCloseRow", () => {
  it("wiersz z samymi spacjami liczy się jako pusty", () => {
    expect(isBlankPartialCloseRow({ closedVolume: "  ", realizedPnl: "\t" })).toBe(true);
  });

  it("wiersz z jakąkolwiek wartością nie jest pusty", () => {
    expect(isBlankPartialCloseRow({ closedVolume: "0", realizedPnl: "" })).toBe(false);
    expect(isBlankPartialCloseRow({ closedVolume: "", realizedPnl: "0" })).toBe(false);
  });
});

describe("resolveDefaultAccountId", () => {
  it("bez preferencji używa ostatnio używanego konta", () => {
    expect(resolveDefaultAccountId(undefined, "ostatnie")).toBe("ostatnie");
  });

  it("wybór konkretnego konta wygrywa z ostatnio używanym", () => {
    const defaults = {
      default_account: { kind: "specific" as const, account_id: "wybrane" },
    };
    expect(resolveDefaultAccountId(defaults as never, "ostatnie")).toBe("wybrane");
  });

  it("ustawienie ostatnio używanego konta faktycznie je bierze", () => {
    const defaults = { default_account: { kind: "last_used" as const } };
    expect(resolveDefaultAccountId(defaults as never, "ostatnie")).toBe("ostatnie");
  });

  it("ustawienie braku domyślnego konta nie podpowiada niczego", () => {
    const defaults = { default_account: { kind: "none" as const } };
    expect(resolveDefaultAccountId(defaults as never, "ostatnie")).toBe("");
  });
});

describe("applyNewTradeDefaults", () => {
  it("bez preferencji zostawia formularz pusty", () => {
    const wynik = applyNewTradeDefaults(blankTradeFormFields(), undefined);
    expect(wynik.intervalId).toBe("");
    expect(wynik.session).toBe("");
  });

  it("nigdy nie podpowiada instrumentu, kierunku ani strategii", () => {
    // Świadome ograniczenie ze specyfikacji: te trzy pola użytkownik ma wybrać sam,
    // bo podpowiedź zwiększa ryzyko zapisania transakcji z cudzymi parametrami.
    const defaults = {
      default_account: { kind: "none" as const },
      default_interval_id: "in1",
      default_session: "Londyn",
    };
    const wynik = applyNewTradeDefaults(blankTradeFormFields(), defaults as never);
    expect(wynik.intervalId).toBe("in1");
    expect(wynik.session).toBe("Londyn");
    expect(wynik.instrumentId).toBe("");
    expect(wynik.strategyId).toBe("");
  });
});

describe("szkic transakcji w localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("zapisany szkic wraca w całości", () => {
    const szkic = pola({ volume: "1,23", planBefore: "Plan" });
    saveTradeDraft("k1", "t1", szkic);
    expect(loadTradeDraft("k1", "t1")?.volume).toBe("1,23");
  });

  it("szkice są rozdzielone per konto i per transakcja", () => {
    saveTradeDraft("k1", "t1", pola({ volume: "1" }));
    saveTradeDraft("k2", "t1", pola({ volume: "2" }));
    saveTradeDraft("k1", undefined, pola({ volume: "3" }));

    expect(loadTradeDraft("k1", "t1")?.volume).toBe("1");
    expect(loadTradeDraft("k2", "t1")?.volume).toBe("2");
    expect(loadTradeDraft("k1", undefined)?.volume).toBe("3");
  });

  it("czyszczenie usuwa tylko wskazany szkic", () => {
    saveTradeDraft("k1", "t1", pola({ volume: "1" }));
    saveTradeDraft("k1", "t2", pola({ volume: "2" }));

    clearTradeDraft("k1", "t1");

    expect(loadTradeDraft("k1", "t1")).toBeNull();
    expect(loadTradeDraft("k1", "t2")?.volume).toBe("2");
  });

  it("uszkodzony szkic nie wywraca formularza", () => {
    // Szkic to wygoda, nie dane - uszkodzony wpis ma zostać zignorowany, a nie zablokować
    // otwarcie transakcji.
    localStorage.setItem("dziennik-tradera:trade-draft:k1:t1", "{to nie jest JSON");
    expect(loadTradeDraft("k1", "t1")).toBeNull();
  });
});
