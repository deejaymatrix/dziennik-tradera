import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAi } from "./ChatAi";
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

// `get_filtered_report` (podstawa danych) zawsze zwraca prostą liczbę transakcji; `ai_chat` -
// odpowiedź podaną w teście. Reszta komend nieistotna.
function ustawCzat(odpowiedz: string): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "get_filtered_report") return Promise.resolve({ stats: { total_trades: 30 } });
    if (cmd === "ai_chat") return Promise.resolve(odpowiedz);
    return Promise.resolve(null);
  });
}

function wyrenderuj(): void {
  render(
    <ToastProvider>
      <ChatAi filter={filtr} zakresOpis="Konto A · 2026" gotowe />
    </ToastProvider>,
  );
}

beforeEach(() => {
  invokeCommand.mockReset();
});

describe("ChatAi", () => {
  it("wysyła pytanie i pokazuje odpowiedź asystenta, czyści pole", async () => {
    ustawCzat("Najlepiej wychodzi Ci Breakout D1.");
    wyrenderuj();
    const user = userEvent.setup();

    const pole = screen.getByPlaceholderText("Zadaj pytanie o swoje dane…");
    await user.type(pole, "Które strategie wychodzą najlepiej?");
    await user.click(screen.getByRole("button", { name: /Wyślij/ }));

    expect(await screen.findByText("Najlepiej wychodzi Ci Breakout D1.")).toBeInTheDocument();
    // Pytanie użytkownika też jest w rozmowie.
    expect(screen.getByText("Które strategie wychodzą najlepiej?")).toBeInTheDocument();
    // Pole wyczyszczone po udanym wysłaniu.
    expect(pole).toHaveValue("");
  });

  it("pusta odpowiedź modelu: brak pustego dymka, pytanie wraca do pola", async () => {
    ustawCzat("   ");
    wyrenderuj();
    const user = userEvent.setup();

    const pole = screen.getByPlaceholderText("Zadaj pytanie o swoje dane…");
    await user.type(pole, "Podsumuj mój miesiąc");
    await user.click(screen.getByRole("button", { name: /Wyślij/ }));

    // Po pustej odpowiedzi pytanie wraca do pola (można ponowić).
    await waitFor(() => expect(pole).toHaveValue("Podsumuj mój miesiąc"));
    // Rozmowa cofnięta do stanu sprzed pytania - żaden dymek nie został, widać placeholder zachęty.
    expect(screen.getByText(/Zapytaj o wyniki wybranego zakresu/)).toBeInTheDocument();
  });
});
