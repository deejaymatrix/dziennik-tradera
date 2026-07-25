import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeAiAnalysis } from "./TradeAiAnalysis";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { ZapisanaAnaliza } from "../app/types/aiAnalysis";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({
  invokeCommand,
  extractErrorMessage: (e: unknown) => String(e),
}));

function analiza(over: Partial<ZapisanaAnaliza> = {}): ZapisanaAnaliza {
  return {
    id: "a1",
    trade_id: "t1",
    typ_analizy: "transakcja",
    utworzono_o: "2026-03-12T09:15:00Z",
    wersja_modelu: "qwen2.5-7b-instruct-q4_k_m",
    wersja_szablonu: "transakcja-v3",
    wynik_json: JSON.stringify({
      fakty: ["Wszedłeś za wcześnie."],
      obserwacje: [],
      hipotezy: [],
      rekomendacje: [],
      jakosc_danych: [],
    }),
    wynik_tekstowy: "",
    status: "ok",
    nieaktualna: false,
    ...over,
  };
}

// Model gotowy; `get_trade_analysis` zwraca podaną zapisaną analizę (albo null).
function nastaw(zapisana: ZapisanaAnaliza | null): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "ai_model_status")
      return Promise.resolve({
        gotowy: true,
        wlaczony: true,
        etykieta: "qwen2.5-7b-instruct-q4_k_m",
        rozmiar_bajtow: 0,
      });
    if (cmd === "get_trade_analysis") return Promise.resolve(zapisana);
    return Promise.resolve(null);
  });
}

function wyrenderuj(): void {
  render(
    <ToastProvider>
      <TradeAiAnalysis tradeId="t1" numer={42} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("TradeAiAnalysis", () => {
  it("zapisana analiza: pokazuje sekcje i stopkę z modelem, bez banera nieaktualności", async () => {
    nastaw(analiza());
    wyrenderuj();

    expect(await screen.findByText("Wszedłeś za wcześnie.")).toBeInTheDocument();
    // Stopka niesie informację o lokalnym pochodzeniu (i modelu).
    expect(screen.getByText(/Wygenerowane lokalnie/)).toBeInTheDocument();
    // Analiza aktualna - brak banera.
    expect(screen.queryByText(/Analiza nieaktualna/)).not.toBeInTheDocument();
  });

  it("nieaktualna analiza: pokazuje baner o zmianie danych transakcji", async () => {
    nastaw(analiza({ nieaktualna: true }));
    wyrenderuj();

    expect(await screen.findByText(/Analiza nieaktualna/)).toBeInTheDocument();
    // Sekcje wyniku nadal widoczne (baner nie zastępuje treści).
    expect(screen.getByText("Wszedłeś za wcześnie.")).toBeInTheDocument();
  });
});
