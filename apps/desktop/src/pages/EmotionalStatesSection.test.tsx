import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmotionalStatesSection } from "./EmotionalStatesSection";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { EmotionalState } from "../app/types/emotional_state";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function stan(overrides: Partial<EmotionalState> = {}): EmotionalState {
  return {
    id: "s1",
    name: "Strach",
    is_builtin: true,
    hidden: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function wyrenderuj(): void {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <EmotionalStatesSection />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

/**
 * `EmotionalStatesSection` zarządza listą stanów emocjonalnych (Ustawienia): wbudowane stany
 * można tylko ukryć, WŁASNE można też trwale usunąć - operacja nieodwracalna, więc musi przejść
 * przez `useConfirm()`. Błąd tu (np. pominięte potwierdzenie) usuwałby dane bez pytania - wprost
 * naruszałoby zasadę projektu "nigdy nie niszcz danych bez potwierdzenia". Dotąd zero testów.
 */
describe("EmotionalStatesSection - usuwanie wymaga potwierdzenia", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("anulowanie potwierdzenia NIE usuwa stanu", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_emotional_states") {
        return Promise.resolve([stan({ id: "wlasny", name: "Ekscytacja", is_builtin: false })]);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Usuń Ekscytacja" }));
    expect(await screen.findByText('Usunąć stan emocjonalny "Ekscytacja"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anuluj" }));

    expect(invokeCommand).not.toHaveBeenCalledWith("delete_emotional_state", expect.anything());
  });

  it("potwierdzenie usuwa stan przez delete_emotional_state", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_emotional_states") {
        return Promise.resolve([stan({ id: "wlasny", name: "Ekscytacja", is_builtin: false })]);
      }
      if (cmd === "delete_emotional_state") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Usuń Ekscytacja" }));
    await user.click(await screen.findByRole("button", { name: "Potwierdź" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("delete_emotional_state", { id: "wlasny" }),
    );
  });

  it("wbudowany stan NIE ma przycisku usuwania", async () => {
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_emotional_states") {
        return Promise.resolve([stan({ id: "s1", name: "Strach", is_builtin: true })]);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await screen.findByText("Strach");
    expect(screen.queryByRole("button", { name: "Usuń Strach" })).not.toBeInTheDocument();
  });
});

describe("EmotionalStatesSection - dodawanie", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("przycisk 'Dodaj' jest wyłączony przy pustym/samych spacjach polu", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue([]);
    wyrenderuj();

    await screen.findByText("Brak stanów emocjonalnych");
    expect(screen.getByRole("button", { name: "Dodaj" })).toBeDisabled();

    await user.type(screen.getByLabelText("Nowy stan emocjonalny"), "   ");
    expect(screen.getByRole("button", { name: "Dodaj" })).toBeDisabled();
  });

  it("Enter w polu nazwy zatwierdza dodanie, tak jak klik przycisku", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_emotional_states") {
        return Promise.resolve([]);
      }
      if (cmd === "create_emotional_state") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await screen.findByText("Brak stanów emocjonalnych");
    await user.type(screen.getByLabelText("Nowy stan emocjonalny"), "Ulga{Enter}");

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("create_emotional_state", {
        input: { name: "Ulga" },
      }),
    );
  });
});

describe("EmotionalStatesSection - ukrywanie przełącza w obie strony", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("klik na widocznym stanie woła set_emotional_state_hidden z hidden=true", async () => {
    const user = userEvent.setup();
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_emotional_states") {
        return Promise.resolve([stan({ id: "s1", name: "Strach", hidden: false })]);
      }
      if (cmd === "set_emotional_state_hidden") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Ukryj Strach" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("set_emotional_state_hidden", {
        id: "s1",
        hidden: true,
      }),
    );
  });
});
