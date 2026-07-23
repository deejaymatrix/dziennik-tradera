import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { PartialClosesEditor } from "./PartialClosesEditor";
import type { PartialCloseRow } from "../app/tradeForm";

/** Opakowanie ze stanem - edytor jest kontrolowany, więc bez tego wpisywanie nic by nie zmieniało. */
function Harness({
  initialRows = [],
  volume = "1.0",
}: {
  initialRows?: PartialCloseRow[];
  volume?: string;
}): ReactElement {
  const [rows, setRows] = useState<PartialCloseRow[]>(initialRows);
  return <PartialClosesEditor rows={rows} onChange={setRows} volume={volume} currency="USD" />;
}

function licznik(etykieta: string): string {
  const term = screen.getByText(etykieta);
  return term.parentElement?.querySelector("dd")?.textContent ?? "";
}

describe("PartialClosesEditor", () => {
  it("bez wpisów tłumaczy, skąd weźmie się wynik", () => {
    render(<Harness />);

    expect(screen.getByText(/wynik policzy się z ceny wejścia i wyjścia/i)).toBeInTheDocument();
  });

  it("dodaje wpis i pozwala go usunąć", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /Dodaj częściowe zamknięcie/i }));
    expect(screen.getByLabelText(/Zamknięty lot/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Usuń częściowe zamknięcie nr 1/i }));
    expect(screen.queryByLabelText(/Zamknięty lot/i)).not.toBeInTheDocument();
  });

  it("liczy pozostały lot dokładnie, bez błędu liczb zmiennoprzecinkowych", async () => {
    const user = userEvent.setup();
    render(<Harness initialRows={[{ closedVolume: "", realizedPnl: "" }]} volume="1.0" />);

    // 0.1 + 0.2 w Number dałoby 0.30000000000000004, a pozostały lot 0.7 - 0.30000000000000004.
    await user.type(screen.getByLabelText(/Zamknięty lot/i), "0.1");
    await user.click(screen.getByRole("button", { name: /Dodaj częściowe zamknięcie/i }));
    const drugiLot = screen.getAllByLabelText(/Zamknięty lot/i)[1];
    if (!drugiLot) {
      throw new Error("oczekiwano drugiego pola zamkniętego lota po dodaniu wpisu");
    }
    await user.type(drugiLot, "0.2");

    expect(licznik("Zamknięty")).toBe("0.3");
    expect(licznik("Pozostały")).toBe("0.7");
  });

  it("przyjmuje przecinek dziesiętny z polskiej klawiatury", async () => {
    const user = userEvent.setup();
    render(<Harness initialRows={[{ closedVolume: "", realizedPnl: "" }]} volume="1,0" />);

    await user.type(screen.getByLabelText(/Zamknięty lot/i), "0,25");

    expect(licznik("Zamknięty")).toBe("0.25");
    expect(licznik("Pozostały")).toBe("0.75");
  });

  it("bez podanego lota transakcji pokazuje 'Brak danych', a nie fałszywe zero", () => {
    render(<Harness initialRows={[{ closedVolume: "0.5", realizedPnl: "10" }]} volume="" />);

    expect(licznik("Lot początkowy")).toBe("Brak danych");
    expect(licznik("Pozostały")).toBe("Brak danych");
    // Zamknięty lot znamy niezależnie od lota transakcji, więc ten policzyć się da.
    expect(licznik("Zamknięty")).toBe("0.5");
  });

  it("zamknięcie całego lota zapowiada zmianę statusu na zamkniętą", () => {
    render(
      <Harness
        initialRows={[
          { closedVolume: "0.4", realizedPnl: "20" },
          { closedVolume: "0.6", realizedPnl: "-5" },
        ]}
        volume="1.0"
      />,
    );

    expect(licznik("Pozostały")).toBe("0");
    expect(screen.getByText(/zostanie zapisana jako zamknięta/i)).toBeInTheDocument();
  });

  it("ostrzega, gdy suma zamkniętych lotów przekracza lot transakcji", () => {
    render(<Harness initialRows={[{ closedVolume: "1.5", realizedPnl: "10" }]} volume="1.0" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/przekracza lot początkowy/i);
  });

  it("nie liczy wierszy jeszcze pustych", async () => {
    const user = userEvent.setup();
    render(<Harness initialRows={[{ closedVolume: "0.3", realizedPnl: "12" }]} volume="1.0" />);

    await user.click(screen.getByRole("button", { name: /Dodaj częściowe zamknięcie/i }));

    // Świeżo dodany, pusty wiersz nie może zafałszować licznika ani wywołać ostrzeżenia.
    expect(licznik("Zamknięty")).toBe("0.3");
    expect(licznik("Pozostały")).toBe("0.7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("w trybie odczytu nie pokazuje akcji dodawania ani usuwania", () => {
    render(
      <PartialClosesEditor
        rows={[{ closedVolume: "0.3", realizedPnl: "12" }]}
        onChange={() => undefined}
        volume="1.0"
        currency="USD"
        disabled
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Dodaj częściowe zamknięcie/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Usuń częściowe zamknięcie/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Zamknięty lot/i)).toBeDisabled();
  });
});
