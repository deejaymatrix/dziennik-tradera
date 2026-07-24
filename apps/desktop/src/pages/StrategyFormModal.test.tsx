import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT } from "../app/PreferencesProvider";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import { StrategyFormModal } from "./StrategyFormModal";

/**
 * O4 redesignu (Blok O): domyślny kolor nowej strategii musi być tym samym niebieskim, co
 * domyślny akcent aplikacji (nie pozostałością starego złota `#c9a85a`). Wcześniej to był
 * niezależny literał `"#4c7dff"` obok `PreferencesProvider.DEFAULT_ACCENT` - tylko komentarz
 * łączył je ze sobą, nic nie pilnowało, żeby nie mogły się po cichu rozjechać (sekcja 27
 * promptu: "wielokrotne źródła prawdy"). Teraz to dzielony import, a ten test pilnuje
 * rzeczywiście WYRENDEROWANEJ wartości, nie tylko że oba literały akurat są dziś równe.
 */
describe("StrategyFormModal - domyślny kolor nowej strategii", () => {
  it("nowa strategia startuje z DEFAULT_ACCENT, nie z niezależną kopią literału", () => {
    render(
      <ToastProvider>
        <StrategyFormModal open onClose={() => undefined} onSaved={() => undefined} />
      </ToastProvider>,
    );

    // ColorPicker.tsx renderuje aktualny kolor wprost w aria-label wyzwalacza.
    expect(
      screen.getByRole("button", { name: new RegExp(`Kolor: ${DEFAULT_ACCENT}`, "i") }),
    ).toBeInTheDocument();
  });
});
