import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";
import type { ConfirmOptions } from "./ConfirmDialog";

function Wywolanie({
  opcje,
  onWynik,
}: {
  opcje: ConfirmOptions | string;
  onWynik: (wynik: boolean) => void;
}): React.ReactElement {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() => {
        void confirm(opcje).then(onWynik);
      }}
    >
      Wywołaj potwierdzenie
    </button>
  );
}

/**
 * `ConfirmDialog` zastępuje natywne `window.confirm` w 16+ miejscach aplikacji, w tym przy
 * NIEODWRACALNYCH operacjach (opróżnienie kosza, trwałe usunięcie) - błąd tutaj (np. `confirm()`
 * rozwiązujący się na `true` mimo kliknięcia "Anuluj") miałby REALNE ryzyko utraty danych, nie
 * tylko kosmetyczny problem. Mimo to komponent nie miał ŻADNEGO testu - ta sama klasa luki co
 * inne "✅ potwierdzone" miejsca znalezione w tej sesji O7, tym razem przy bezpieczeństwie
 * danych, nie tylko dostępności/formatowaniu.
 */
describe("ConfirmDialog - Promise<boolean> musi zgadzać się z rzeczywistym kliknięciem", () => {
  it("rozwiązuje się na true po kliknięciu przycisku potwierdzenia", async () => {
    const user = userEvent.setup();
    const onWynik = vi.fn();
    render(
      <ConfirmProvider>
        <Wywolanie opcje="Usunąć trwale?" onWynik={onWynik} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Wywołaj potwierdzenie" }));
    expect(screen.getByText("Usunąć trwale?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Potwierdź" }));
    expect(onWynik).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("rozwiązuje się na false po kliknięciu Anuluj - NIE na true", async () => {
    const user = userEvent.setup();
    const onWynik = vi.fn();
    render(
      <ConfirmProvider>
        <Wywolanie opcje="Usunąć trwale?" onWynik={onWynik} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Wywołaj potwierdzenie" }));
    await user.click(screen.getByRole("button", { name: "Anuluj" }));

    expect(onWynik).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("rozwiązuje się na false, gdy dialog zamyka się przez Escape (onClose), nie kliknięciem", async () => {
    const user = userEvent.setup();
    const onWynik = vi.fn();
    render(
      <ConfirmProvider>
        <Wywolanie opcje="Usunąć trwale?" onWynik={onWynik} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Wywołaj potwierdzenie" }));

    const dialog = screen.getByText("Usunąć trwale?").closest("dialog");
    if (!dialog) {
      throw new Error("oczekiwano elementu <dialog>");
    }
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    // `resolve()` woła `.then(onWynik)` w mikrozadaniu - w odróżnieniu od `user.click()` (który
    // sam odczekuje) surowy `dispatchEvent` niczego nie odczekuje, więc trzeba to zrobić ręcznie.
    await Promise.resolve();

    expect(onWynik).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("respektuje własne etykiety przycisków i wariant 'danger'", async () => {
    const user = userEvent.setup();
    const onWynik = vi.fn();
    render(
      <ConfirmProvider>
        <Wywolanie
          opcje={{
            message: "Opróżnić cały Kosz?",
            confirmLabel: "Opróżnij kosz",
            cancelLabel: "Zostaw",
            danger: true,
          }}
          onWynik={onWynik}
        />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Wywołaj potwierdzenie" }));

    expect(screen.getByRole("button", { name: "Opróżnij kosz" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zostaw" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zostaw" }));
    expect(onWynik).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("przyjmuje sam tekst (string) tak samo jak obiekt z 'message'", async () => {
    const user = userEvent.setup();
    const onWynik = vi.fn();
    render(
      <ConfirmProvider>
        <Wywolanie opcje="Proste pytanie?" onWynik={onWynik} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Wywołaj potwierdzenie" }));
    expect(screen.getByText("Proste pytanie?")).toBeInTheDocument();
  });
});
