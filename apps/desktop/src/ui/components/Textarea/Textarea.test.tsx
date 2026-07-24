import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea";

/**
 * `Textarea` miał tę samą deklarowaną dostępność co `TextField` (aria-invalid/aria-describedby/
 * role="alert"), ale wcześniej była ona potwierdzona wyłącznie przeglądem kodu (`grep`), nie
 * rzeczywistym renderem - dokładnie ta sama klasa luki, jaką ta sesja znalazła już kilkukrotnie
 * przy innych "✅ potwierdzonych" miejscach O7. Ten plik lustrzanie odtwarza istniejące,
 * sprawdzone testy `TextField.test.tsx`.
 */
describe("Textarea", () => {
  it("associates the label with the textarea so it's reachable by accessible name", () => {
    render(<Textarea label="Opis" />);
    expect(screen.getByLabelText("Opis")).toBeInTheDocument();
  });

  it("lets the user type into the field", async () => {
    const user = userEvent.setup();
    render(<Textarea label="Opis" />);

    const pole = screen.getByLabelText("Opis");
    await user.type(pole, "Strategia trendowa");
    expect(pole).toHaveValue("Strategia trendowa");
  });

  it("marks the field invalid and announces the error message", () => {
    render(<Textarea label="Powód niespełnienia" error="Podaj powód niespełnienia tej zasady." />);

    const pole = screen.getByLabelText("Powód niespełnienia");
    expect(pole).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Podaj powód niespełnienia tej zasady.");
  });
});
