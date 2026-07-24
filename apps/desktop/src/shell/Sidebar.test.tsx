import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./Sidebar";
import styles from "./Sidebar.module.css";

function wyrenderuj(props: Partial<React.ComponentProps<typeof Sidebar>> = {}, path = "/") {
  const onToggleCollapsed = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar collapsed={false} onToggleCollapsed={onToggleCollapsed} {...props} />
    </MemoryRouter>,
  );
  return { onToggleCollapsed };
}

/**
 * `Sidebar` łączy DWA niezależne wejścia (`collapsed`, `showLabels`) w jedno `labelsVisible`,
 * a gdy etykiety są ukryte, pozycje nawigacji muszą i tak zostać identyfikowalne dla czytników
 * ekranu (WCAG 1.4.1) - przez `title` na linku i `<span class="sr-only">` zamiast usunięcia
 * tekstu. Błąd tu (np. usunięcie tekstu zamiast ukrycia go wizualnie) zamieniłby zwiniętą
 * nawigację w zestaw nieopisanych ikon. Dotąd zero testów.
 */
describe("Sidebar - widoczność etykiet (collapsed × showLabels)", () => {
  it("rozwinięty + showLabels=true (domyślnie): etykieta widoczna, bez title", () => {
    wyrenderuj({ collapsed: false, showLabels: true });
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).not.toHaveAttribute("title");
    const label = screen.getByText("Dashboard");
    expect(label.className).toBe(styles.navLabel);
  });

  it("zwinięty, NAWET z showLabels=true: etykieta ukryta wizualnie, ale nadal dostępna (title + sr-only)", () => {
    wyrenderuj({ collapsed: true, showLabels: true });
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("title", "Dashboard");
    const label = screen.getByText("Dashboard");
    expect(label.className).toBe("sr-only");
  });

  it("rozwinięty, ale showLabels=false: to samo ukrycie co przy collapsed", () => {
    wyrenderuj({ collapsed: false, showLabels: false });
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("title", "Dashboard");
    const label = screen.getByText("Dashboard");
    expect(label.className).toBe("sr-only");
  });
});

describe("Sidebar - przycisk zwijania", () => {
  it("rozwinięty pokazuje 'Zwiń nawigację' i woła onToggleCollapsed po kliknięciu", async () => {
    const user = userEvent.setup();
    const { onToggleCollapsed } = wyrenderuj({ collapsed: false });
    const przycisk = screen.getByRole("button", { name: "Zwiń nawigację" });
    await user.click(przycisk);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("zwinięty pokazuje 'Rozwiń nawigację'", () => {
    wyrenderuj({ collapsed: true });
    expect(screen.getByRole("button", { name: "Rozwiń nawigację" })).toBeInTheDocument();
  });
});

describe("Sidebar - oznaczanie aktywnej pozycji nawigacji", () => {
  it("na /kalendarz pozycja 'Dashboard' NIE jest aktywna, 'Kalendarz' jest", () => {
    wyrenderuj({}, "/kalendarz");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Kalendarz" })).toHaveAttribute("aria-current", "page");
  });
});
