import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RuleListEditor } from "./RuleListEditor";
import type { RuleLike } from "./RuleListEditor";

function regula(id: string, name: string, sortOrder: number): RuleLike {
  return { id, name, description: null, archived: false, sort_order: sortOrder };
}

function pustaRegula(): RuleLike {
  return { id: "nowa", name: "", description: null, archived: false, sort_order: 999 };
}

function Kontrolowany({
  poczatkowe,
  onChangeSpy,
  showRequiredToggle = false,
}: {
  poczatkowe: RuleLike[];
  onChangeSpy?: (rules: RuleLike[]) => void;
  showRequiredToggle?: boolean;
}): React.ReactElement {
  const [rules, setRules] = useState(poczatkowe);
  return (
    <RuleListEditor
      title="Zasady wejścia"
      rules={rules}
      onChange={(next) => {
        setRules(next);
        onChangeSpy?.(next);
      }}
      showRequiredToggle={showRequiredToggle}
      makeBlankRule={pustaRegula}
    />
  );
}

/**
 * `RuleListEditor` to WSPÓLNY komponent dla zasad wejścia i zasad zarządzania pozycją strategii -
 * dodawanie, reorder (strzałki), usuwanie. Najbardziej ryzykowna, klasyczna klasa błędu:
 * `sort_order` musi zostać PRZELICZONY na nowo (sekwencyjnie od 0) po KAŻDEJ zmianie kolejności
 * albo usunięciu - inaczej po usunięciu środkowego elementu zostaje DZIURA w numeracji (0,2,3
 * zamiast 0,1,2), co cicho psuje sortowanie w bazie. Dotąd zero testów.
 */
describe("RuleListEditor - pusta lista", () => {
  it("pokazuje komunikat zachęty, nie pustą listę", () => {
    render(<Kontrolowany poczatkowe={[]} />);
    expect(screen.getByText("Brak zasad - dodaj pierwszą.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("RuleListEditor - dodawanie", () => {
  it("nowa zasada dostaje sort_order RÓWNY DŁUGOŚCI listy, nadpisując to, co dał makeBlankRule", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Kontrolowany
        poczatkowe={[regula("a", "A", 0), regula("b", "B", 1)]}
        onChangeSpy={onChangeSpy}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dodaj: Zasady wejścia" }));

    const przekazane = onChangeSpy.mock.calls[0]?.[0] as RuleLike[];
    expect(przekazane).toHaveLength(3);
    expect(przekazane[2]?.sort_order).toBe(2);
  });
});

describe("RuleListEditor - usuwanie: sort_order bez dziur", () => {
  it("usunięcie ŚRODKOWEJ zasady przenumerowuje pozostałe sekwencyjnie (0,1), nie zostawia dziury", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Kontrolowany
        poczatkowe={[regula("a", "A", 0), regula("b", "B", 1), regula("c", "C", 2)]}
        onChangeSpy={onChangeSpy}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Usuń: B" }));

    const przekazane = onChangeSpy.mock.calls[0]?.[0] as RuleLike[];
    expect(przekazane.map((r) => r.id)).toEqual(["a", "c"]);
    expect(przekazane.map((r) => r.sort_order)).toEqual([0, 1]);
  });
});

describe("RuleListEditor - przesuwanie strzałkami", () => {
  it("przesunięcie środkowej zasady w górę zamienia kolejność i przelicza sort_order", async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Kontrolowany
        poczatkowe={[regula("a", "A", 0), regula("b", "B", 1), regula("c", "C", 2)]}
        onChangeSpy={onChangeSpy}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Przesuń w górę: B" }));

    const przekazane = onChangeSpy.mock.calls[0]?.[0] as RuleLike[];
    expect(przekazane.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(przekazane.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  it("strzałka 'w górę' na PIERWSZEJ zasadzie jest wyłączona", () => {
    render(<Kontrolowany poczatkowe={[regula("a", "A", 0), regula("b", "B", 1)]} />);
    expect(screen.getByRole("button", { name: "Przesuń w górę: A" })).toBeDisabled();
  });

  it("strzałka 'w dół' na OSTATNIEJ zasadzie jest wyłączona", () => {
    render(<Kontrolowany poczatkowe={[regula("a", "A", 0), regula("b", "B", 1)]} />);
    expect(screen.getByRole("button", { name: "Przesuń w dół: B" })).toBeDisabled();
  });
});

describe("RuleListEditor - edycja pola nie dotyka innych zasad", () => {
  it("zmiana nazwy jednej zasady nie zmienia pozostałych", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={[regula("a", "A", 0), regula("b", "B", 1)]} />);

    const poleA = screen.getByDisplayValue("A");
    await user.clear(poleA);
    await user.type(poleA, "Zmieniona");

    expect(screen.getByDisplayValue("Zmieniona")).toBeInTheDocument();
    expect(screen.getByDisplayValue("B")).toBeInTheDocument();
  });
});

describe("RuleListEditor - przełącznik 'Wymagana'", () => {
  it("ukryty, gdy showRequiredToggle=false", () => {
    render(<Kontrolowany poczatkowe={[regula("a", "A", 0)]} showRequiredToggle={false} />);
    expect(screen.queryByLabelText("Wymagana")).not.toBeInTheDocument();
  });

  it("widoczny, gdy showRequiredToggle=true", () => {
    render(<Kontrolowany poczatkowe={[regula("a", "A", 0)]} showRequiredToggle={true} />);
    expect(screen.getByLabelText("Wymagana")).toBeInTheDocument();
  });
});
