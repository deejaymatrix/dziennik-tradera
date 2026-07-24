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

/**
 * Odpowiednik CSS `color-mix(in srgb, a P%, b)` - interpolacja liniowa kanałów w przestrzeni
 * sRGB (dokładnie tak jak silnik przeglądarki dla `in srgb`, bez przejścia przez liniowe RGB).
 * Gdy w CSS drugim kolorem jest `transparent`, matematycznie kompozycja tej częściowo
 * przezroczystej warstwy nad nieprzezroczystym tłem `b` daje IDENTYCZNY wynik co bezpośrednie
 * zmieszanie `a` z `b` w tej samej proporcji - stąd `b` niżej to zawsze realne, udokumentowane
 * przy każdym wywołaniu założenie o tym, co faktycznie renderuje się pod spodem.
 */
function mieszaj(a: string, procentA: number, b: string): string {
  const [ar, ag, ab] = kanaly(a);
  const [br, bg, bb] = kanaly(b);
  const kanal = (x: number, y: number): string =>
    Math.round(x * procentA + y * (1 - procentA))
      .toString(16)
      .padStart(2, "0");
  return `#${kanal(ar, br)}${kanal(ag, bg)}${kanal(ab, bb)}`;
}

/** Wyciąga tokeny postaci `--nazwa: 10%;` (procent intensywności `color-mix()`, nie kolor). */
function tokensProcentoweOf(selektor: string): Map<string, number> {
  const start = CSS.indexOf(selektor);
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("\n}", open);
  const blok = CSS.slice(open, close);
  const mapa = new Map<string, number>();
  for (const [, nazwa, wartosc] of blok.matchAll(/(--[\w-]+):\s*(\d+(?:\.\d+)?)%\s*;/g)) {
    mapa.set(nazwa as string, Number(wartosc) / 100);
  }
  return mapa;
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

  const bazoweProcentowe = tokensProcentoweOf(":root {");
  const wlasneProcentowe =
    selektor === ":root {"
      ? bazoweProcentowe
      : new Map([...bazoweProcentowe, ...tokensProcentoweOf(selektor)]);

  function procent(nazwa: string): number {
    const v = wlasneProcentowe.get(nazwa);
    if (v === undefined) {
      throw new Error(`Brak tokenu procentowego ${nazwa}`);
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

  /**
   * Powierzchnie budowane przez `color-mix()` w plikach CSS komponentów - POZA zakresem testu
   * powyżej, który sprawdza wyłącznie surowe tokeny. Każdy przypadek niżej odpowiada realnemu
   * miejscu w kodzie (plik i selektor w komentarzu), z tłem-pod-spodem ustalonym przez
   * przeczytanie kodu (kontener nadrzędny), nie zgadywane.
   */
  it.each([
    ["Badge accent", "--color-accent"],
    ["Badge profit", "--color-profit"],
    ["Badge loss", "--color-loss"],
    ["Badge info", "--color-info"],
    ["Badge warning", "--color-warning"],
  ] as const)(
    "%s: tekst tego samego koloru na przyciemnionym tle jest czytelny",
    (_nazwa, kolor) => {
      const tlo = mieszaj(wartosc(kolor), procent("--tint-badge"), wartosc("--color-surface"));
      expect(kontrast(wartosc(kolor), tlo)).toBeGreaterThanOrEqual(PROG_AA);
    },
  );

  it.each([
    ["HeatmapTable profit (najgorszy przypadek, --cell-opacity=0.55)", "--color-profit"],
    ["HeatmapTable loss (najgorszy przypadek, --cell-opacity=0.55)", "--color-loss"],
  ] as const)("%s", (_nazwa, kolor) => {
    // pnlOpacity() w HeatmapTable.tsx: 0.15 + 0.4 * ratio, ratio max 1 -> max 0.55.
    // Tekst komórki to --color-text (NIE --color-profit/--color-loss - patrz komentarz w
    // HeatmapTable.module.css), więc test sprawdza WŁAŚNIE tę parę, nie kolor-na-sobie.
    const tlo = mieszaj(wartosc(kolor), 0.55, wartosc("--color-surface"));
    expect(kontrast(wartosc("--color-text"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("CalendarPage .dayPnl na .profitDay/.lossDay (zgodnie z --tint-calendar-day w CSS)", () => {
    for (const kolor of ["--color-profit", "--color-loss"] as const) {
      const tlo = mieszaj(
        wartosc(kolor),
        procent("--tint-calendar-day"),
        wartosc("--color-surface"),
      );
      expect(kontrast(wartosc(kolor), tlo), kolor).toBeGreaterThanOrEqual(PROG_AA);
    }
  });

  it("Sidebar .navLinkActive: --color-text na 12% akcentu nad --color-surface-nav", () => {
    const tlo = mieszaj(wartosc("--color-accent"), 0.12, wartosc("--color-surface-nav"));
    expect(kontrast(wartosc("--color-text"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("SettingsPage .menuItemActive: --color-text (nie --color-text-muted) na 14% akcentu", () => {
    // Naprawiona luka WCAG AA - .menuItemActive miało `color: inherit` z .menuItem
    // (--color-text-muted), za słabe na tej powierzchni w obu motywach. Teraz jawnie
    // --color-text, tak jak w kodzie.
    const tlo = mieszaj(wartosc("--color-accent"), 0.14, wartosc("--color-surface"));
    expect(kontrast(wartosc("--color-text"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("TransactionsPage .selectedRow: --color-text na 8% akcentu nad --color-surface", () => {
    const tlo = mieszaj(wartosc("--color-accent"), 0.08, wartosc("--color-surface"));
    expect(kontrast(wartosc("--color-text"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("SettingRow .restartTag: --color-warning na --tint-tag ostrzeżenia nad --color-surface", () => {
    const tlo = mieszaj(
      wartosc("--color-warning"),
      procent("--tint-tag"),
      wartosc("--color-surface"),
    );
    expect(kontrast(wartosc("--color-warning"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("DataPage .restoreBanner: --color-text na 15% ostrzeżenia nad --color-surface (jawne w CSS)", () => {
    const tlo = mieszaj(wartosc("--color-warning"), 0.15, wartosc("--color-surface"));
    expect(kontrast(wartosc("--color-text"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });

  it("ErrorState: --color-text na 6% straty nad --color-surface (jawne w CSS)", () => {
    const tlo = mieszaj(wartosc("--color-loss"), 0.06, wartosc("--color-surface"));
    expect(kontrast(wartosc("--color-text"), tlo)).toBeGreaterThanOrEqual(PROG_AA);
  });
});
