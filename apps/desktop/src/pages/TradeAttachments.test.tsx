import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TradeAttachments } from "./TradeAttachments";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { PendingAttachment } from "../app/types/attachment";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function link(overrides: Partial<PendingAttachment> = {}): PendingAttachment {
  return { id: "p1", kind: "link", url: "https://example.com", label: "Analiza", ...overrides };
}

function wyrenderuj(pending: PendingAttachment[] = []) {
  const onPendingChange = vi.fn();
  render(
    <ToastProvider>
      <ConfirmProvider>
        <TradeAttachments pending={pending} onPendingChange={onPendingChange} />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return { onPendingChange };
}

/**
 * `TradeAttachments` w trybie oczekującym (`tradeId === undefined`, nowa niezapisana transakcja)
 * trzyma załączniki lokalnie w `pending`/`onPendingChange`, zamiast wołać `invokeCommand` - żaden
 * z testów tu nie mockuje backendu poza `invokeCommand` (pusty stub), bo `useAttachments("")`
 * świadomie nic nie pobiera dla pustego tradeId. Nieoczywiste reguły trybu oczekującego: (1) link
 * musi zaczynać się od `https://` - ta sama walidacja co `domain::attachment::is_valid_https_url`
 * w backendzie, tu tylko dla natychmiastowej informacji zwrotnej; (2) usuwanie w trybie
 * oczekującym NIE pyta o potwierdzenie (w odróżnieniu od zapisanej transakcji, gdzie to
 * nieodwracalna komenda backendu). Dotąd zero testów.
 */
describe("TradeAttachments - tryb oczekujący (nowa transakcja)", () => {
  it("pusta lista pokazuje podpowiedź, nie pustą listę", () => {
    wyrenderuj([]);
    expect(
      screen.getByText("Brak załączników - dodaj zdjęcie wykresu albo upuść je tutaj."),
    ).toBeInTheDocument();
  });

  it("link bez https:// pokazuje błąd i NIE wywołuje onPendingChange", async () => {
    const user = userEvent.setup();
    const { onPendingChange } = wyrenderuj([]);
    await user.click(screen.getByRole("button", { name: "Dodaj link" }));
    await user.type(screen.getByLabelText(/^Adres/), "example.com/nie-https");
    await user.click(screen.getByRole("button", { name: "Dodaj" }));
    expect(
      screen.getByText("Link musi być prawidłowym adresem zaczynającym się od https://."),
    ).toBeInTheDocument();
    expect(onPendingChange).not.toHaveBeenCalled();
  });

  it("poprawny link https:// dodaje wpis do pending przez onPendingChange", async () => {
    const user = userEvent.setup();
    const { onPendingChange } = wyrenderuj([]);
    await user.click(screen.getByRole("button", { name: "Dodaj link" }));
    await user.type(screen.getByLabelText(/^Adres/), "https://example.com/wykres");
    await user.type(screen.getByLabelText(/^Nazwa/), "Wykres H1");
    await user.click(screen.getByRole("button", { name: "Dodaj" }));
    expect(onPendingChange).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        kind: "link",
        url: "https://example.com/wykres",
        label: "Wykres H1",
      }),
    ]);
  });

  it("usunięcie w trybie oczekującym NIE pyta o potwierdzenie i filtruje pending", async () => {
    const user = userEvent.setup();
    const { onPendingChange } = wyrenderuj([link({ id: "a" }), link({ id: "b" })]);
    const [usunPierwszy] = screen.getAllByRole("button", { name: "Usuń załącznik" });
    if (!usunPierwszy) {
      throw new Error("brak przycisku usuwania");
    }
    await user.click(usunPierwszy);
    expect(onPendingChange).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ id: "b" })]);
  });

  it("przesunięcie pierwszego elementu w dół zamienia kolejność pending", async () => {
    const user = userEvent.setup();
    const { onPendingChange } = wyrenderuj([link({ id: "a" }), link({ id: "b" })]);
    const [wDolPierwszy] = screen.getAllByRole("button", { name: "Przesuń niżej" });
    if (!wDolPierwszy) {
      throw new Error("brak przycisku przesuwania");
    }
    await user.click(wDolPierwszy);
    const nowaKolejnosc = onPendingChange.mock.calls[0]?.[0] as PendingAttachment[];
    expect(nowaKolejnosc.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("pierwszy element nie może przesunąć się wyżej (przycisk wyłączony)", () => {
    wyrenderuj([link({ id: "a" }), link({ id: "b" })]);
    const wGoreButtons = screen.getAllByRole("button", { name: "Przesuń wyżej" });
    expect(wGoreButtons[0]).toBeDisabled();
  });
});
