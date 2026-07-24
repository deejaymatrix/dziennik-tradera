import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

/**
 * Sekcja 21 promptu wymaga wprost: „tooltipy są dostępne z klawiatury" - dymek nie może
 * pojawiać się WYŁĄCZNIE na hover myszą. To wymaganie było dotąd potwierdzone jedynie
 * przeglądem kodu (`onFocus`/`onBlur` obok `onMouseEnter`/`onMouseLeave`), bez testu
 * renderującego rzeczywiste zachowanie - ta sama klasa luki co inne "✅ potwierdzone" miejsca
 * znalezione w tej sesji O7.
 */
describe("Tooltip - dostępny z klawiatury, nie tylko z myszy", () => {
  it("nie pokazuje treści, dopóki nic nie jest w fokusie ani pod kursorem", () => {
    render(
      <Tooltip content="Pełna, nieobcięta wartość">
        <button type="button">Skrócone</button>
      </Tooltip>,
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("pokazuje dymek po fokusie KLAWIATUROWYM (Tab), nie tylko po najechaniu myszą", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Pełna wartość">
        <button type="button">Skrócone</button>
      </Tooltip>,
    );

    await user.tab();

    expect(screen.getByRole("button")).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Pełna wartość");
  });

  it("chowa dymek po odejściu fokusu (blur)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Pełna wartość">
          <button type="button">Skrócone</button>
        </Tooltip>
        <button type="button">Inny element</button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("łączy dymek z elementem przez aria-describedby, żeby czytnik ekranu je skojarzył", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Pełna wartość">
        <button type="button">Skrócone</button>
      </Tooltip>,
    );

    await user.tab();

    const przycisk = screen.getByRole("button");
    const dymek = screen.getByRole("tooltip");
    expect(przycisk).toHaveAttribute("aria-describedby", dymek.id);
  });
});
