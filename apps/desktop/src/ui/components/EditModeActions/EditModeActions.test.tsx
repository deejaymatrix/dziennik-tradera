import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditModeActions } from "./EditModeActions";

/**
 * `EditModeActions` - para przycisków "Edytuj" / "Anuluj"+"Zapisz zmiany", współdzielona przez
 * kartę transakcji i Zasady handlu. Najbardziej nieoczywista rzecz: gdy `saveButtonType="submit"`,
 * przycisk Zapisz NIE dostaje `onClick={onSave}` - zapis ma iść przez `onSubmit` otaczającego
 * `<form>`, a przycisk jest tylko jego wizualnym wyzwalaczem. Gdyby oba tory (onClick i onSubmit)
 * działały naraz, zapis wywołałby się PODWÓJNIE. Druga nieoczywista rzecz: `disabled` (dodatkowa
 * blokada poza `saving`, np. `submitLocked`) wyłącza TYLKO "Zapisz zmiany", nigdy "Anuluj" - użytkownik
 * musi zawsze móc wyjść z edycji, nawet gdy zapis jest chwilowo zablokowany. Dotąd zero testów.
 */
describe("EditModeActions", () => {
  it("editing=false pokazuje tylko 'Edytuj' (i readOnlyExtra), nie Anuluj/Zapisz", () => {
    render(
      <EditModeActions
        editing={false}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        readOnlyExtra={<button type="button">Zamknij</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zamknij" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anuluj" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).not.toBeInTheDocument();
  });

  it("saveButtonType='button' (domyślnie) - klik w Zapisz woła onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EditModeActions editing onEdit={vi.fn()} onCancel={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("saveButtonType='submit' - klik w Zapisz NIE woła onSave (idzie przez onSubmit formularza)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditModeActions
        editing
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onSave={onSave}
        saveButtonType="submit"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("disabled=true blokuje TYLKO 'Zapisz zmiany', 'Anuluj' zostaje aktywny", () => {
    render(
      <EditModeActions editing disabled onEdit={vi.fn()} onCancel={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anuluj" })).not.toBeDisabled();
  });

  it("saving=true blokuje OBA przyciski", () => {
    render(<EditModeActions editing saving onEdit={vi.fn()} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeDisabled();
  });

  it("własne etykiety zastępują domyślne", () => {
    render(
      <EditModeActions
        editing
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        saveLabel="Utwórz"
        cancelLabel="Porzuć"
      />,
    );
    expect(screen.getByRole("button", { name: "Utwórz" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Porzuć" })).toBeInTheDocument();
  });
});
