import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportAiAnalysis } from "./ReportAiAnalysis";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { ReportFilter } from "../app/types/report";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

const filtr: ReportFilter = {
  account_id: "konto-1",
  instrument_id: null,
  strategy_id: null,
  interval_id: null,
  side: null,
  year: null,
  month: null,
};

function wyrenderuj(zakresOpis = "Konto A (USD) · cała historia"): void {
  render(
    <ToastProvider>
      <ReportAiAnalysis filter={filtr} zakresOpis={zakresOpis} gotoweDoAnalizy />
    </ToastProvider>,
  );
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("ReportAiAnalysis", () => {
  it("model gotowy: analizuje zakres i pokazuje wynik z przyciskiem kopiowania", async () => {
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "ai_model_status")
        return Promise.resolve({ gotowy: true, wlaczony: true, etykieta: "m", rozmiar_bajtow: 0 });
      if (cmd === "analyze_report")
        return Promise.resolve({
          fakty: ["Zysk głównie z Breakout D1."],
          obserwacje: [],
          hipotezy: [],
          rekomendacje: [],
          jakosc_danych: [],
        });
      return Promise.resolve(null);
    });
    wyrenderuj();
    const user = userEvent.setup();

    const btn = await screen.findByRole("button", { name: /Przeanalizuj ten zakres z AI/ });
    // Przycisk włącza się dopiero po wczytaniu statusu modelu (do tego czasu jest disabled).
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);

    expect(await screen.findByText("Zysk głównie z Breakout D1.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kopiuj analizę/ })).toBeInTheDocument();
  });

  it("model niegotowy: pokazuje instrukcję włączenia, bez przycisku analizy", async () => {
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "ai_model_status")
        return Promise.resolve({
          gotowy: false,
          wlaczony: false,
          etykieta: "m",
          rozmiar_bajtow: 0,
        });
      return Promise.resolve(null);
    });
    wyrenderuj();

    expect(await screen.findByText(/włącz Asystenta AI i pobierz model/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Przeanalizuj ten zakres z AI/ }),
    ).not.toBeInTheDocument();
  });
});
