import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrategiesPage } from "./StrategiesPage";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { Strategy } from "../app/types/strategy";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function strategia(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "strat-1",
    name: "Breakout",
    description: null,
    color: "#ff0000",
    entry_rules: [],
    management_rules: [],
    legacy_entry_rules_text: null,
    legacy_management_rules_text: null,
    legacy_exit_rules_text: null,
    tags: [],
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function wyrenderuj() {
  render(
    <ToastProvider>
      <StrategiesPage />
    </ToastProvider>,
  );
}

/**
 * `StrategiesPage` - lista strategii z filtrem "Pokaż zarchiwizowane". Ten sam wzorzec co
 * `AccountsPage`: filtr wywołuje `list_strategies` PONOWNIE z nową wartością `includeArchived`,
 * a odznaka/przyciski archiwizacji zależą od `archived_at` - nigdy oba przyciski naraz. Osobna,
 * specyficzna dla tego ekranu rzecz: komórka tagów pokazuje "—" dla pustej listy `tags`, w
 * przeciwnym razie renderuje każdy tag osobno (`StrategyFormModal` nie woła nic przy montowaniu
 * w stanie zamkniętym, więc - w odróżnieniu od `AccountsPage` - prosty mock bez routingu po
 * nazwie komendy wystarczy). Dotąd zero testów.
 */
describe("StrategiesPage", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("pusta lista strategii pokazuje EmptyState, nie tabelę", async () => {
    invokeCommand.mockResolvedValue([]);
    wyrenderuj();
    expect(await screen.findByText("Brak strategii")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("przełączenie 'Pokaż zarchiwizowane' woła list_strategies z includeArchived: true", async () => {
    const user = userEvent.setup();
    invokeCommand.mockResolvedValue([strategia()]);
    wyrenderuj();
    await screen.findByText("Breakout");
    invokeCommand.mockClear();

    await user.click(screen.getByRole("switch", { name: "Pokaż zarchiwizowane" }));
    await waitFor(() => {
      expect(invokeCommand).toHaveBeenCalledWith("list_strategies", { includeArchived: true });
    });
  });

  it("brak tagów pokazuje '—', obecne tagi renderują się jako osobne znaczniki", async () => {
    invokeCommand.mockResolvedValue([
      strategia({ id: "a", name: "Bez tagów", tags: [] }),
      strategia({ id: "b", name: "Z tagami", tags: ["EURUSD", "H1"] }),
    ]);
    wyrenderuj();
    await screen.findByText("Bez tagów");
    const wiersze = screen.getAllByRole("row");
    expect(wiersze[1]).toHaveTextContent("—");
    expect(screen.getByText("EURUSD")).toBeInTheDocument();
    expect(screen.getByText("H1")).toBeInTheDocument();
  });

  it("strategia aktywna pokazuje odznakę 'Aktywna' i przycisk 'Archiwizuj', nie 'Przywróć'", async () => {
    invokeCommand.mockResolvedValue([strategia({ archived_at: null })]);
    wyrenderuj();
    await screen.findByText("Breakout");
    expect(screen.getByText("Aktywna")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Archiwizuj/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Przywróć/ })).not.toBeInTheDocument();
  });

  it("strategia zarchiwizowana pokazuje odznakę 'Zarchiwizowana' i przycisk 'Przywróć', nie 'Archiwizuj'", async () => {
    invokeCommand.mockResolvedValue([strategia({ archived_at: "2026-02-01T00:00:00Z" })]);
    wyrenderuj();
    await screen.findByText("Breakout");
    expect(screen.getByText("Zarchiwizowana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Przywróć/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Archiwizuj/ })).not.toBeInTheDocument();
  });
});
