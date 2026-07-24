import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeBarShape } from "./barShape";
import { chartSeriesColor } from "./chartTheme";
import type { BarShapeProps } from "recharts";

function wlasciwosci(overrides: Partial<BarShapeProps> = {}): BarShapeProps {
  return {
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    value: 0,
    ...overrides,
  } as BarShapeProps;
}

function narysujKsztalt(tone: "profit-loss" | "neutral", props: BarShapeProps) {
  const Ksztalt = makeBarShape(tone);
  const { container } = render(
    <svg>
      <Ksztalt {...props} />
    </svg>,
  );
  const rect = container.querySelector("rect");
  if (!rect) {
    throw new Error("brak wyrenderowanego <rect>");
  }
  return rect;
}

/**
 * `makeBarShape` decyduje o kolorze słupka - `tone="neutral"` MUSI ignorować znak wartości
 * (np. win rate, liczba transakcji - 20% win rate nie jest "stratą" tylko dlatego, że można by
 * pomylić dodatnią liczbę z zyskiem). Tylko `tone="profit-loss"` koloruje wg znaku. Druga
 * ryzykowna część: Recharts daje słupkom poniżej zera UJEMNĄ wysokość, a SVG odmawia narysowania
 * `<rect>` z ujemną szerokością/wysokością (element się po prostu nie renderuje) - trzeba
 * znormalizować do dodatniej wysokości i przesunąć `y`. Dotąd zero testów.
 */
describe("makeBarShape - kolor zależny od tone, nie zawsze od znaku", () => {
  it("tone='profit-loss', wartość dodatnia: kolor zysku", () => {
    const rect = narysujKsztalt("profit-loss", wlasciwosci({ value: 50, height: 40 }));
    expect(rect).toHaveAttribute("fill", "var(--color-profit)");
  });

  it("tone='profit-loss', wartość ujemna: kolor straty", () => {
    const rect = narysujKsztalt("profit-loss", wlasciwosci({ value: -50, height: -40 }));
    expect(rect).toHaveAttribute("fill", "var(--color-loss)");
  });

  it("tone='neutral' z UJEMNĄ wartością NADAL dostaje neutralny kolor serii, nie kolor straty", () => {
    const rect = narysujKsztalt("neutral", wlasciwosci({ value: -50, height: -40 }));
    expect(rect).toHaveAttribute("fill", chartSeriesColor(0));
    expect(rect).not.toHaveAttribute("fill", "var(--color-loss)");
  });
});

describe("makeBarShape - normalizacja ujemnej wysokości (obejście ograniczenia SVG)", () => {
  it("dodatnia wysokość: y i height bez zmian", () => {
    const rect = narysujKsztalt("profit-loss", wlasciwosci({ y: 20, height: 40, value: 1 }));
    expect(rect).toHaveAttribute("y", "20");
    expect(rect).toHaveAttribute("height", "40");
  });

  it("ujemna wysokość: y przesunięty o różnicę, height dodatnie (|height|)", () => {
    const rect = narysujKsztalt("profit-loss", wlasciwosci({ y: 100, height: -25, value: -1 }));
    expect(rect).toHaveAttribute("y", "75");
    expect(rect).toHaveAttribute("height", "25");
  });
});
