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

// `get_filtered_report` (podstawa danych) zwraca statystyki zakresu; `ai_chat` - odpowiedź podaną
// w teście. Reszta komend nieistotna.
function ustawCzat(
  odpowiedz: string,
  stats: { total_trades: number; closed_trades: number } = {
    total_trades: 30,
    closed_trades: 30,
  },
): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "get_filtered_report") return Promise.resolve({ stats });
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

  it("podstawa i ostrzeżenie o małej próbie liczą się z zamkniętych, nie ze wszystkich transakcji", async () => {
    // 30 transakcji w zakresie, ale tylko 5 zamkniętych (reszta otwarta) - model rozumuje po 5.
    ustawCzat("nieistotne", { total_trades: 30, closed_trades: 5 });
    wyrenderuj();

    // Podstawa pokazuje 5 (zamknięte), a ostrzeżenie o małej próbie się pojawia (5 < 20) - mimo że
    // wszystkich transakcji jest 30. Gdyby liczyło z total_trades, ostrzeżenia by nie było.
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText(/mała próba/)).toBeInTheDocument();
  });

  it("zmiana konta czyści historię nawet przy identycznym opisie zakresu", async () => {
    ustawCzat("Odpowiedź o koncie A.");
    // Renderujemy wprost, żeby dostać `rerender` i podmienić konto w propsach.
    const { rerender } = render(
      <ToastProvider>
        <ChatAi filter={filtr} zakresOpis="Konto (USD) · cała historia" gotowe />
      </ToastProvider>,
    );
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Zadaj pytanie o swoje dane…"), "Pytanie A");
    await user.click(screen.getByRole("button", { name: /Wyślij/ }));
    expect(await screen.findByText("Odpowiedź o koncie A.")).toBeInTheDocument();

    // Inne konto (inny account_id), ale IDENTYCZNY zakresOpis - jak dwa konta o tej samej nazwie i
    // walucie. Reset keyowany na account_id, więc historia znika mimo tego samego opisu (na starym
    // kluczu `zakresOpis` ten test by nie przeszedł).
    rerender(
      <ToastProvider>
        <ChatAi
          filter={{ ...filtr, account_id: "konto-2" }}
          zakresOpis="Konto (USD) · cała historia"
          gotowe
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByText("Odpowiedź o koncie A.")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Pytanie A")).not.toBeInTheDocument();
  });
});
