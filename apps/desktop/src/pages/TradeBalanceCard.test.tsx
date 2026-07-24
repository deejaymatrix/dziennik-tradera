import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TradeBalanceCard } from "./TradeBalanceCard";
import type { TradeBalanceContext } from "../app/types/trade";

const kontekst: TradeBalanceContext = {
  balance_before: "1000.00",
  balance_after: "1050.00",
  current_balance: "2000.00",
};

/**
 * `TradeBalanceCard` ma DWA NIEZALEŻNE źródła "aktualnego salda", zależnie od trybu: dla nowej
 * transakcji pokazuje ŻYWY prop `currentBalance`, dla edytowanej - ZAMROŻONĄ migawkę
 * `context.current_balance` sprzed rozpoczęcia edycji (komentarz w źródle: "nie przelicza się
 * na żywo przy zmianie pól w formularzu"). Pomylenie tych dwóch źródeł byłoby niewidoczne przy
 * pobieżnym teście (oba to "saldo", oba się renderują) - trzeba świadomie ustawić je na RÓŻNE
 * wartości, żeby regresja była wykrywalna. Dotąd zero testów.
 */
describe("TradeBalanceCard - wybór źródła danych zależnie od trybu", () => {
  it("nowa transakcja (!isEdit): pokazuje TYLKO żywe saldo z propa currentBalance, bez przed/po", () => {
    render(
      <TradeBalanceCard isEdit={false} context={null} currentBalance="500.00" currency="USD" />,
    );
    expect(screen.getByText("Aktualne saldo konta")).toBeInTheDocument();
    expect(screen.getByText("500,00 USD")).toBeInTheDocument();
    expect(screen.queryByText("Saldo przed transakcją")).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo po transakcji")).not.toBeInTheDocument();
  });

  it("edycja bez wczytanego kontekstu: pokazuje stan ładowania, nie żadne saldo", () => {
    render(
      <TradeBalanceCard isEdit={true} context={null} currentBalance="500.00" currency="USD" />,
    );
    expect(screen.getByText("Wczytywanie salda...")).toBeInTheDocument();
    expect(screen.queryByText("Aktualne saldo konta")).not.toBeInTheDocument();
  });

  it("edycja z kontekstem: 'Aktualne saldo konta' pochodzi z ZAMROŻONEJ migawki context.current_balance, NIE z żywego propa currentBalance", () => {
    render(
      <TradeBalanceCard
        isEdit={true}
        context={kontekst}
        currentBalance="999999.99"
        currency="USD"
      />,
    );
    // Migawka (2000,00) musi się pokazać, żywy prop (999999,99) NIE.
    expect(screen.getByText("2000,00 USD")).toBeInTheDocument();
    expect(screen.queryByText(/999\s?999,99/)).not.toBeInTheDocument();
    expect(screen.getByText("1000,00 USD")).toBeInTheDocument();
    expect(screen.getByText("1050,00 USD")).toBeInTheDocument();
  });
});
