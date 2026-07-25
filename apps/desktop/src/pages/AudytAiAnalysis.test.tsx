import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudytAiAnalysis } from "./AudytAiAnalysis";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

const WYNIK = {
  fakty: ["Handlujesz za dużo w jeden dzień."],
  obserwacje: [],
  hipotezy: [],
  rekomendacje: [],
  jakosc_danych: [],
};

function nastawGotowy(): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "ai_model_status")
      return Promise.resolve({ gotowy: true, wlaczony: true, etykieta: "m", rozmiar_bajtow: 0 });
    if (cmd === "analyze_behavior") return Promise.resolve(WYNIK);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("AudytAiAnalysis", () => {
  it("model gotowy: woła analyze_behavior z accountId i pokazuje wynik", async () => {
    nastawGotowy();
    render(
      <ToastProvider>
        <AudytAiAnalysis accountId="konto-1" zakresOpis="Konto A · cała historia" gotoweDoAnalizy />
      </ToastProvider>,
    );
    const user = userEvent.setup();

    const btn = await screen.findByRole("button", { name: /Zrób audyt zachowania z AI/ });
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);

    expect(await screen.findByText("Handlujesz za dużo w jeden dzień.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kopiuj analizę/ })).toBeInTheDocument();
    // Komenda (odrębna od analizy emocji) dostała accountId.
    expect(invokeCommand).toHaveBeenCalledWith("analyze_behavior", {
      accountId: "konto-1",
      zakresOpis: "Konto A · cała historia",
    });
  });

  it("model niegotowy: instrukcja włączenia, bez przycisku audytu", async () => {
    invokeCommand.mockImplementation((cmd: string) =>
      cmd === "ai_model_status"
        ? Promise.resolve({ gotowy: false, wlaczony: false, etykieta: "m", rozmiar_bajtow: 0 })
        : Promise.resolve(null),
    );
    render(
      <ToastProvider>
        <AudytAiAnalysis accountId="konto-1" zakresOpis="Konto A" gotoweDoAnalizy />
      </ToastProvider>,
    );

    expect(await screen.findByText(/włącz Asystenta AI i pobierz model/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Zrób audyt zachowania z AI/ }),
    ).not.toBeInTheDocument();
  });
});
