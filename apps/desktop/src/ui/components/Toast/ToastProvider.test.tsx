import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function TestConsumer(): ReactElement {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        showToast("Konto zapisane.", "success");
      }}
    >
      Pokaż powiadomienie
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  it("shows a toast when showToast is called and lets the user dismiss it", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Pokaż powiadomienie" }));
    expect(screen.getByRole("status")).toHaveTextContent("Konto zapisane.");

    await user.click(screen.getByRole("button", { name: "Zamknij powiadomienie" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("throws a clear error when useToast is used outside the provider", () => {
    function Bare(): ReactElement {
      useToast();
      return <p>should not render</p>;
    }
    expect(() => render(<Bare />)).toThrow("useToast musi być użyty wewnątrz <ToastProvider>.");
  });
});
