import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SzablonyInstrumentowPage } from "./SzablonyInstrumentowPage";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AccountWithBalance } from "../app/types/account";
import type { BrokerTemplate } from "../app/types/instrument";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function szablon(overrides: Partial<BrokerTemplate> = {}): BrokerTemplate {
  return {
    id: "t1",
    name: "QuoMarkets RAW",
    broker_name: "QuoMarkets",
    account_type: "RAW",
    source: "broker_import",
    import_format_version: 1,
    account_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    instrument_count: 5,
    ...overrides,
  };
}

function konto(id: string, name: string, templateId: string | null): AccountWithBalance {
  return {
    id,
    name,
    description: null,
    account_type: null,
    currency: "USD",
    initial_balance: "1000.00",
    template_id: templateId,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    balance: "1000.00",
  };
}

function LokalizacjaMarker(): ReactElement {
  const location = useLocation();
  return <span data-testid="lokalizacja">{`${location.pathname}${location.search}`}</span>;
}

function wyrenderuj(): void {
  render(
    <MemoryRouter initialEntries={["/szablony"]}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route
              path="/szablony"
              element={
                <>
                  <SzablonyInstrumentowPage />
                  <LokalizacjaMarker />
                </>
              }
            />
            <Route
              path="/instrumenty"
              element={
                <>
                  <p>Strona instrumentów</p>
                  <LokalizacjaMarker />
                </>
              }
            />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function nastawKomendy(mapa: Record<string, unknown>): void {
  invokeCommand.mockImplementation((cmd: string) => {
    if (!(cmd in mapa)) {
      return Promise.reject(new Error(`nieoczekiwana komenda: ${cmd}`));
    }
    return Promise.resolve(mapa[cmd]);
  });
}

/**
 * `SzablonyInstrumentowPage` - lista szablonów brokera z akcjami tworzenia/duplikowania/zmiany
 * nazwy/przypinania do konta/odpinania/archiwizacji. Nieoczywiste rzeczy: (1) powiązanie
 * szablon-konto mieszka na KONCIE (`account.template_id`), więc lista "Przypisane konto" jest
 * liczona przez filtrowanie `accounts` na bieżąco, a nie z gotowego pola na szablonie - jeden
 * szablon może mieć wiele kont; (2) przycisk "Odepnij" pojawia się TYLKO, gdy jakieś konto już
 * korzysta z szablonu; (3) duplikowanie i archiwizacja wymagają natywnego `window.prompt`/dialogu
 * potwierdzenia - anulowanie NIE woła backendu; (4) w formularzu tworzenia `broker_name` ma
 * fallback do samej nazwy szablonu, gdy pole brokera zostanie puste. Dotąd zero testów.
 */
describe("SzablonyInstrumentowPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
    vi.restoreAllMocks();
  });

  it("brak szablonów pokazuje pusty stan 'Brak szablonów'", async () => {
    nastawKomendy({ list_broker_templates: [], list_accounts: [] });
    wyrenderuj();
    expect(await screen.findByText("Brak szablonów")).toBeInTheDocument();
  });

  it("błąd wczytywania pokazuje ErrorState, a 'Spróbuj ponownie' odpytuje backend jeszcze raz", async () => {
    const user = userEvent.setup();
    let wolania = 0;
    invokeCommand.mockImplementation((cmd: string) => {
      if (cmd === "list_broker_templates") {
        wolania += 1;
        return Promise.reject(new Error("Baza niedostępna"));
      }
      if (cmd === "list_accounts") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });
    wyrenderuj();

    expect(await screen.findByText("Baza niedostępna")).toBeInTheDocument();
    expect(wolania).toBe(1);

    await user.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(wolania).toBe(2));
  });

  it("konto przypisane do szablonu pokazuje przycisk 'Odepnij', nieprzypisany szablon go nie ma", async () => {
    nastawKomendy({
      list_broker_templates: [szablon({ id: "t1" }), szablon({ id: "t2", name: "Inny" })],
      list_accounts: [konto("a1", "Konto A", "t1")],
    });
    wyrenderuj();

    await screen.findByText("QuoMarkets RAW");
    expect(screen.getByRole("button", { name: "Odepnij: QuoMarkets RAW" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odepnij: Inny" })).not.toBeInTheDocument();
    expect(screen.getByText("Konto A (USD)")).toBeInTheDocument();
  });

  it("wiele kont przypisanych do JEDNEGO szablonu pokazuje WSZYSTKIE jako osobne odznaki", async () => {
    nastawKomendy({
      list_broker_templates: [szablon({ id: "t1" })],
      list_accounts: [konto("a1", "Konto A", "t1"), konto("a2", "Konto B", "t1")],
    });
    wyrenderuj();

    await screen.findByText("QuoMarkets RAW");
    expect(screen.getByText("Konto A (USD)")).toBeInTheDocument();
    expect(screen.getByText("Konto B (USD)")).toBeInTheDocument();
  });

  it("'Przypisz do konta' jest wyłączony, gdy nie ma żadnego konta", async () => {
    nastawKomendy({ list_broker_templates: [szablon()], list_accounts: [] });
    wyrenderuj();

    await screen.findByText("QuoMarkets RAW");
    expect(
      screen.getByRole("button", { name: "Przypisz do konta: QuoMarkets RAW" }),
    ).toBeDisabled();
  });

  it("anulowanie okna 'Nazwa kopii' nie woła duplicate_broker_template", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue(null);
    nastawKomendy({ list_broker_templates: [szablon()], list_accounts: [] });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Duplikuj: QuoMarkets RAW" }));

    expect(invokeCommand).not.toHaveBeenCalledWith("duplicate_broker_template", expect.anything());
    // Puste/anulowane okno ma wyjść CICHO - żaden komunikat błędu nie może się pojawić.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("potwierdzone okno 'Nazwa kopii' woła duplicate_broker_template z przyciętą nazwą", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue("  Kopia RAW  ");
    nastawKomendy({
      list_broker_templates: [szablon()],
      list_accounts: [],
      duplicate_broker_template: undefined,
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Duplikuj: QuoMarkets RAW" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("duplicate_broker_template", {
        id: "t1",
        newName: "Kopia RAW",
      }),
    );
  });

  it("anulowanie potwierdzenia archiwizacji NIE woła archive_broker_template", async () => {
    const user = userEvent.setup();
    nastawKomendy({ list_broker_templates: [szablon()], list_accounts: [] });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Do Kosza: QuoMarkets RAW" }));
    await user.click(await screen.findByRole("button", { name: "Anuluj" }));

    expect(invokeCommand).not.toHaveBeenCalledWith("archive_broker_template", expect.anything());
  });

  it("potwierdzenie archiwizacji woła archive_broker_template z id szablonu", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      list_broker_templates: [szablon()],
      list_accounts: [],
      archive_broker_template: undefined,
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Do Kosza: QuoMarkets RAW" }));
    await user.click(await screen.findByRole("button", { name: "Do Kosza" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("archive_broker_template", { id: "t1" }),
    );
  });

  it("tworzenie szablonu: broker_name ma fallback do nazwy, gdy pole brokera zostanie puste", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      list_broker_templates: [],
      list_accounts: [],
      create_broker_template: undefined,
    });
    wyrenderuj();

    await screen.findByText("Brak szablonów");
    await user.click(screen.getByRole("button", { name: "Dodaj szablon" }));
    await user.type(screen.getByLabelText(/Nazwa szablonu/), "Nowy Broker");

    expect(screen.getByRole("button", { name: "Utwórz" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Utwórz" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("create_broker_template", {
        input: { name: "Nowy Broker", broker_name: "Nowy Broker", account_type: null },
      }),
    );
  });

  it("zmiana nazwy: modal NIE pokazuje pól brokera/typu konta i woła rename_broker_template", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      list_broker_templates: [szablon({ id: "t1", name: "Stara nazwa" })],
      list_accounts: [],
      rename_broker_template: undefined,
    });
    wyrenderuj();

    await user.click(await screen.findByRole("button", { name: "Zmień nazwę: Stara nazwa" }));

    expect(screen.queryByLabelText("Nazwa brokera")).not.toBeInTheDocument();
    const pole = screen.getByLabelText(/Nazwa szablonu/);
    expect(pole).toHaveValue("Stara nazwa");

    await user.clear(pole);
    await user.type(pole, "Nowa nazwa");
    await user.click(screen.getByRole("button", { name: "Zapisz" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("rename_broker_template", {
        id: "t1",
        name: "Nowa nazwa",
      }),
    );
  });

  it("przypisanie do konta: 'Przypisz' wyłączony bez wyboru, potem woła assign_broker_template", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      list_broker_templates: [szablon({ id: "t1" })],
      list_accounts: [konto("a1", "Konto A", null)],
      assign_broker_template: undefined,
    });
    wyrenderuj();

    await user.click(
      await screen.findByRole("button", { name: "Przypisz do konta: QuoMarkets RAW" }),
    );

    const przycisk = screen.getByRole("button", { name: "Przypisz" });
    expect(przycisk).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Konto"), "a1");
    expect(przycisk).not.toBeDisabled();
    await user.click(przycisk);

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("assign_broker_template", {
        templateId: "t1",
        accountId: "a1",
      }),
    );
  });

  it("'Edytuj instrumenty' nawiguje do /instrumenty z id szablonu w query", async () => {
    const user = userEvent.setup();
    nastawKomendy({ list_broker_templates: [szablon({ id: "t 1" })], list_accounts: [] });
    wyrenderuj();

    await user.click(
      await screen.findByRole("button", { name: "Edytuj instrumenty: QuoMarkets RAW" }),
    );

    expect(await screen.findByTestId("lokalizacja")).toHaveTextContent(
      "/instrumenty?template=t%201",
    );
  });
});
