import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Audyt kontrastu tokenów (A1 planu, sekcja 18 promptu: WCAG AA dla tekstu).
 *
 * Test czyta tokeny WPROST z `tokens.css`, a nie z kopii w kodzie - inaczej pilnowałby własnej
 * listy zamiast tego, co naprawdę widzi użytkownik. Sprawdzane są tylko kombinacje, które
 * REALNIE występują w interfejsie: każdy kolor tekstu na każdej powierzchni, na której tekst
 * może się znaleźć (łącznie z najechanym wierszem tabeli i tłem menu). Kombinacje niemożliwe,
 * jak kolor serii wykresu na tle menu, celowo nie są liczone - fałszywe naruszenia zmusiłyby
 * do psucia palety pod sytuacje, które nie istnieją.
 */

const KATALOG = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(KATALOG, "tokens.css"), "utf8");

/** Wyciąga wartości tokenów z podanego bloku selektora. */
function tokensOf(selektor: string): Map<string, string> {
  const start = CSS.indexOf(selektor);
  if (start === -1) {
    throw new Error(`Nie znaleziono bloku ${selektor} w tokens.css`);
  }
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("\n}", open);
  const blok = CSS.slice(open, close);
  const mapa = new Map<string, string>();
  for (const [, nazwa, wartosc] of blok.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    mapa.set(nazwa as string, wartosc as string);
  }
  return mapa;
}

function kanaly(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const pelny =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(pelny.slice(0, 2), 16),
    parseInt(pelny.slice(2, 4), 16),
    parseInt(pelny.slice(4, 6), 16),
  ];
}

function luminancja(hex: string): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = kanaly(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function kontrast(a: string, b: string): number {
  const la = luminancja(a);
  const lb = luminancja(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Powierzchnie, na których może wylądować zwykły tekst. */
const TLA = [
  "--color-bg",
  "--color-surface",
  "--color-surface-alt",
  "--color-surface-nav",
  "--color-surface-hover",
];

const KOLORY_TEKSTU = ["--color-text", "--color-text-secondary", "--color-text-muted"];

/** Kolory semantyczne używane jako TEKST (kwoty, znaczniki) - na tłach treści, nie w menu. */
const TLA_TRESCI = [
  "--color-bg",
  "--color-surface",
  "--color-surface-alt",
  "--color-surface-hover",
];
const KOLORY_SEMANTYCZNE = [
  "--color-accent",
  "--color-profit",
  "--color-loss",
  "--color-info",
  "--color-warning",
  "--color-neutral",
];

const PROG_AA = 4.5;

describe.each([
  ["ciemny", ":root {"],
  ["jasny", ':root[data-theme="light"] {'],
])("kontrast tokenów - motyw %s", (_nazwa, selektor) => {
  // Motyw jasny nadpisuje tylko część tokenów, więc bierzemy go na tle pełnego zestawu.
  const bazowe = tokensOf(":root {");
  const wlasne = selektor === ":root {" ? bazowe : new Map([...bazowe, ...tokensOf(selektor)]);

  function wartosc(nazwa: string): string {
    const v = wlasne.get(nazwa);
    if (!v) {
      throw new Error(`Brak tokenu ${nazwa}`);
    }
    return v;
  }

  it.each(KOLORY_TEKSTU)("%s spełnia AA na każdej powierzchni z tekstem", (tekst) => {
    for (const tlo of TLA) {
      expect(kontrast(wartosc(tekst), wartosc(tlo)), `${tekst} na ${tlo}`).toBeGreaterThanOrEqual(
        PROG_AA,
      );
    }
  });

  it.each(KOLORY_SEMANTYCZNE)("%s spełnia AA na powierzchniach treści", (kolor) => {
    for (const tlo of TLA_TRESCI) {
      expect(kontrast(wartosc(kolor), wartosc(tlo)), `${kolor} na ${tlo}`).toBeGreaterThanOrEqual(
        PROG_AA,
      );
    }
  });

  it("napis na wypełnieniu akcentu jest czytelny", () => {
    // Przyciski główne mają złote tło i tekst --color-accent-contrast.
    expect(
      kontrast(wartosc("--color-accent-contrast"), wartosc("--color-accent")),
    ).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("tooltip wykresu ma wysoki kontrast", () => {
    expect(
      kontrast(wartosc("--color-tooltip-text"), wartosc("--color-tooltip-bg")),
    ).toBeGreaterThanOrEqual(7);
  });

  it("serie wykresów są czytelne na tle kart", () => {
    for (const seria of [1, 2, 3, 4]) {
      expect(
        kontrast(wartosc(`--color-chart-series-${seria}`), wartosc("--color-surface")),
        `seria ${seria}`,
      ).toBeGreaterThanOrEqual(PROG_AA);
    }
  });
});
