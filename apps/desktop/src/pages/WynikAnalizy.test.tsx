import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WynikAnalizy } from "./WynikAnalizy";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";
import type { AnalizaWynik } from "../app/types/aiAnalysis";

function wynik(over: Partial<AnalizaWynik> = {}): AnalizaWynik {
  return {
    fakty: [],
    obserwacje: [],
    hipotezy: [],
    rekomendacje: [],
    jakosc_danych: [],
    ...over,
  };
}

function wyrenderuj(w: AnalizaWynik): void {
  render(
    <ToastProvider>
      <WynikAnalizy wynik={w} />
    </ToastProvider>,
  );
}

describe("WynikAnalizy", () => {
  it("pokazuje wszystkie pięć niepustych sekcji z ich punktami i przycisk kopiowania", () => {
    wyrenderuj(
      wynik({
        fakty: ["fakt A"],
        obserwacje: ["obserwacja B"],
        hipotezy: ["hipoteza C"],
        rekomendacje: ["rekomendacja D"],
        jakosc_danych: ["jakość E"],
      }),
    );
    for (const naglowek of ["Fakty", "Obserwacje", "Hipotezy", "Rekomendacje", "Jakość danych"]) {
      expect(screen.getByText(naglowek)).toBeInTheDocument();
    }
    expect(screen.getByText("fakt A")).toBeInTheDocument();
    expect(screen.getByText("jakość E")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kopiuj analizę/ })).toBeInTheDocument();
  });

  it("pomija puste sekcje (nagłówek nie pojawia się bez punktów)", () => {
    wyrenderuj(wynik({ fakty: ["tylko fakt"] }));
    expect(screen.getByText("Fakty")).toBeInTheDocument();
    expect(screen.queryByText("Obserwacje")).not.toBeInTheDocument();
    expect(screen.queryByText("Hipotezy")).not.toBeInTheDocument();
    expect(screen.queryByText("Rekomendacje")).not.toBeInTheDocument();
    expect(screen.queryByText("Jakość danych")).not.toBeInTheDocument();
  });
});
