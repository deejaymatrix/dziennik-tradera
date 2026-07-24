import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TradeAuditLog } from "./TradeAuditLog";
import type { TradeAuditEntry } from "../app/types/trade";

function wpis(overrides: Partial<TradeAuditEntry> = {}): TradeAuditEntry {
  return {
    id: "e1",
    trade_id: "t1",
    changed_at: "2026-03-15T10:30:00Z",
    changes: [{ field: "Cena wejścia", old_value: "1.1000", new_value: "1.1050" }],
    ...overrides,
  };
}

/**
 * `TradeAuditLog` renderuje lokalny dziennik zmian tylko, gdy JEST co pokazać - `null` (jeszcze
 * nie wczytany) i pusta tablica (brak edycji) muszą dawać identyczny efekt: nic w DOM, nie samo
 * puste `<details>`. Dotąd zero testów.
 */
describe("TradeAuditLog - brak wpisów", () => {
  it("entries === null nic nie renderuje", () => {
    const { container } = render(<TradeAuditLog entries={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pusta tablica wpisów nic nie renderuje", () => {
    const { container } = render(<TradeAuditLog entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TradeAuditLog - renderowanie wpisów", () => {
  it("pokazuje liczbę wpisów w nagłówku i zmiany pól", () => {
    render(
      <TradeAuditLog
        entries={[
          wpis(),
          wpis({ id: "e2", changes: [{ field: "Lot", old_value: "1", new_value: "2" }] }),
        ]}
      />,
    );
    expect(screen.getByText("Historia zmian (2)")).toBeInTheDocument();
    expect(screen.getByText("Cena wejścia:")).toBeInTheDocument();
    expect(screen.getByText("Lot:")).toBeInTheDocument();
  });

  it("brak starej/nowej wartości pokazuje myślnik, nie 'null' ani pusty tekst", () => {
    render(
      <TradeAuditLog
        entries={[
          wpis({ changes: [{ field: "Notatka", old_value: null, new_value: "Nowa notatka" }] }),
        ]}
      />,
    );
    const wiersz = screen.getByText("Notatka:").closest("li");
    expect(wiersz).toHaveTextContent("Notatka: — → Nowa notatka");
  });
});
