import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TradePreviewCard } from "./TradePreviewCard";
import readOnlyFieldStyles from "../ui/components/ReadOnlyField/ReadOnlyField.module.css";
import type { TradeCalculation } from "../app/types/trade";

function kalkulacja(nadpisania: Partial<TradeCalculation> = {}): TradeCalculation {
  return {
    pnl_points: null,
    gross_pnl: null,
    net_pnl: null,
    pnl_percent: null,
    pnl_r: null,
    risk_amount: null,
    risk_percent: null,
    reward_amount: null,
    rr_planned: null,
    requires_conversion_rate: false,
    ...nadpisania,
  };
}

const KLASA_WARTOSCI = readOnlyFieldStyles.value ?? "value";

function wartoscWiersza(etykieta: string): string {
  const wiersz = screen.getByText(etykieta).closest("div");
  const wartosc = wiersz?.querySelector(`.${KLASA_WARTOSCI}`);
  if (!wartosc) {
    throw new Error(`brak wartości dla wiersza "${etykieta}"`);
  }
  return wartosc.textContent;
}

/**
 * `TradePreviewCard` pokazuje podgląd na żywo silnika przeliczeń - każde z siedmiu pól jest
 * NIEZALEŻNIE opcjonalne (`string | null`), więc każde ma własny fallback "—". Dwie
 * najbardziej ryzykowne części: (1) "Ryzyko (SL)" ma ZŁOŻONE formatowanie - dokleja "(X%)" tylko
 * gdy risk_percent JEST dostępny, inaczej zostawia samą kwotę bez pustego nawiasu; (2) "Wynik
 * netto" dostaje kolor (profit/loss) TYLKO gdy net_pnl nie jest null - przy null kolor NIE może
 * przeciekać z poprzedniego stanu. Dotąd zero testów.
 */
describe("TradePreviewCard - brak kalkulacji", () => {
  it("null pokazuje podpowiedź, nie kartę z wierszami", () => {
    render(<TradePreviewCard calculation={null} currency="USD" />);
    expect(
      screen.getByText("Uzupełnij instrument, cenę wejścia i lot, żeby zobaczyć podgląd wyniku."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Wynik netto")).not.toBeInTheDocument();
  });
});

describe("TradePreviewCard - wszystkie pola null", () => {
  it("każdy wiersz pokazuje myślnik", () => {
    render(<TradePreviewCard calculation={kalkulacja()} currency="USD" />);
    for (const etykieta of [
      "Ryzyko (SL)",
      "Potencjalny zysk (TP)",
      "RR planowane",
      "Wynik brutto",
      "Wynik netto",
      "R (wynik/ryzyko)",
      "Punkty",
    ]) {
      expect(wartoscWiersza(etykieta)).toBe("—");
    }
  });
});

describe("TradePreviewCard - 'Ryzyko (SL)': złożone formatowanie", () => {
  it("kwota BEZ procentu - sama kwota, bez pustych nawiasów", () => {
    render(
      <TradePreviewCard
        calculation={kalkulacja({ risk_amount: "100.00", risk_percent: null })}
        currency="USD"
      />,
    );
    expect(wartoscWiersza("Ryzyko (SL)")).toBe("100,00 USD");
  });

  it("kwota Z procentem - dokleja '(X%)'", () => {
    render(
      <TradePreviewCard
        calculation={kalkulacja({ risk_amount: "100.00", risk_percent: "2" })}
        currency="USD"
      />,
    );
    expect(wartoscWiersza("Ryzyko (SL)")).toBe("100,00 USD (2.00%)");
  });

  it("brak kwoty - myślnik, NIEZALEŻNIE od procentu", () => {
    render(
      <TradePreviewCard
        calculation={kalkulacja({ risk_amount: null, risk_percent: "2" })}
        currency="USD"
      />,
    );
    expect(wartoscWiersza("Ryzyko (SL)")).toBe("—");
  });
});

describe("TradePreviewCard - 'Wynik netto': kolor zależny od znaku, tylko gdy nie null", () => {
  it("dodatni net_pnl dostaje kolor profit", () => {
    render(<TradePreviewCard calculation={kalkulacja({ net_pnl: "50.00" })} currency="USD" />);
    const wierszNetto = screen.getByText("Wynik netto").closest("div");
    const komorka = wierszNetto?.querySelector(`.${KLASA_WARTOSCI}`);
    expect(komorka?.className).toContain(readOnlyFieldStyles.profit);
  });

  it("ujemny net_pnl dostaje kolor loss", () => {
    render(<TradePreviewCard calculation={kalkulacja({ net_pnl: "-50.00" })} currency="USD" />);
    const wierszNetto = screen.getByText("Wynik netto").closest("div");
    const komorka = wierszNetto?.querySelector(`.${KLASA_WARTOSCI}`);
    expect(komorka?.className).toContain(readOnlyFieldStyles.loss);
  });

  it("null net_pnl NIE dostaje ani profit, ani loss (myślnik bez koloru)", () => {
    render(<TradePreviewCard calculation={kalkulacja({ net_pnl: null })} currency="USD" />);
    const wierszNetto = screen.getByText("Wynik netto").closest("div");
    const komorka = wierszNetto?.querySelector(`.${KLASA_WARTOSCI}`);
    expect(komorka?.className).not.toContain(readOnlyFieldStyles.profit);
    expect(komorka?.className).not.toContain(readOnlyFieldStyles.loss);
  });
});

describe("TradePreviewCard - pozostałe pola", () => {
  it("R (wynik/ryzyko) dokleja 'R', Punkty formatuje z 1 miejscem po przecinku", () => {
    render(
      <TradePreviewCard
        calculation={kalkulacja({ pnl_r: "1.5", pnl_points: "12.345" })}
        currency="USD"
      />,
    );
    expect(wartoscWiersza("R (wynik/ryzyko)")).toBe("1.50R");
    expect(wartoscWiersza("Punkty")).toBe("12.3");
  });
});
