import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeatmapTable } from "./HeatmapTable";
import type { GroupBreakdown } from "../app/types/report";

function wiersz(key: string, netPnl: string): GroupBreakdown {
  return {
    key,
    label: key,
    trade_count: 1,
    win_count: 1,
    loss_count: 0,
    win_rate: "50",
    net_pnl: netPnl,
  };
}

function nieprzezroczystoscKomorki(etykieta: string): number {
  const komorka = screen.getByText(etykieta).closest("tr")?.querySelector("td:nth-child(3)");
  const wartosc = komorka?.getAttribute("style")?.match(/--cell-opacity:\s*([\d.]+)/)?.[1];
  if (!wartosc) {
    throw new Error(`brak --cell-opacity dla wiersza "${etykieta}"`);
  }
  return Number(wartosc);
}

/**
 * `pnlOpacity` (prywatna funkcja w HeatmapTable.tsx) skaluje nieprzezroczystość komórki
 * "Wynik netto" w heatmapie Dashboardu. Górna granica 0,55 (nie 0,70 jak wcześniej) to
 * ZNALEZISKO AUDYTU WCAG AA - kontrast tekstu na tle zmieszanym z kolorem zysku/straty schodzi
 * poniżej 4,5:1 powyżej ~0,59. `design/tokens.test.ts` weryfikuje kontrast PRZY ZAŁOŻENIU, że
 * 0,55 to faktyczny sufit - ale nic nie sprawdzało, czy `pnlOpacity` SAMA w sobie rzeczywiście
 * nigdy go nie przekracza. Zmiana mnożnika 0.4 na coś większego cicho złamałaby to założenie,
 * nie dotykając tokens.test.ts w ogóle.
 */
describe("HeatmapTable - skala nieprzezroczystości komórek (WCAG AA)", () => {
  it("wiersz o NAJWIĘKSZEJ wartości bezwzględnej osiąga dokładnie sufit 0,55", () => {
    render(
      <HeatmapTable rows={[wiersz("mały", "10.00"), wiersz("duży", "-100.00")]} currency="USD" />,
    );
    expect(nieprzezroczystoscKomorki("duży")).toBeCloseTo(0.55, 5);
  });

  it("wiersz o mniejszej wartości bezwzględnej dostaje proporcjonalnie mniejszą nieprzezroczystość", () => {
    render(
      <HeatmapTable rows={[wiersz("mały", "10.00"), wiersz("duży", "-100.00")]} currency="USD" />,
    );
    // mały: 0.15 + 0.4 * (10/100) = 0.19
    expect(nieprzezroczystoscKomorki("mały")).toBeCloseTo(0.19, 5);
    expect(nieprzezroczystoscKomorki("mały")).toBeLessThan(nieprzezroczystoscKomorki("duży"));
  });

  it("same zera dają minimalną nieprzezroczystość 0,15, nie zero (dzielnik nigdy nie schodzi poniżej 1)", () => {
    render(<HeatmapTable rows={[wiersz("zero", "0.00")]} currency="USD" />);
    expect(nieprzezroczystoscKomorki("zero")).toBeCloseTo(0.15, 5);
  });

  it("kolor komórki (profit/loss) zależy od znaku, niezależnie od nieprzezroczystości", () => {
    render(
      <HeatmapTable rows={[wiersz("zysk", "5.00"), wiersz("strata", "-5.00")]} currency="USD" />,
    );
    const komorkaZysk = screen.getByText("zysk").closest("tr")?.querySelector("td:nth-child(3)");
    const komorkaStrata = screen
      .getByText("strata")
      .closest("tr")
      ?.querySelector("td:nth-child(3)");
    expect(komorkaZysk?.className).toMatch(/profit/);
    expect(komorkaStrata?.className).toMatch(/loss/);
  });
});
