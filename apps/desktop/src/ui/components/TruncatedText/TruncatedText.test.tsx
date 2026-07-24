import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TruncatedText } from "./TruncatedText";

/** JSDOM nie liczy prawdziwego layoutu - `scrollWidth`/`clientWidth` trzeba ustawić ręcznie,
 * żeby zasymulować tekst faktycznie obcięty (scrollWidth > clientWidth) albo mieszczący się
 * w całości (równe). */
function mockOverflow(scrollWidth: number, clientWidth: number): void {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

describe("TruncatedText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("nie pokazuje tooltipa, gdy tekst mieści się w całości", () => {
    mockOverflow(100, 100);
    render(<TruncatedText text="Krótka strategia" />);

    expect(screen.getByText("Krótka strategia")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByText("Krótka strategia")).not.toHaveAttribute("tabIndex");
  });

  it("pokazuje pełną treść w tooltipie po najechaniu, gdy tekst jest obcięty", async () => {
    mockOverflow(300, 100);
    const user = userEvent.setup();
    const longName = "Bardzo długa nazwa strategii, która na pewno się nie mieści w kolumnie";
    render(<TruncatedText text={longName} />);

    const span = screen.getByText(longName);
    expect(span).toHaveAttribute("tabIndex", "0");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(span);
    expect(screen.getByRole("tooltip")).toHaveTextContent(longName);
  });

  it("dostępne z klawiatury - tooltip pokazuje się też przy focusie, nie tylko hover", async () => {
    mockOverflow(300, 100);
    const user = userEvent.setup();
    const longName = "Inna bardzo długa wartość, która przekracza dostępną szerokość kolumny";
    render(<TruncatedText text={longName} />);
    // Referencja PRZED focusem - po pojawieniu się tooltipa `getByText` jest niejednoznaczne,
    // bo dymek zawiera dokładnie tę samą treść co element wyzwalający.
    const trigger = screen.getByText(longName);

    await user.tab();

    expect(trigger).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent(longName);
  });
});
