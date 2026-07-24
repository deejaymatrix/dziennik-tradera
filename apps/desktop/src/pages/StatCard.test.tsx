import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { StatCard } from "./StatCard";
import styles from "./StatCard.module.css";

/**
 * `StatCard` - kafelek KPI używany na Dashboardzie i w raportach. Dwie rzeczy nieoczywiste z samego
 * JSX: (1) `to` przełącza cały kafelek między `<Link>` (klikalny, prowadzi do danych źródłowych) a
 * zwykłym `<div>` - bez tego rozróżnienia KPI bez `to` wyglądałoby na klikalne, ale nic by się nie
 * działo po kliknięciu; (2) `tone` dokłada klasę `profit`/`loss` do samej WARTOŚCI, nie do całej
 * karty. Dotąd zero testów.
 */
describe("StatCard", () => {
  it("bez 'to' renderuje zwykły div, nie link", () => {
    render(<StatCard label="Win rate" value="60%" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Win rate")).toBeInTheDocument();
  });

  it("z 'to' renderuje link prowadzący do podanej ścieżki", () => {
    render(
      <MemoryRouter>
        <StatCard label="Transakcje" value="42" to="/transakcje" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Transakcje/ })).toHaveAttribute("href", "/transakcje");
  });

  it("tone='profit' dokłada klasę profit do wartości", () => {
    render(<StatCard label="P&L" value="+100 USD" tone="profit" />);
    expect(screen.getByText("+100 USD").className).toContain(styles.profit);
  });

  it("tone='loss' dokłada klasę loss do wartości", () => {
    render(<StatCard label="P&L" value="-100 USD" tone="loss" />);
    expect(screen.getByText("-100 USD").className).toContain(styles.loss);
  });

  it("emphasis='primary' dokłada klasę primary do całej karty", () => {
    render(<StatCard label="Saldo" value="1000 USD" emphasis="primary" />);
    expect(screen.getByText("Saldo").parentElement?.className).toContain(styles.primary);
  });
});
