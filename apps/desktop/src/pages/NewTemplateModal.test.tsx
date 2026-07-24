import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewTemplateModal } from "./NewTemplateModal";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { BrokerTemplate } from "../app/types/instrument";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function szablon(overrides: Partial<BrokerTemplate> = {}): BrokerTemplate {
  return {
    id: "t1",
    name: "IC Markets RAW",
    broker_name: "IC Markets RAW",
    account_type: null,
    source: "user_created",
    import_format_version: null,
    account_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    instrument_count: 0,
    ...overrides,
  };
}

function wyrenderuj(onCreated = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <NewTemplateModal onClose={onClose} onCreated={onCreated} />
    </ToastProvider>,
  );
  return { onClose, onCreated };
}

/**
 * `NewTemplateModal` zakłada pusty szablon instrumentów. Dwie nieoczywiste reguły wypełniania
 * pól: (1) pusta "Nazwa brokera" ma spaść na nazwę SZABLONU (nie zostać pustym stringiem w
 * bazie); (2) pusty "Typ konta" ma pójść jako `null`, nie pusty string - odróżnienie "brak" od
 * "pusty tekst" ma znaczenie przy późniejszym filtrowaniu/wyświetlaniu. Dotąd zero testów.
 */
describe("NewTemplateModal - walidacja nazwy", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  // Zupełnie pustego pola nie da się tu przetestować przez realny klik: natywna walidacja HTML5
  // `required` blokuje wysłanie formularza wcześniej, więc `onSubmit` (a z nim `!name.trim()`)
  // nigdy by nie odpalił. Same spacje PRZECHODZĄ przez `required` (to nie jest pusty string wg
  // przeglądarki) - dopiero wtedy widać, że dodatkowa walidacja komponentu w ogóle coś robi.
  it("nazwa z samych spacji: pokazuje błąd, NIE woła invokeCommand", async () => {
    const user = userEvent.setup();
    wyrenderuj();

    await user.type(screen.getByLabelText(/Nazwa szablonu/), "   ");
    await user.click(screen.getByRole("button", { name: "Utwórz szablon" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Podaj nazwę szablonu.");
    expect(invokeCommand).not.toHaveBeenCalled();
  });
});

describe("NewTemplateModal - wypełnianie brakujących pól", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pusta 'Nazwa brokera' spada na nazwę szablonu, pusty 'Typ konta' idzie jako null", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(szablon());
    wyrenderuj();

    await user.type(screen.getByLabelText(/Nazwa szablonu/), "IC Markets RAW");
    await user.click(screen.getByRole("button", { name: "Utwórz szablon" }));

    expect(invokeCommand).toHaveBeenCalledWith("create_broker_template", {
      input: {
        name: "IC Markets RAW",
        broker_name: "IC Markets RAW",
        account_type: null,
      },
    });
  });

  it("wypełniona 'Nazwa brokera' i 'Typ konta' idą po przycięciu białych znaków, nie z fallbackiem", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue(szablon());
    wyrenderuj();

    await user.type(screen.getByLabelText(/Nazwa szablonu/), "Mój szablon");
    await user.type(screen.getByLabelText("Nazwa brokera"), "  XTB  ");
    await user.type(screen.getByLabelText("Typ konta (opcjonalnie)"), "  Standard  ");
    await user.click(screen.getByRole("button", { name: "Utwórz szablon" }));

    expect(invokeCommand).toHaveBeenCalledWith("create_broker_template", {
      input: {
        name: "Mój szablon",
        broker_name: "XTB",
        account_type: "Standard",
      },
    });
  });
});

describe("NewTemplateModal - wynik zapisu", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("powodzenie woła onCreated ze świeżym szablonem", async () => {
    const user = userEvent.setup();
    const utworzony = szablon({ id: "nowy", name: "Test" });
    invokeCommand.mockResolvedValue(utworzony);
    const { onCreated } = wyrenderuj();

    await user.type(screen.getByLabelText(/Nazwa szablonu/), "Test");
    await user.click(screen.getByRole("button", { name: "Utwórz szablon" }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(utworzony));
  });

  it("błąd backendu pokazuje jego komunikat, nie zamyka okna", async () => {
    const user = userEvent.setup();
    invokeCommand.mockRejectedValue(new Error("Szablon o tej nazwie już istnieje."));
    const { onClose } = wyrenderuj();

    await user.type(screen.getByLabelText(/Nazwa szablonu/), "Duplikat");
    await user.click(screen.getByRole("button", { name: "Utwórz szablon" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Szablon o tej nazwie już istnieje.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
