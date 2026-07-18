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
});
