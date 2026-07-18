import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders its title and content when open", () => {
    render(
      <Modal open title="Nowe konto" onClose={vi.fn()}>
        <p>Treść formularza</p>
      </Modal>,
    );

    expect(screen.getByRole("heading", { name: "Nowe konto" })).toBeInTheDocument();
    expect(screen.getByText("Treść formularza")).toBeInTheDocument();
  });

  it("calls onClose when the close button is activated", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open title="Nowe konto" onClose={onClose}>
        <p>Treść formularza</p>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
