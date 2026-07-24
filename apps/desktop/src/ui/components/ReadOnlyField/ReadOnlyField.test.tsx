import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadOnlyField } from "./ReadOnlyField";
import styles from "./ReadOnlyField.module.css";

/**
 * `ReadOnlyField` - siatka etykieta→wartość, konsolidacja wzorca powtórzonego wcześniej w
 * `TradeBalanceCard`/`TradePreviewCard`. Jedyna logika: `tone` dokłada klasę `profit`/`loss` do
 * WARTOŚCI (nie do całego wiersza), a jej brak nie dokłada żadnej z dwóch. Dotąd zero testów.
 */
describe("ReadOnlyField", () => {
  it("renderuje etykietę i wartość dla każdego wiersza", () => {
    render(<ReadOnlyField rows={[{ label: "Saldo", value: "1000 USD" }]} />);
    expect(screen.getByText("Saldo")).toBeInTheDocument();
    expect(screen.getByText("1000 USD")).toBeInTheDocument();
  });

  it("tone='profit' dokłada klasę profit do wartości", () => {
    render(<ReadOnlyField rows={[{ label: "P&L", value: "+50 USD", tone: "profit" }]} />);
    expect(screen.getByText("+50 USD").className).toContain(styles.profit);
  });

  it("tone='loss' dokłada klasę loss do wartości", () => {
    render(<ReadOnlyField rows={[{ label: "P&L", value: "-50 USD", tone: "loss" }]} />);
    expect(screen.getByText("-50 USD").className).toContain(styles.loss);
  });

  it("brak tone nie dokłada ani profit, ani loss", () => {
    render(<ReadOnlyField rows={[{ label: "Lot", value: "1.00" }]} />);
    const wartosc = screen.getByText("1.00");
    expect(wartosc.className).not.toContain(styles.profit);
    expect(wartosc.className).not.toContain(styles.loss);
  });
});
