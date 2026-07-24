import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormPanel } from "./FormPanel";

/**
 * `FormPanel` - zwijana sekcja formularza transakcji. Najważniejsza, nieoczywista z samego JSX
 * zasada: zawartość zwiniętego panelu ZOSTAJE w drzewie DOM (ukryta atrybutem `hidden`), a nie
 * jest odmontowywana (`{open && children}` by ją odmontował) - specyfikacja wprost zabrania
 * kasowania wpisanych danych przy zwinięciu sekcji. Naiwny refaktor na warunkowe renderowanie
 * wyglądałby identycznie wizualnie, ale cicho zerowałby stan pól po zwinięciu. Dotąd zero testów.
 */
describe("FormPanel", () => {
  it("zwinięty panel (open=false) NIE usuwa dzieci z DOM - tylko je chowa atrybutem hidden", () => {
    render(
      <FormPanel title="Podstawowe" open={false} onToggle={vi.fn()} status="empty">
        <input defaultValue="wpisana wartość" />
      </FormPanel>,
    );
    const pole = screen.getByDisplayValue("wpisana wartość");
    expect(pole).toBeInTheDocument();
    expect(pole.closest("div")).toHaveAttribute("hidden");
  });

  it("otwarty panel (open=true) pokazuje zawartość bez atrybutu hidden", () => {
    render(
      <FormPanel title="Podstawowe" open onToggle={vi.fn()} status="empty">
        <input defaultValue="x" />
      </FormPanel>,
    );
    expect(screen.getByDisplayValue("x").closest("div")).not.toHaveAttribute("hidden");
  });

  it.each([
    ["complete", "Uzupełnione"],
    ["partial", "Częściowo"],
    ["empty", "Puste"],
    ["error", "Do poprawy"],
  ] as const)("status=%s pokazuje domyślną etykietę '%s'", (status, label) => {
    render(
      <FormPanel title="Sekcja" open onToggle={vi.fn()} status={status}>
        <div />
      </FormPanel>,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("statusLabel nadpisuje domyślną etykietę statusu", () => {
    render(
      <FormPanel title="Sekcja" open onToggle={vi.fn()} status="error" statusLabel="3 braki">
        <div />
      </FormPanel>,
    );
    expect(screen.getByText("3 braki")).toBeInTheDocument();
    expect(screen.queryByText("Do poprawy")).not.toBeInTheDocument();
  });

  it("klik w nagłówek woła onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <FormPanel title="Sekcja" open={false} onToggle={onToggle} status="empty">
        <div />
      </FormPanel>,
    );
    await user.click(screen.getByRole("button", { name: /Sekcja/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("aria-expanded odzwierciedla stan open", () => {
    render(
      <FormPanel title="Sekcja" open onToggle={vi.fn()} status="empty">
        <div />
      </FormPanel>,
    );
    expect(screen.getByRole("button", { name: /Sekcja/ })).toHaveAttribute("aria-expanded", "true");
  });
});
