import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StrategyChecklistEditor } from "./StrategyChecklistEditor";
import type { ChecklistItem, StrategyChecklist } from "../app/types/trade";

function pozycja(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    rule_id: "regula-1",
    name: "Potwierdzenie trendu",
    required: true,
    status: "not_applicable",
    reason: null,
    ...overrides,
  };
}

function checklista(
  entry: ChecklistItem[] = [],
  management: ChecklistItem[] = [],
): StrategyChecklist {
  return { entry, management };
}

/**
 * `StrategyChecklistEditor` blokuje finalny zapis, dopóki każda WYMAGANA i NIESPEŁNIONA zasada
 * nie dostanie powodu (sekcja 6.6 specyfikacji) - to jedyne miejsce w formularzu transakcji z
 * realnym, zamierzonym efektem walidacyjnym po stronie danych, nie tylko UI. Najbardziej
 * ryzykowna część: zmiana statusu NA COKOLWIEK innego niż "niespełniona" musi WYCZYŚCIĆ powód -
 * inaczej stary powód przypięty do już-spełnionej zasady zapisałby się do historycznej migawki
 * transakcji jako martwe dane. Dotąd zero testów.
 */
describe("StrategyChecklistEditor - widoczność", () => {
  it("pusta checklista (obie listy puste) NIE renderuje nic", () => {
    const { container } = render(
      <StrategyChecklistEditor checklist={checklista()} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StrategyChecklistEditor - pole powodu widoczne tylko dla wymaganej+niespełnionej", () => {
  it("wymagana + niespełniona: pole powodu widoczne", () => {
    render(
      <StrategyChecklistEditor
        checklist={checklista([pozycja({ required: true, status: "unfulfilled" })])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Powód niespełnienia/)).toBeInTheDocument();
  });

  it("wymagana + spełniona: BRAK pola powodu", () => {
    render(
      <StrategyChecklistEditor
        checklist={checklista([pozycja({ required: true, status: "fulfilled" })])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Powód niespełnienia/)).not.toBeInTheDocument();
  });

  it("NIEwymagana + niespełniona: BRAK pola powodu (opcjonalna zasada nie blokuje zapisu)", () => {
    render(
      <StrategyChecklistEditor
        checklist={checklista([pozycja({ required: false, status: "unfulfilled" })])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Powód niespełnienia/)).not.toBeInTheDocument();
  });
});

describe("StrategyChecklistEditor - zmiana statusu czyści powód, gdy przestaje być wymagany", () => {
  it("zmiana z 'niespełniona' na 'spełniona' czyści reason w onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StrategyChecklistEditor
        checklist={checklista([
          pozycja({ required: true, status: "unfulfilled", reason: "Za duża zmienność" }),
        ])}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Status"), "Spełniona");

    const przekazane = onChange.mock.calls[0]?.[0] as StrategyChecklist;
    expect(przekazane.entry[0]?.status).toBe("fulfilled");
    expect(przekazane.entry[0]?.reason).toBeNull();
  });
});

describe("StrategyChecklistEditor - błąd pola powodu tylko po showReasonErrors", () => {
  it("showReasonErrors=false: brak błędu, nawet gdy powód pusty", () => {
    render(
      <StrategyChecklistEditor
        checklist={checklista([pozycja({ required: true, status: "unfulfilled" })])}
        onChange={vi.fn()}
        showReasonErrors={false}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("showReasonErrors=true + pusty powód: pokazuje błąd", () => {
    render(
      <StrategyChecklistEditor
        checklist={checklista([pozycja({ required: true, status: "unfulfilled" })])}
        onChange={vi.fn()}
        showReasonErrors={true}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Podaj powód niespełnienia tej zasady.");
  });

  it("showReasonErrors=true + WYPEŁNIONY powód: brak błędu", () => {
    render(
      <StrategyChecklistEditor
        checklist={checklista([
          pozycja({ required: true, status: "unfulfilled", reason: "Powód podany" }),
        ])}
        onChange={vi.fn()}
        showReasonErrors={true}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("StrategyChecklistEditor - niezależność wpisów wejścia i zarządzania", () => {
  it("zmiana statusu w grupie 'wejścia' nie dotyka grupy 'zarządzania'", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StrategyChecklistEditor
        checklist={checklista(
          [pozycja({ rule_id: "e1", name: "Wejście A", status: "not_applicable" })],
          [pozycja({ rule_id: "m1", name: "Zarządzanie A", status: "fulfilled" })],
        )}
        onChange={onChange}
      />,
    );

    const grupaWejscia = screen.getByText("Zasady wejścia").closest("div");
    if (!grupaWejscia) {
      throw new Error("brak grupy wejścia");
    }
    await user.selectOptions(within(grupaWejscia).getByLabelText("Status"), "Niespełniona");

    const przekazane = onChange.mock.calls[0]?.[0] as StrategyChecklist;
    expect(przekazane.entry[0]?.status).toBe("unfulfilled");
    expect(przekazane.management[0]?.status).toBe("fulfilled");
  });
});
