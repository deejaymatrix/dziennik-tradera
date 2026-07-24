import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children and responds to clicks", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Zapisz</Button>);

    const button = screen.getByRole("button", { name: "Zapisz" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button onClick={onClick} disabled>
        Zapisz
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits a surrounding form by accident", () => {
    render(<Button>Anuluj</Button>);
    expect(screen.getByRole("button", { name: "Anuluj" })).toHaveAttribute("type", "button");
  });

  it("is reachable and activatable via keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Zapisz</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Zapisz" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("stan loading blokuje kliknięcie i ustawia aria-busy, bez zmiany dostępnej nazwy", async () => {
    // Sekcja 9 promptu wymaga stanu "loading" na każdym komponencie - Button dotąd go nie miał,
    // każde miejsce użycia ręcznie podmieniało tekst na "Zapisywanie..." i pamiętało dodać
    // `disabled` osobno. Tekst NIE znika (chowa się przez CSS `visibility`, nie `display: none`),
    // więc nazwa dostępna dla czytnika ekranu zostaje ta sama - to świadomy wybór.
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button onClick={onClick} loading>
        Zapisz
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Zapisz" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading nie nadpisuje jawnie przekazanego disabled - oba działają razem", () => {
    render(
      <Button disabled loading={false}>
        Zapisz
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Zapisz" })).toBeDisabled();
  });

  it("poza stanem loading nie ma aria-busy w ogóle (nie 'false' jako string)", () => {
    render(<Button>Zapisz</Button>);
    expect(screen.getByRole("button", { name: "Zapisz" })).not.toHaveAttribute("aria-busy");
  });
});
