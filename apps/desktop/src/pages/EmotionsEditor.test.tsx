import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EmotionsEditor } from "./EmotionsEditor";
import type { EmotionalState } from "../app/types/emotional_state";
import type { TradeEmotions } from "../app/types/trade";

function stan(overrides: Partial<EmotionalState> = {}): EmotionalState {
  return {
    id: "strach",
    name: "Strach",
    is_builtin: true,
    hidden: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const STANY = [
  stan({ id: "strach", name: "Strach", sort_order: 0 }),
  stan({ id: "chciwosc", name: "Chciwość", sort_order: 1 }),
  stan({ id: "ukryty", name: "Ukryty stan", hidden: true, sort_order: 2 }),
];

function Kontrolowany({
  poczatkowe,
  states = STANY,
  disabled = false,
}: {
  poczatkowe: TradeEmotions;
  states?: EmotionalState[];
  disabled?: boolean;
}): React.ReactElement {
  const [wartosc, setWartosc] = useState(poczatkowe);
  return (
    <EmotionsEditor value={wartosc} onChange={setWartosc} states={states} disabled={disabled} />
  );
}

/**
 * `EmotionsEditor` (sekcja 6.8) - dodawanie emocji z wyszukiwarką, skala natężenia 1-5,
 * usuwanie. Najbardziej nieoczywista część: kliknięcie TEJ SAMEJ wartości na skali JĄ ZDEJMUJE
 * (wraca do "nie wybrano"), a nie tylko ją ustawia - klasyczny toggle, łatwo przeoczyć przy
 * refaktorze i zamienić w zwykłe `setIntensity(n)` bez sprawdzenia poprzedniej wartości. Dotąd
 * zero testów.
 */
describe("EmotionsEditor - pusta lista", () => {
  it("bez disabled pokazuje 'Nie dodano żadnych emocji.'", () => {
    render(<Kontrolowany poczatkowe={{ entries: [] }} />);
    expect(screen.getByText("Nie dodano żadnych emocji.")).toBeInTheDocument();
  });

  it("z disabled pokazuje inny tekst: 'Nie zapisano żadnych emocji.'", () => {
    render(<Kontrolowany poczatkowe={{ entries: [] }} disabled />);
    expect(screen.getByText("Nie zapisano żadnych emocji.")).toBeInTheDocument();
  });
});

describe("EmotionsEditor - skala natężenia: kliknięcie tej samej wartości ją zdejmuje", () => {
  it("pierwsze kliknięcie ustawia natężenie", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [{ state_id: "strach", intensity: null }] }} />);

    await user.click(screen.getByRole("button", { name: "Natężenie 3 z 5 dla Strach" }));

    expect(screen.getByRole("button", { name: "Natężenie 3 z 5 dla Strach" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("DRUGIE kliknięcie TEJ SAMEJ wartości zdejmuje natężenie (powrót do null)", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [{ state_id: "strach", intensity: 3 }] }} />);

    await user.click(screen.getByRole("button", { name: "Natężenie 3 z 5 dla Strach" }));

    expect(screen.getByRole("button", { name: "Natężenie 3 z 5 dla Strach" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("kliknięcie INNEJ wartości zmienia natężenie wprost, bez konieczności zdejmowania poprzedniej", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [{ state_id: "strach", intensity: 3 }] }} />);

    await user.click(screen.getByRole("button", { name: "Natężenie 5 z 5 dla Strach" }));

    expect(screen.getByRole("button", { name: "Natężenie 3 z 5 dla Strach" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Natężenie 5 z 5 dla Strach" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("EmotionsEditor - wyszukiwarka podpowiedzi", () => {
  it("ukrytej emocji nie ma na liście podpowiedzi", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [] }} />);
    await user.click(screen.getByLabelText("Dodaj emocję"));
    expect(screen.queryByRole("button", { name: "Ukryty stan" })).not.toBeInTheDocument();
  });

  it("już dodanej emocji nie ma na liście podpowiedzi (bez duplikatów)", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [{ state_id: "strach", intensity: null }] }} />);
    await user.click(screen.getByLabelText("Dodaj emocję"));
    expect(screen.queryByRole("button", { name: "Strach" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chciwość" })).toBeInTheDocument();
  });

  it("wpisanie tekstu filtruje podpowiedzi bez rozróżniania wielkości liter", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [] }} />);
    await user.type(screen.getByLabelText("Dodaj emocję"), "CHCIW");
    expect(screen.getByRole("button", { name: "Chciwość" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Strach" })).not.toBeInTheDocument();
  });

  it("klik na podpowiedź dodaje emocję z natężeniem null i chowa listę podpowiedzi", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowe={{ entries: [] }} />);
    await user.click(screen.getByLabelText("Dodaj emocję"));
    await user.click(screen.getByRole("button", { name: "Chciwość" }));

    expect(screen.getByText("Chciwość")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Strach" })).not.toBeInTheDocument();
  });
});

describe("EmotionsEditor - usuwanie nie dotyka innych wpisów", () => {
  it("usunięcie jednej emocji zostawia pozostałe", async () => {
    const user = userEvent.setup();
    render(
      <Kontrolowany
        poczatkowe={{
          entries: [
            { state_id: "strach", intensity: 2 },
            { state_id: "chciwosc", intensity: 4 },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Usuń emocję Strach" }));

    expect(screen.queryByText("Strach")).not.toBeInTheDocument();
    expect(screen.getByText("Chciwość")).toBeInTheDocument();
  });
});

describe("EmotionsEditor - emocja usunięta z definicji (historyczna migawka)", () => {
  it("wpis wskazujący na nieistniejący stan pokazuje '(usunięta emocja)'", () => {
    render(
      <Kontrolowany
        poczatkowe={{ entries: [{ state_id: "nieznany-id", intensity: 2 }] }}
        states={STANY}
      />,
    );
    expect(screen.getByText("(usunięta emocja)")).toBeInTheDocument();
  });
});

describe("EmotionsEditor - tryb disabled", () => {
  it("ukrywa wyszukiwarkę i przycisk usuwania, wyłącza przyciski skali", () => {
    render(
      <Kontrolowany poczatkowe={{ entries: [{ state_id: "strach", intensity: 3 }] }} disabled />,
    );
    expect(screen.queryByLabelText("Dodaj emocję")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usuń emocję Strach" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Natężenie 3 z 5 dla Strach" })).toBeDisabled();
  });
});
