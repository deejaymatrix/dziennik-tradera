import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SessionField } from "./SessionField";

function Kontrolowany({ poczatkowa }: { poczatkowa: string }): React.ReactElement {
  const [wartosc, setWartosc] = useState(poczatkowa);
  return <SessionField value={wartosc} onChange={setWartosc} />;
}

/**
 * `SessionField` zastąpił zwykłe pole tekstowe listą gotowych sesji + opcją własnej, żeby ta
 * sama sesja nie zapisywała się na kilka sposobów ("Londyn"/"londyn"/"LDN"), co rozjeżdżało
 * grupowanie w raportach. Najbardziej ryzykowna część: wartość SPOZA listy gotowych (np. sesja
 * wpisana ręcznie w starszej transakcji, sprzed tej zmiany) musi OD RAZU włączyć tryb własnej
 * sesji - inaczej otwarcie do edycji starej transakcji cicho pokazywałoby "Brak" zamiast
 * zachowanej wartości, a zapis nadpisałby ją pustym stringiem. Dotąd zero testów.
 */
describe("SessionField - rozpoznawanie trybu własnej sesji", () => {
  it("pusta wartość początkowa NIE włącza trybu własnej sesji", () => {
    render(<Kontrolowany poczatkowa="" />);
    expect(screen.getByLabelText("Sesja (opcjonalnie)")).toHaveValue("");
    expect(screen.queryByLabelText("Własna sesja")).not.toBeInTheDocument();
  });

  it("wartość Z LISTY gotowych NIE włącza trybu własnej sesji", () => {
    render(<Kontrolowany poczatkowa="Londyn" />);
    expect(screen.getByLabelText("Sesja (opcjonalnie)")).toHaveValue("Londyn");
    expect(screen.queryByLabelText("Własna sesja")).not.toBeInTheDocument();
  });

  it("wartość SPOZA listy (zapisana wcześniej ręcznie) OD RAZU włącza tryb własnej sesji", () => {
    render(<Kontrolowany poczatkowa="Sydney" />);
    expect(screen.getByLabelText("Sesja (opcjonalnie)")).toHaveValue("__custom__");
    expect(screen.getByLabelText("Własna sesja")).toHaveValue("Sydney");
  });
});

describe("SessionField - przełączanie między listą a własną sesją", () => {
  it("wybranie 'Własna...' czyści wartość i pokazuje pole tekstowe", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowa="Londyn" />);

    await user.selectOptions(screen.getByLabelText("Sesja (opcjonalnie)"), "Własna...");

    const pole = screen.getByLabelText("Własna sesja");
    expect(pole).toHaveValue("");
  });

  it("wybranie gotowej wartości z trybu własnej wyłącza go", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowa="Sydney" />);
    expect(screen.getByLabelText("Własna sesja")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Sesja (opcjonalnie)"), "Nowy Jork");

    expect(screen.queryByLabelText("Własna sesja")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Sesja (opcjonalnie)")).toHaveValue("Nowy Jork");
  });

  it("wpisywanie w polu własnej sesji zapisuje wpisaną wartość", async () => {
    const user = userEvent.setup();
    render(<Kontrolowany poczatkowa="Sydney" />);

    const pole = screen.getByLabelText("Własna sesja");
    await user.clear(pole);
    await user.type(pole, "Otwarcie giełdy");

    expect(pole).toHaveValue("Otwarcie giełdy");
  });
});
