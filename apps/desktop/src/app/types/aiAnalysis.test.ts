import { describe, it, expect } from "vitest";
import type { AnalizaWynik, PostepPobrania } from "./aiAnalysis";
import { analizaDoTekstu, gigabajty, opisPostepuPobierania, parsujWynik } from "./aiAnalysis";

describe("parsujWynik", () => {
  it("czyta wszystkie pięć list z poprawnego JSON-a", () => {
    const json = JSON.stringify({
      fakty: ["f1"],
      obserwacje: ["o1"],
      hipotezy: ["h1"],
      rekomendacje: ["r1"],
      jakosc_danych: ["j1"],
    });
    expect(parsujWynik(json)).toEqual({
      fakty: ["f1"],
      obserwacje: ["o1"],
      hipotezy: ["h1"],
      rekomendacje: ["r1"],
      jakosc_danych: ["j1"],
    });
  });

  it("starszy 3-kluczowy zapis daje puste hipotezy i jakość danych", () => {
    const json = JSON.stringify({ fakty: ["a"], obserwacje: ["b"], rekomendacje: ["c"] });
    const w = parsujWynik(json);
    expect(w.fakty).toEqual(["a"]);
    expect(w.hipotezy).toEqual([]);
    expect(w.jakosc_danych).toEqual([]);
  });

  it("nieczytelny JSON daje wszystkie listy puste, nie rzuca", () => {
    expect(parsujWynik("{to nie jest json")).toEqual({
      fakty: [],
      obserwacje: [],
      hipotezy: [],
      rekomendacje: [],
      jakosc_danych: [],
    });
  });

  it("pole o złym typie (nie tablica) jest zastępowane pustą listą", () => {
    const json = JSON.stringify({ fakty: "nie tablica", obserwacje: null, rekomendacje: 7 });
    const w = parsujWynik(json);
    expect(w.fakty).toEqual([]);
    expect(w.obserwacje).toEqual([]);
    expect(w.rekomendacje).toEqual([]);
  });
});

describe("analizaDoTekstu", () => {
  const pelny: AnalizaWynik = {
    fakty: ["f1", "f2"],
    obserwacje: ["o1"],
    hipotezy: ["h1"],
    rekomendacje: ["r1"],
    jakosc_danych: ["j1"],
  };

  it("zawiera wszystkie sekcje w kolejności i punkty z myślnikiem", () => {
    const t = analizaDoTekstu(pelny);
    expect(t).toContain("Fakty:\n- f1\n- f2");
    expect(t).toContain("Jakość danych:\n- j1");
    // Kolejność: fakty → obserwacje → hipotezy → rekomendacje → jakość danych.
    expect(t.indexOf("Fakty:")).toBeLessThan(t.indexOf("Obserwacje:"));
    expect(t.indexOf("Obserwacje:")).toBeLessThan(t.indexOf("Hipotezy:"));
    expect(t.indexOf("Hipotezy:")).toBeLessThan(t.indexOf("Rekomendacje:"));
    expect(t.indexOf("Rekomendacje:")).toBeLessThan(t.indexOf("Jakość danych:"));
  });

  it("pomija puste sekcje", () => {
    const t = analizaDoTekstu({
      fakty: ["tylko fakt"],
      obserwacje: [],
      hipotezy: [],
      rekomendacje: [],
      jakosc_danych: [],
    });
    expect(t).toBe("Fakty:\n- tylko fakt");
    expect(t).not.toContain("Obserwacje");
  });

  it("pusty wynik daje pusty tekst", () => {
    expect(
      analizaDoTekstu({
        fakty: [],
        obserwacje: [],
        hipotezy: [],
        rekomendacje: [],
        jakosc_danych: [],
      }),
    ).toBe("");
  });
});

describe("gigabajty", () => {
  it("formatuje bajty jako dziesiętne GB z jednym miejscem", () => {
    expect(gigabajty(6_724_050_496)).toBe("6.7 GB");
    expect(gigabajty(0)).toBe("0.0 GB");
    expect(gigabajty(1_000_000_000)).toBe("1.0 GB");
  });
});

describe("opisPostepuPobierania", () => {
  function postep(over: Partial<PostepPobrania>): PostepPobrania {
    return { pobrano_bajtow: 0, calkowity_rozmiar: 0, status: "trwa", ...over };
  }

  it("brak postępu to samo „Pobieranie…”", () => {
    expect(opisPostepuPobierania(null)).toBe("Pobieranie…");
  });

  it("faza weryfikacji ma wyraźny komunikat (pasek wtedy stoi)", () => {
    expect(opisPostepuPobierania(postep({ status: "weryfikacja", pobrano_bajtow: 6e9 }))).toBe(
      "Sprawdzam już pobrane fragmenty…",
    );
  });

  it("pobieranie z rozmiarem pokazuje ile z ilu", () => {
    expect(
      opisPostepuPobierania(
        postep({ pobrano_bajtow: 3_000_000_000, calkowity_rozmiar: 6_000_000_000 }),
      ),
    ).toBe("Pobieranie — 3.0 GB / 6.0 GB");
  });

  it("bez znanego rozmiaru wraca do „Pobieranie…”", () => {
    expect(opisPostepuPobierania(postep({ pobrano_bajtow: 100, calkowity_rozmiar: 0 }))).toBe(
      "Pobieranie…",
    );
  });
});
