import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("associates the label with the input so it's reachable by accessible name", () => {
    render(<TextField label="Nazwa konta" />);
    expect(screen.getByLabelText("Nazwa konta")).toBeInTheDocument();
  });

  it("lets the user type into the field", async () => {
    const user = userEvent.setup();
    render(<TextField label="Nazwa konta" />);

    const input = screen.getByLabelText("Nazwa konta");
    await user.type(input, "Konto demo");
    expect(input).toHaveValue("Konto demo");
  });

  it("marks the field invalid and announces the error message", () => {
    render(<TextField label="Waluta" error="Waluta musi być kodem 3-literowym." />);

    const input = screen.getByLabelText("Waluta");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Waluta musi być kodem 3-literowym.");
  });
});
