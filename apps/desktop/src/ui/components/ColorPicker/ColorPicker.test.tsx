import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

function otworz() {
  return screen.getByRole("button", { name: /Otwórz selektor koloru/ });
}

/**
 * `ColorPicker` - selektor koloru strategii (pole nasycenia/jasności, suwak barwy, HEX). Kluczowa,
 * nieoczywista z samego JSX zasada: kolor NIE trafia do formularza w trakcie wybierania -
 * `onChange` woła się WYŁĄCZNIE po kliknięciu "Zatwierdź", nigdy podczas przeciągania suwaka czy
 * pisania w polu HEX. "Anuluj" porzuca szkic, a KOLEJNE otwarcie panelu startuje od `value`
 * obowiązującego w formularzu, nie od porzuconego szkicu - inaczej "pobawienie się" kolorem i
 * wycofanie zostawiłoby ślad przy następnym otwarciu. Czysta matematyka konwersji HSV/HEX ma
 * własne testy w `colorMath.test.ts` - tu testujemy wyłącznie komponent i jego stan. Dotąd zero
 * testów.
 */
describe("ColorPicker", () => {
  it("przycisk pokazuje aktualny kolor formularza, zanim panel się otworzy", () => {
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} sampleLabel="Breakout" />);
    expect(screen.getByText("#ff0000")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Selektor koloru" })).not.toBeInTheDocument();
  });

  it("zmiana suwaka barwy NIE woła onChange - tylko 'Zatwierdź' to robi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#ff0000" onChange={onChange} sampleLabel="Breakout" />);
    await user.click(otworz());
    fireEvent.change(screen.getByLabelText("Odcień"), { target: { value: "200" } });
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Zatwierdź" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith("#ff0000");
  });

  it("'Anuluj' zamyka panel BEZ wołania onChange, mimo wpisanej zmiany w HEX", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#ff0000" onChange={onChange} sampleLabel="Breakout" />);
    await user.click(otworz());
    const hexInput = screen.getByLabelText("Wartość HEX");
    await user.clear(hexInput);
    await user.type(hexInput, "#00ff00");
    await user.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Selektor koloru" })).not.toBeInTheDocument();
  });

  it("ponowne otwarcie po 'Anuluj' wraca do koloru formularza, nie do porzuconego szkicu", async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} sampleLabel="Breakout" />);
    await user.click(otworz());
    const hexInput = screen.getByLabelText("Wartość HEX");
    await user.clear(hexInput);
    await user.type(hexInput, "#00ff00");
    await user.click(screen.getByRole("button", { name: "Anuluj" }));
    await user.click(otworz());
    expect(screen.getByLabelText("Wartość HEX")).toHaveValue("#ff0000");
  });

  it("niepoprawny tekst HEX nie zmienia podglądu koloru (tylko samo pole tekstowe)", async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} sampleLabel="Breakout" />);
    await user.click(otworz());
    const hexInput = screen.getByLabelText("Wartość HEX");
    await user.clear(hexInput);
    await user.type(hexInput, "zzz");
    expect(hexInput).toHaveValue("zzz");
    expect(screen.getByText("Podgląd etykiety strategii:").nextElementSibling).toHaveStyle({
      backgroundColor: "#ff0000",
    });
  });

  it("pusta sampleLabel pokazuje w podglądzie zastępczy tekst 'Nazwa strategii'", async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} sampleLabel="   " />);
    await user.click(otworz());
    expect(screen.getByText("Nazwa strategii")).toBeInTheDocument();
  });
});
