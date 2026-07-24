import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("renders the icon and responds to clicks", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon={<span>ikona</span>} aria-label="Usuń" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Usuń" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("stan loading blokuje kliknięcie i ustawia aria-busy, bez zmiany dostępnej nazwy", async () => {
    // Ta sama luka co w Button, znaleziona w części 52 audytu O7 - IconButton w ogóle nie miał
    // propa `loading`, więc kilka miejsc (wiersze Kosza) mogło tylko `disabled`, bez spinnera.
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon={<span>ikona</span>} aria-label="Usuń" loading onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Usuń" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading nie nadpisuje jawnie przekazanego disabled - oba działają razem", () => {
    render(<IconButton icon={<span>ikona</span>} aria-label="Usuń" disabled loading={false} />);
    expect(screen.getByRole("button", { name: "Usuń" })).toBeDisabled();
  });

  it("poza stanem loading nie ma aria-busy w ogóle (nie 'false' jako string)", () => {
    render(<IconButton icon={<span>ikona</span>} aria-label="Usuń" />);
    expect(screen.getByRole("button", { name: "Usuń" })).not.toHaveAttribute("aria-busy");
  });
});
