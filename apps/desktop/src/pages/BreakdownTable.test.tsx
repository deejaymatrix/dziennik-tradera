import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BreakdownTable } from "./BreakdownTable";
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

/**
 * `BreakdownTable` jest wspólnym komponentem dla WSZYSTKICH podraportów zakładki Raporty (miesiąc,
 * rok, instrument, strategia) - drill-down po kliknięciu wiersza musi działać też z klawiatury
 * (WAI-ARIA "row jako przycisk": `role="button"`, `tabIndex`, obsługa Enter/Spacji). Błąd tu (np.
 * brakujący `onKeyDown`) byłby niewidoczny dla użytkownika myszy, ale całkowicie blokowałby
 * drill-down dla użytkownika klawiatury. Dotąd zero testów.
 */
describe("BreakdownTable - pusta lista", () => {
  it("puste rows pokazuje komunikat, nie pustą tabelę", () => {
    render(<BreakdownTable rows={[]} currency="USD" />);
    expect(screen.getByText("Brak danych.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("BreakdownTable - bez onRowClick: wiersze NIE są interaktywne", () => {
  it("wiersz nie ma role='button' ani aria-label drill-down", () => {
    render(<BreakdownTable rows={[wiersz("a", "10.00")]} currency="USD" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const wiersze = screen.getAllByRole("row");
    expect(wiersze[1]).not.toHaveAttribute("tabindex");
  });
});

describe("BreakdownTable - z onRowClick: wiersze dostępne z klawiatury", () => {
  it("wiersz dostaje role='button', tabIndex=0 i opisową aria-label", () => {
    render(
      <BreakdownTable rows={[wiersz("EURUSD", "10.00")]} currency="USD" onRowClick={vi.fn()} />,
    );
    const przycisk = screen.getByRole("button", { name: "Pokaż szczegóły: EURUSD" });
    expect(przycisk).toHaveAttribute("tabindex", "0");
  });

  it("klik wywołuje onRowClick z kluczem wiersza", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BreakdownTable rows={[wiersz("EURUSD", "10.00")]} currency="USD" onRowClick={onRowClick} />,
    );

    await user.click(screen.getByRole("button", { name: "Pokaż szczegóły: EURUSD" }));
    expect(onRowClick).toHaveBeenCalledExactlyOnceWith("EURUSD");
  });

  it("Enter na sfokusowanym wierszu wywołuje onRowClick", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BreakdownTable rows={[wiersz("EURUSD", "10.00")]} currency="USD" onRowClick={onRowClick} />,
    );

    screen.getByRole("button", { name: "Pokaż szczegóły: EURUSD" }).focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledExactlyOnceWith("EURUSD");
  });

  it("Spacja na sfokusowanym wierszu wywołuje onRowClick", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BreakdownTable rows={[wiersz("EURUSD", "10.00")]} currency="USD" onRowClick={onRowClick} />,
    );

    screen.getByRole("button", { name: "Pokaż szczegóły: EURUSD" }).focus();
    await user.keyboard(" ");
    expect(onRowClick).toHaveBeenCalledExactlyOnceWith("EURUSD");
  });

  it("inny klawisz (np. 'a') NIE wywołuje onRowClick", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BreakdownTable rows={[wiersz("EURUSD", "10.00")]} currency="USD" onRowClick={onRowClick} />,
    );

    screen.getByRole("button", { name: "Pokaż szczegóły: EURUSD" }).focus();
    await user.keyboard("a");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
