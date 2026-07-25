import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmocjeAiAnalysis } from "./EmocjeAiAnalysis";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

const WYNIK = {
  fakty: ["Przy strachu tracisz częściej."],
  obserwacje: [],
  hipotezy: [],
  rekomendacje: [],
  jakosc_danych: [],
};

function nastawGotowy(): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "ai_model_status")
      return Promise.resolve({ gotowy: true, wlaczony: true, etykieta: "m", rozmiar_bajtow: 0 });
    if (cmd === "analyze_emotions") return Promise.resolve(WYNIK);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("EmocjeAiAnalysis", () => {
  it("model gotowy: woła analyze_emotions z accountId i pokazuje wynik", async () => {
    nastawGotowy();
    render(
      <ToastProvider>
        <EmocjeAiAnalysis
          accountId="konto-1"
          zakresOpis="Konto A · cała historia"
          gotoweDoAnalizy
        />
      </ToastProvider>,
    );
    const user = userEvent.setup();

    const btn = await screen.findByRole("button", { name: /Przeanalizuj emocje z AI/ });
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);

    expect(await screen.findByText("Przy strachu tracisz częściej.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kopiuj analizę/ })).toBeInTheDocument();
    // Komenda dostała accountId (nie filtr).
    expect(invokeCommand).toHaveBeenCalledWith("analyze_emotions", {
      accountId: "konto-1",
      zakresOpis: "Konto A · cała historia",
    });
  });

  it("model niegotowy: instrukcja włączenia, bez przycisku analizy", async () => {
    invokeCommand.mockImplementation((cmd: string) =>
      cmd === "ai_model_status"
        ? Promise.resolve({ gotowy: false, wlaczony: false, etykieta: "m", rozmiar_bajtow: 0 })
        : Promise.resolve(null),
    );
    render(
      <ToastProvider>
        <EmocjeAiAnalysis accountId="konto-1" zakresOpis="Konto A" gotoweDoAnalizy />
      </ToastProvider>,
    );

    expect(await screen.findByText(/włącz Asystenta AI i pobierz model/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Przeanalizuj emocje z AI/ }),
    ).not.toBeInTheDocument();
  });

  it("zmiana konta czyści wynik nawet przy identycznym opisie zakresu", async () => {
    nastawGotowy();
    const { rerender } = render(
      <ToastProvider>
        <EmocjeAiAnalysis
          accountId="konto-1"
          zakresOpis="Konto (USD) · cała historia"
          gotoweDoAnalizy
        />
      </ToastProvider>,
    );
    const user = userEvent.setup();

    const btn = await screen.findByRole("button", { name: /Przeanalizuj emocje z AI/ });
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);
    expect(await screen.findByText("Przy strachu tracisz częściej.")).toBeInTheDocument();

    // Inne konto, IDENTYCZNY zakresOpis - reset keyowany na accountId czyści wynik.
    rerender(
      <ToastProvider>
        <EmocjeAiAnalysis
          accountId="konto-2"
          zakresOpis="Konto (USD) · cała historia"
          gotoweDoAnalizy
        />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByText("Przy strachu tracisz częściej.")).not.toBeInTheDocument(),
    );
  });
});
