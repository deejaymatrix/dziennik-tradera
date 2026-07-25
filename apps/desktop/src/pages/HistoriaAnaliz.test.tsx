import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoriaAnaliz } from "./HistoriaAnaliz";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { PozycjaHistorii } from "../app/types/aiAnalysis";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

function pozycja(over: Partial<PozycjaHistorii> = {}): PozycjaHistorii {
  return {
    id: "a1",
    typ_analizy: "transakcja",
    utworzono_o: "2026-03-12T09:15:00Z",
    wersja_modelu: "qwen2.5-7b-instruct-q4_k_m",
    status: "ok",
    etykieta_zakresu: "Transakcja #42",
    wynik_json: JSON.stringify({
      fakty: ["fakt A"],
      obserwacje: [],
      hipotezy: [],
      rekomendacje: ["rekomendacja B"],
      jakosc_danych: [],
    }),
    ...over,
  };
}

function wyrenderuj(): void {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <HistoriaAnaliz />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

function tylkoHistoria(pozycje: PozycjaHistorii[]): void {
  invokeCommand.mockImplementation((cmd: string) =>
    cmd === "ai_analysis_history" ? Promise.resolve(pozycje) : Promise.resolve(null),
  );
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("HistoriaAnaliz", () => {
  it("pokazuje pusty stan, gdy nie ma zapisanych analiz", async () => {
    tylkoHistoria([]);
    wyrenderuj();
    expect(await screen.findByText(/Nie ma jeszcze żadnych zapisanych analiz/)).toBeInTheDocument();
  });

  it("wyświetla pozycję i rozwija sekcje dopiero po kliknięciu (puste sekcje pominięte)", async () => {
    tylkoHistoria([pozycja()]);
    wyrenderuj();

    const naglowek = await screen.findByText("Transakcja #42");
    // Przed rozwinięciem szczegóły są ukryte.
    expect(screen.queryByText("fakt A")).not.toBeInTheDocument();

    await userEvent.setup().click(naglowek);
    expect(screen.getByText("Fakty")).toBeInTheDocument();
    expect(screen.getByText("fakt A")).toBeInTheDocument();
    expect(screen.getByText("Rekomendacje")).toBeInTheDocument();
    // Puste sekcje (obserwacje/hipotezy/jakość) nie mają nagłówków.
    expect(screen.queryByText("Obserwacje")).not.toBeInTheDocument();
    expect(screen.queryByText("Hipotezy")).not.toBeInTheDocument();
  });

  it("kopiuje analizę do schowka z nagłówkiem kontekstu (zakres i model), przed sekcjami", async () => {
    tylkoHistoria([pozycja()]);
    wyrenderuj();
    // userEvent.setup() podstawia własny stub schowka - czytamy z niego z powrotem to, co
    // komponent tam zapisał (writeText i readText działają na tym samym magazynie).
    const user = userEvent.setup();

    await user.click(await screen.findByText("Transakcja #42"));
    await user.click(screen.getByRole("button", { name: /Kopiuj/ }));

    const tekst = await waitFor(async () => {
      const t = await navigator.clipboard.readText();
      expect(t).not.toBe("");
      return t;
    });
    expect(tekst).toContain('Analiza „Transakcja #42"');
    expect(tekst).toContain("qwen2.5-7b-instruct-q4_k_m");
    // Nagłówek kontekstu poprzedza pierwszą sekcję.
    expect(tekst.indexOf('Analiza „Transakcja #42"')).toBeLessThan(tekst.indexOf("Fakty:"));
  });
});
