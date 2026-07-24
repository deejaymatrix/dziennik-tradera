import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthCalendarTable } from "./MonthCalendarTable";
import styles from "./BreakdownTable.module.css";
import type { DailyPnl } from "../app/types/report";

function dzien(date: string, netPnl: string): DailyPnl {
  return { date, net_pnl: netPnl, trade_count: 1, win_count: 1, loss_count: 0 };
}

/**
 * `MonthCalendarTable` liczy skumulowany P&L wiersz-po-wierszu przez `sumDecimalStrings`
 * (dokładna arytmetyka na napisach) zamiast `Number(...)`, żeby uniknąć znanego błędu binarnej
 * zmiennoprzecinkowości (komentarz w źródle: "Number(...) przez trzydzieści dni miesiąca
 * odchylało ostatni wiersz o grosze"). Kolor kolumny "Skum. P&L" ma pochodzić ze ZNAKU
 * SKUMULOWANEJ wartości, nie ze znaku danego dnia - to dwie NIEZALEŻNE kolumny, każda z własnym
 * kolorem. Dotąd zero testów - błąd tu byłby niewidoczny w code review (kod "wygląda" poprawnie
 * dopóki nie policzy się realnych, precyzyjnych sum).
 */
describe("MonthCalendarTable - skumulowany P&L", () => {
  it("sumuje kolejne wiersze DOKŁADNIE, bez błędu zmiennoprzecinkowego (0.1 + 0.2 + 0.1 = 0.40)", () => {
    render(
      <MonthCalendarTable
        days={[dzien("2026-03-01", "0.1"), dzien("2026-03-02", "0.2"), dzien("2026-03-03", "0.1")]}
        currency="USD"
      />,
    );
    const wiersze = screen.getAllByRole("row").slice(1);
    expect(wiersze[0]).toHaveTextContent("+0,10");
    expect(wiersze[1]).toHaveTextContent("+0,30");
    expect(wiersze[2]).toHaveTextContent("+0,40");
  });

  it("kolumna 'dzień' i kolumna 'skumulowane' mają NIEZALEŻNE kolory - dzień stratny w zyskownym miesiącu", () => {
    render(
      <MonthCalendarTable
        days={[dzien("2026-03-01", "-200.00"), dzien("2026-03-02", "50.00")]}
        currency="USD"
      />,
    );
    const wiersze = screen.getAllByRole("row").slice(1);
    // Drugi dzień: SAM dzień jest zyskowny (+50), ale suma narastająca wciąż ujemna (-150).
    const drugiWiersz = wiersze[1];
    if (!drugiWiersz) {
      throw new Error("brak drugiego wiersza");
    }
    const komorki = drugiWiersz.querySelectorAll("td");
    const komorkaDnia = komorki[5];
    const komorkaSkumulowana = komorki[6];
    if (!komorkaDnia || !komorkaSkumulowana) {
      throw new Error("brak oczekiwanych komórek");
    }
    expect(komorkaDnia.textContent).toBe("+50,00 USD");
    expect(komorkaDnia.className).toContain(styles.profit);
    expect(komorkaSkumulowana.textContent).toBe("-150,00 USD");
    expect(komorkaSkumulowana.className).toContain(styles.loss);
  });

  it("renderuje datę i dzień tygodnia po polsku dla znanej daty", () => {
    render(<MonthCalendarTable days={[dzien("2026-03-02", "10.00")]} currency="USD" />);
    const wiersz = screen.getAllByRole("row")[1];
    expect(wiersz).toHaveTextContent("02.03.2026");
    // 2026-03-02 to poniedziałek.
    expect(wiersz).toHaveTextContent("poniedziałek");
  });
});
