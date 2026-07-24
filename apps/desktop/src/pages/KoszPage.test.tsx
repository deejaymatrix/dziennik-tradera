import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KoszPage } from "./KoszPage";
import { PreferencesProvider } from "../app/PreferencesProvider";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { TrashItem } from "../app/types/trash";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function element(overrides: Partial<TrashItem> = {}): TrashItem {
  return {
    entity_type: "account",
    id: "e1",
    label: "Konto demo",
    deleted_at: "2026-01-01T00:00:00Z",
    dependency_note: null,
    ...overrides,
  };
}

/**
 * `get_preferences` celowo ODRZUCONE we wszystkich testach - `PreferencesProvider` łapie błąd
 * i zostaje przy `preferences === null`, co `useOptionalConfirm` traktuje jak "potwierdzenie
 * zawsze pokazywane" (bezpieczny domyślny stan tuż po starcie, zanim ustawienia się wczytają).
 * Nie trzeba więc budować całego, ogromnego obiektu `Preferences` tylko po to, żeby przetestować
 * Kosz.
 */
function nastawKomendy(handlers: {
  listTrash?: () => Promise<TrashItem[]>;
  restoreTrashItem?: () => Promise<void>;
  restoreIntervalWithLabel?: () => Promise<void>;
}): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "get_preferences") return Promise.reject(new Error("brak w teście"));
    if (command === "list_trash_items")
      return (handlers.listTrash ?? (() => Promise.resolve([])))();
    if (command === "restore_trash_item") {
      return (handlers.restoreTrashItem ?? (() => Promise.resolve()))();
    }
    if (command === "restore_interval_with_label") {
      return (handlers.restoreIntervalWithLabel ?? (() => Promise.resolve()))();
    }
    return Promise.resolve(null);
  });
}

function wyrenderuj() {
  render(
    <PreferencesProvider>
      <ToastProvider>
        <ConfirmProvider>
          <KoszPage />
        </ConfirmProvider>
      </ToastProvider>
    </PreferencesProvider>,
  );
}

/**
 * `KoszPage` - uniwersalny Kosz agregujący konta/transakcje/strategie/interwały. Trzy nieoczywiste
 * rzeczy: (1) filtr wyszukiwania i filtr typu działają RAZEM (AND) - element musi przejść oba;
 * (2) "Zaznacz wszystkie widoczne" jest przełącznikiem zależnym od aktualnego stanu: zaznacza
 * wszystkie TYLKO gdy nie wszystkie są już zaznaczone, inaczej odznacza wszystkie; (3) przy
 * konflikcie nazwy interwału backend zwraca komunikat z DWOMA nazwami w cudzysłowie - zajętą i
 * proponowaną - `suggestedLabelFrom` musi wziąć DRUGIE dopasowanie, nie pierwsze, inaczej
 * użytkownik przywróciłby interwał pod nazwą, która jest właśnie zajęta. Dotąd zero testów.
 */
describe("KoszPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pusta lista pokazuje 'Kosz jest pusty', nie tabelę", async () => {
    nastawKomendy({ listTrash: () => Promise.resolve([]) });
    wyrenderuj();
    expect(await screen.findByText("Kosz jest pusty")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("filtr wyszukiwania i filtr typu działają razem (AND), nie osobno", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      listTrash: () =>
        Promise.resolve([
          element({ id: "a", entity_type: "account", label: "Konto A" }),
          element({ id: "b", entity_type: "strategy", label: "Konto B" }),
        ]),
    });
    wyrenderuj();
    await screen.findByText("Konto A");

    await user.type(screen.getByLabelText("Szukaj"), "konto");
    expect(screen.getByText("Konto A")).toBeInTheDocument();
    expect(screen.getByText("Konto B")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Typ"), "account");
    expect(screen.getByText("Konto A")).toBeInTheDocument();
    expect(screen.queryByText("Konto B")).not.toBeInTheDocument();
  });

  it("'Zaznacz wszystkie widoczne' zaznacza, a przy ponownym kliknięciu odznacza wszystko", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      listTrash: () =>
        Promise.resolve([element({ id: "a", label: "A" }), element({ id: "b", label: "B" })]),
    });
    wyrenderuj();
    await screen.findByText("A");

    const zaznaczWszystkie = screen.getByRole("checkbox", { name: "Zaznacz wszystkie widoczne" });
    await user.click(zaznaczWszystkie);
    expect(screen.getByRole("checkbox", { name: "Zaznacz A" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zaznacz B" })).toBeChecked();

    await user.click(zaznaczWszystkie);
    expect(screen.getByRole("checkbox", { name: "Zaznacz A" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zaznacz B" })).not.toBeChecked();
  });

  it("konflikt nazwy interwału proponuje DRUGĄ nazwę z komunikatu (wolną), nie pierwszą (zajętą)", async () => {
    const user = userEvent.setup();
    nastawKomendy({
      listTrash: () =>
        Promise.resolve([element({ id: "i1", entity_type: "interval", label: "M15" })]),
      restoreTrashItem: () =>
        Promise.reject(new Error("Nazwa „M15” jest już zajęta (np. „M15 (2)”).")),
    });
    wyrenderuj();
    await screen.findByText("M15");

    await user.click(screen.getByRole("button", { name: "Przywróć M15" }));
    expect(
      await screen.findByText(
        (_, node) => (node?.textContent ?? "").includes("Przywrócić pod nazwą „M15 (2)”?"),
        { selector: "p" },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Przywróć jako „M15 (2)”" })).toBeInTheDocument();
  });

  it("brak dependency_note pokazuje '—'", async () => {
    nastawKomendy({
      listTrash: () => Promise.resolve([element({ dependency_note: null })]),
    });
    wyrenderuj();
    await screen.findByText("Konto demo");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("'Opróżnij kosz' jest wyłączony, gdy lista jest pusta", async () => {
    nastawKomendy({ listTrash: () => Promise.resolve([]) });
    wyrenderuj();
    await screen.findByText("Kosz jest pusty");
    expect(screen.getByRole("button", { name: /Opróżnij kosz/ })).toBeDisabled();
  });
});
