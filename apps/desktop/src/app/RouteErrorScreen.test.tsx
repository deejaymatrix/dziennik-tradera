import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteErrorScreen } from "./RouteErrorScreen";

const useRouteError = vi.hoisted(() => vi.fn());
vi.mock("react-router", () => ({ useRouteError }));

/**
 * Ekran błędu tras routera - jedyne, co użytkownik zobaczy zamiast surowego, deweloperskiego
 * zrzutu stosu Reacta przy awarii widoku (Faza 10 audytu). React Router potrafi przekazać do
 * `useRouteError()` DOWOLNĄ rzuconą wartość, nie tylko instancję `Error` - błąd w gałęzi
 * `String(error)` pokazałby nieczytelne "[object Object]" zamiast prawdziwego komunikatu. Dotąd
 * zero testów (indirect wiring w `router.tsx` też bez testu).
 */
describe("RouteErrorScreen", () => {
  afterEach(() => {
    useRouteError.mockReset();
  });

  it("renderuje ekran odzyskiwania z komunikatem z instancji Error", () => {
    useRouteError.mockReturnValue(new Error("Nie udało się wczytać widoku."));
    render(<RouteErrorScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("Wystąpił nieoczekiwany błąd");
    expect(screen.getByText("Nie udało się wczytać widoku.")).toBeInTheDocument();
  });

  it("rzuconą wartość NIEBĘDĄCĄ instancją Error konwertuje przez String(), nie pokazuje '[object Object]'", () => {
    useRouteError.mockReturnValue("zwykły string błędu");
    render(<RouteErrorScreen />);
    expect(screen.getByText("zwykły string błędu")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("klik 'Uruchom ponownie' przeładowuje stronę", async () => {
    useRouteError.mockReturnValue(new Error("x"));
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    const user = userEvent.setup();
    render(<RouteErrorScreen />);
    await user.click(screen.getByRole("button", { name: "Uruchom ponownie" }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });
});
