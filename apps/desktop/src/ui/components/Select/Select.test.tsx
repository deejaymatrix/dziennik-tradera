import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

const OPCJE = [
  { value: "buy", label: "BUY" },
  { value: "sell", label: "SELL" },
];

/**
 * `Select` miał tę samą deklarowaną dostępność co `TextField` (aria-invalid/aria-describedby/
 * role="alert"), ale wcześniej była ona potwierdzona wyłącznie przeglądem kodu (`grep`), nie
 * rzeczywistym renderem - dokładnie ta sama klasa luki, jaką ta sesja znalazła już kilkukrotnie
 * przy innych "✅ potwierdzonych" miejscach O7. Ten plik lustrzanie odtwarza istniejące,
 * sprawdzone testy `TextField.test.tsx`.
 */
describe("Select", () => {
  it("associates the label with the select so it's reachable by accessible name", () => {
    render(<Select label="Kierunek" options={OPCJE} />);
    expect(screen.getByLabelText("Kierunek")).toBeInTheDocument();
  });

  it("lets the user pick an option", async () => {
    const user = userEvent.setup();
    render(<Select label="Kierunek" options={OPCJE} />);

    const pole = screen.getByLabelText("Kierunek");
    await user.selectOptions(pole, "sell");
    expect(pole).toHaveValue("sell");
  });

  it("marks the field invalid and announces the error message", () => {
    render(<Select label="Waluta" options={OPCJE} error="Wybierz walutę." />);

    const pole = screen.getByLabelText("Waluta");
    expect(pole).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Wybierz walutę.");
  });
});
