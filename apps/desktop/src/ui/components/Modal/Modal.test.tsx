import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders its title and content when open", () => {
    render(
      <Modal open title="Nowe konto" onClose={vi.fn()}>
        <p>Treść formularza</p>
      </Modal>,
    );

    expect(screen.getByRole("heading", { name: "Nowe konto" })).toBeInTheDocument();
    expect(screen.getByText("Treść formularza")).toBeInTheDocument();
  });

  it("calls onClose when the close button is activated", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Nowe konto" onClose={onClose}>
        <p>Treść formularza</p>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * Escape na natywnym `<dialog>` wywołuje zdarzenie `cancel`, którego domyślne zachowanie
   * (natywne zamknięcie POZA kontrolą Reacta) `Modal.tsx` świadomie blokuje `preventDefault()`
   * i zamyka przez własny, kontrolowany `onClose()` - żeby stan Reacta i `dialog.open` nigdy
   * się nie rozjechały. To zachowanie było dotąd potwierdzone wyłącznie przeglądem kodu
   * (macierz sekcja 1.1), bez testu - ta sama klasa luki znaleziona już kilkukrotnie w O7.
   */
  it("Escape (zdarzenie 'cancel' na <dialog>) zamyka się przez KONTROLOWANE onClose, nie natywnie", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Nowe konto" onClose={onClose}>
        <p>Treść formularza</p>
      </Modal>,
    );

    const dialog = screen.getByRole("heading", { name: "Nowe konto" }).closest("dialog");
    if (!dialog) {
      throw new Error("oczekiwano elementu <dialog>");
    }

    const cancelEvent = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
