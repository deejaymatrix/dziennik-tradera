import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSection } from "./AiSection";
import { ConfirmProvider } from "../../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../../ui/components/Toast/ToastProvider";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

// Domyślne odpowiedzi na komendy odczytu; komendy zapisu (ai_set_*) zwracają null (nieistotne).
function nastawStan(): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "ai_list_models")
      return Promise.resolve([
        {
          id: "qwen",
          etykieta: "Qwen 7B",
          rozmiar_bajtow: 4_700_000_000,
          pobrany: true,
          aktywny: true,
        },
        {
          id: "bielik",
          etykieta: "Bielik 11B",
          rozmiar_bajtow: 8_000_000_000,
          pobrany: false,
          aktywny: false,
        },
      ]);
    if (cmd === "ai_model_status")
      return Promise.resolve({
        gotowy: true,
        wlaczony: true,
        etykieta: "Qwen 7B",
        rozmiar_bajtow: 4_700_000_000,
      });
    if (cmd === "ai_response_settings")
      return Promise.resolve({ jezyk: "polski", szczegolowosc: "standardowe" });
    return Promise.resolve(null);
  });
}

function wyrenderuj(): void {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <AiSection />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  invokeCommand.mockReset();
  nastawStan();
});

describe("AiSection", () => {
  it("pokazuje modele i włączony stan; przełączenie zapisuje ai_set_enabled", async () => {
    wyrenderuj();
    const user = userEvent.setup();

    expect(await screen.findByText("Qwen 7B")).toBeInTheDocument();
    expect(screen.getByText("Bielik 11B")).toBeInTheDocument();

    const wlacznik = screen.getByRole("checkbox", { name: /Asystent AI włączony/ });
    expect(wlacznik).toBeChecked();
    await user.click(wlacznik);
    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("ai_set_enabled", { enabled: false }),
    );
  });

  it("zmiana języka odpowiedzi zapisuje ai_set_response_settings", async () => {
    wyrenderuj();
    const user = userEvent.setup();

    const jezyk = await screen.findByRole("combobox", { name: "Język odpowiedzi" });
    await user.selectOptions(jezyk, "angielski");

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("ai_set_response_settings", {
        ustawienia: { jezyk: "angielski", szczegolowosc: "standardowe" },
      }),
    );
  });

  it("usunięcie pobranego modelu wymaga potwierdzenia i woła delete_ai_model", async () => {
    wyrenderuj();
    const user = userEvent.setup();

    // Aktywny model jest pobrany -> przycisk usuwania.
    await user.click(await screen.findByRole("button", { name: /Usuń pobrany model/ }));
    // Potwierdzenie w dialogu (etykieta z confirmLabel).
    await user.click(await screen.findByRole("button", { name: "Usuń model" }));

    await waitFor(() => expect(invokeCommand).toHaveBeenCalledWith("delete_ai_model", {}));
  });
});
