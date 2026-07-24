import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZasadyHandluPage } from "./ZasadyHandluPage";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type {
  TradingRule,
  TradingRuleCategory,
  TradingRulesState,
  TradingRulesWrite,
} from "../app/types/trading_rules";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function kategoria(
  id: string,
  name: string,
  overrides: Partial<TradingRuleCategory> = {},
): TradingRuleCategory {
  return {
    id,
    name,
    is_builtin: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function pytanie(
  id: string,
  categoryId: string,
  question: string,
  overrides: Partial<TradingRule> = {},
): TradingRule {
  return {
    id,
    category_id: categoryId,
    question,
    answer: null,
    is_builtin: false,
    template_question: null,
    hidden: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function stan(categories: TradingRuleCategory[], rules: TradingRule[]): TradingRulesState {
  return { categories, rules };
}

/** Przyciski w otwartym ConfirmDialog - "Anuluj"/"Potwierdź" tam kolidują z przyciskami trybu
 * edycji (EditModeActions ma własne "Anuluj"/"Zapisz zmiany"), więc trzeba szukać w obrębie
 * samego okna dialogowego, nie na całej stronie. */
function przyciskDialogu(nazwa: string | RegExp): HTMLElement {
  return within(screen.getByRole("dialog")).getByRole("button", { name: nazwa });
}

function nastawKomendy(mapa: Record<string, unknown>): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (cmd === "get_preferences") {
      return Promise.reject(new Error("brak w teście"));
    }
    if (!(cmd in mapa)) {
      return Promise.reject(new Error(`nieoczekiwana komenda: ${cmd}`));
    }
    return Promise.resolve(mapa[cmd]);
  });
}

function wyrenderuj(): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter(
    [
      { path: "/zasady", element: <ZasadyHandluPage /> },
      { path: "/inne", element: <p>Inna strona</p> },
    ],
    { initialEntries: ["/zasady"] },
  );
  render(
    <PreferencesProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </PreferencesProvider>,
  );
  return router;
}

/**
 * `ZasadyHandluPage` - osobisty regulamin, tryb odczytu/edycji ze zbiorczym zapisem. Nieoczywiste
 * rzeczy: (1) w trybie edycji ukryte pytania są widoczne ZAWSZE, niezależnie od checkboxa "Pokaż
 * ukryte" (`showHidden || !rule.hidden || editing`); (2) `checkDuplicate` blokuje dokładnie ten sam
 * (znormalizowany) tekst pytania automatycznie, ale przy PODOBNYM (zawierającym się) pytaniu tylko
 * PYTA o scalenie - potwierdzenie scalenia blokuje dodanie, anulowanie POZWALA dodać mimo
 * podobieństwa; (3) `useBlocker` ostrzega przed nawigacją z niezapisanymi zmianami - to jedyne
 * potwierdzenie w aplikacji, którego NIE da się wyłączyć w Ustawieniach (w odróżnieniu od
 * `useOptionalConfirm` przy "Do kosza"); (4) puste odpowiedzi zapisują się jako `null`, nie jako
 * pusty string. Dotąd zero testów.
 */
