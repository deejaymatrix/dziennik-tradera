import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sekcja 21 promptu wymaga wprost: „animacje trwają około 120-180 ms". To było dotąd
 * potwierdzone wyłącznie przeglądem `tokens.css` (macierz, sekcja 1.1) - liczby porównane
 * ręcznie z tekstem promptu, bez testu pilnującego, że przyszła zmiana nie wypchnie ich poza
 * widełki. Test czyta wartości WPROST z `tokens.css`, nie z kopii w kodzie - ten sam wzorzec co
 * `tokens.test.ts` dla kolorów.
 */

const KATALOG = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(KATALOG, "tokens.css"), "utf8");

function czasTokenu(nazwa: string): number {
  const dopasowanie = new RegExp(`${nazwa}:\\s*(\\d+)ms\\s*;`).exec(CSS);
  if (!dopasowanie?.[1]) {
    throw new Error(`Nie znaleziono tokenu czasu ${nazwa} w tokens.css`);
  }
  return Number(dopasowanie[1]);
}

describe("czas trwania animacji (sekcja 21: 'ok. 120-180 ms')", () => {
  it.each([
    ["--motion-fast", "--motion-fast"],
    ["--motion-normal", "--motion-normal"],
    ["--motion-slow", "--motion-slow"],
  ])("%s mieści się w widełkach 120-180 ms", (_opis, nazwaTokenu) => {
    const ms = czasTokenu(nazwaTokenu);
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeLessThanOrEqual(180);
  });

  it("kolejność jest rosnąca: fast < normal < slow", () => {
    expect(czasTokenu("--motion-fast")).toBeLessThan(czasTokenu("--motion-normal"));
    expect(czasTokenu("--motion-normal")).toBeLessThan(czasTokenu("--motion-slow"));
  });
});