describe("ZasadyHandluPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    vi.restoreAllMocks();
  });

  it("brak kategorii poza edycją pokazuje pusty stan, 'Dodaj pierwsze zasady' wchodzi w tryb edycji", async () => {
    const user = userEvent.setup();
    nastawKomendy({ get_trading_rules: stan([], []) });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Dodaj pierwsze zasady" }));
    expect(screen.getByRole("button", { name: "Dodaj kategorię" })).toBeInTheDocument();
  });

  it("błąd wczytywania pokazuje ErrorState, 'Spróbuj ponownie' odpytuje backend jeszcze raz", async () => {
    const user = userEvent.setup();
    let wolania = 0;
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") return Promise.reject(new Error("brak w teście"));
      if (cmd === "get_trading_rules") {
        wolania += 1;
        return Promise.reject(new Error("Baza niedostępna"));
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    expect(await screen.findByText("Baza niedostępna")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(wolania).toBe(2));
  });

  it("pytanie bez odpowiedzi pokazuje placeholder, pytanie z odpowiedzią pokazuje jej treść", async () => {
    nastawKomendy({
      get_trading_rules: stan(
        [kategoria("k1", "Wejście")],
        [
          pytanie("p1", "k1", "Czy jest setup?", { answer: null }),
          pytanie("p2", "k1", "Czy jest ryzyko?", { answer: "Max 1%" }),
        ],
      ),
    });
    wyrenderuj();

    await screen.findByText("Czy jest setup?");
    expect(
      screen.getByText("Brak odpowiedzi - kliknij Edytuj, aby ją uzupełnić."),
    ).toBeInTheDocument();
    expect(screen.getByText("Max 1%")).toBeInTheDocument();
  });

  it("ukryte pytanie znika w odczycie bez 'Pokaż ukryte', ale JEST widoczne w trybie edycji", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      get_trading_rules: stan(
        [kategoria("k1", "Wejście")],
        [pytanie("p1", "k1", "Pytanie ukryte", { hidden: true })],
      ),
    });
    wyrenderuj();

    await screen.findByText("Wejście");
    expect(screen.queryByText("Pytanie ukryte")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Pokaż ukryte"));
    expect(await screen.findByText("Pytanie ukryte")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Pokaż ukryte"));
    expect(screen.queryByText("Pytanie ukryte")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edytuj" }));
    expect(screen.getByDisplayValue("Pytanie ukryte")).toBeInTheDocument();
  });

  it("dodanie pytania o IDENTYCZNEJ (znormalizowanej) treści jest blokowane z komunikatem błędu", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("  CZY JEST   SETUP?  ");
    nastawKomendy({
      get_trading_rules: stan(
        [kategoria("k1", "Wejście")],
        [pytanie("p1", "k1", "Czy jest setup?")],
      ),
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Edytuj" }));
    await user.click(screen.getByRole("button", { name: "Dodaj pytanie: Wejście" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/już istnieje w tej kategorii/);
    expect(screen.getAllByText(/Czy jest setup\?/i)).toHaveLength(1);
  });

  it("PODOBNE pytanie: potwierdzenie scalenia blokuje dodanie, anulowanie POZWALA dodać mimo podobieństwa", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      get_trading_rules: stan(
        [kategoria("k1", "Wejście")],
        [pytanie("p1", "k1", "Czy jest wyraźny setup")],
      ),
    });
    wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    vi.spyOn(window, "prompt").mockReturnValue("Czy jest wyraźny setup na D1");
    await user.click(screen.getByRole("button", { name: "Dodaj pytanie: Wejście" }));
    await screen.findByRole("dialog");
    await user.click(przyciskDialogu("Potwierdź"));
    expect(screen.queryByDisplayValue("Czy jest wyraźny setup na D1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dodaj pytanie: Wejście" }));
    await screen.findByRole("dialog");
    await user.click(przyciskDialogu("Anuluj"));
    expect(await screen.findByDisplayValue("Czy jest wyraźny setup na D1")).toBeInTheDocument();
  });

  it("anulowanie/pusta treść okna 'Nazwa nowej kategorii' nic nie dodaje, poprawna nazwa dodaje kategorię", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt");
    nastawKomendy({ get_trading_rules: stan([kategoria("k1", "Wejście")], []) });
    wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    prompt.mockReturnValue(null);
    await user.click(screen.getByRole("button", { name: "Dodaj kategorię" }));
    expect(screen.queryByText("Nowa kategoria")).not.toBeInTheDocument();

    prompt.mockReturnValue("  Nowa kategoria  ");
    await user.click(screen.getByRole("button", { name: "Dodaj kategorię" }));
    expect(await screen.findByText("Nowa kategoria")).toBeInTheDocument();
  });

  it("strzałki przesuwania kategorii: pierwsza nie ma 'wyżej', ostatnia nie ma 'niżej', klik zmienia kolejność", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      get_trading_rules: stan([kategoria("k1", "Alfa"), kategoria("k2", "Beta")], []),
    });
    wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    expect(screen.getByRole("button", { name: "Przesuń kategorię wyżej: Alfa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Przesuń kategorię niżej: Beta" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Przesuń kategorię niżej: Alfa" }));
    const nazwy = screen.getAllByText(/^(Alfa|Beta)$/).map((el) => el.textContent);
    expect(nazwy).toEqual(["Beta", "Alfa"]);
  });

  it("'Do kosza' na pytaniu wymaga potwierdzenia i usuwa je z widoku edycji", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      get_trading_rules: stan(
        [kategoria("k1", "Wejście")],
        [pytanie("p1", "k1", "Czy jest setup?")],
      ),
    });
    wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    await user.click(screen.getByRole("button", { name: "Do kosza: Czy jest setup?" }));
    await screen.findByRole("dialog");
    await user.click(przyciskDialogu("Anuluj"));
    expect(screen.getByDisplayValue("Czy jest setup?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Do kosza: Czy jest setup?" }));
    await screen.findByRole("dialog");
    await user.click(przyciskDialogu("Potwierdź"));
    expect(screen.queryByDisplayValue("Czy jest setup?")).not.toBeInTheDocument();
  });

  it("zapis: pusta/spacjowa odpowiedź wysyła się jako null, nie jako pusty string", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      get_trading_rules: stan(
        [kategoria("k1", "Wejście")],
        [pytanie("p1", "k1", "Czy jest setup?", { answer: "stare" })],
      ),
      save_trading_rules: stan([kategoria("k1", "Wejście")], []),
    });
    wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    const odpowiedz = screen.getByLabelText("Odpowiedź");
    await user.clear(odpowiedz);
    await user.type(odpowiedz, "   ");
    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("save_trading_rules", expect.anything()),
    );
    const wywolanie = invokeCommand.mock.calls.find(([cmd]) => cmd === "save_trading_rules");
    const write = (wywolanie?.[1] as { write: TradingRulesWrite } | undefined)?.write;
    expect(write?.rules[0]?.answer).toBeNull();
  });

  it("przywrócenie szablonu: anulowanie nie woła backendu, potwierdzenie woła restore_trading_rule_templates", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      get_trading_rules: stan([], []),
      restore_trading_rule_templates: stan([kategoria("k1", "Wejście")], []),
    });
    wyrenderuj();

    await screen.findByRole("button", { name: "Przywróć szablon" });
    await user.click(screen.getByRole("button", { name: "Przywróć szablon" }));
    await screen.findByRole("dialog");
    await user.click(przyciskDialogu("Anuluj"));
    expect(invokeCommand).not.toHaveBeenCalledWith(
      "restore_trading_rule_templates",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Przywróć szablon" }));
    await screen.findByRole("dialog");
    await user.click(przyciskDialogu("Przywróć szablon"));
    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("restore_trading_rule_templates", {}),
    );
  });

  it("nawigacja z niezapisanymi zmianami pyta o potwierdzenie (useBlocker) - anulowanie zostaje w edycji", async () => {
    const user = userEvent.setup();
    nastawKomendy({ get_trading_rules: stan([kategoria("k1", "Wejście")], []) });
    const router = wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    void router.navigate("/inne");
    expect(
      await screen.findByText(/Masz niezapisane zmiany w zasadach handlu/),
    ).toBeInTheDocument();

    await user.click(przyciskDialogu("Anuluj"));
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeInTheDocument();
    expect(screen.queryByText("Inna strona")).not.toBeInTheDocument();
  });

  it("nawigacja z niezapisanymi zmianami: potwierdzenie przechodzi na inną stronę", async () => {
    const user = userEvent.setup();
    nastawKomendy({ get_trading_rules: stan([kategoria("k1", "Wejście")], []) });
    const router = wyrenderuj();
    await user.click(await screen.findByRole("button", { name: "Edytuj" }));

    void router.navigate("/inne");
    await user.click(await screen.findByRole("button", { name: "Potwierdź" }));

    expect(await screen.findByText("Inna strona")).toBeInTheDocument();
  });
});
