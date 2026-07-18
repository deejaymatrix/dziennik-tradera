import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>treść aplikacji</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("treść aplikacji")).toBeInTheDocument();
  });

  it("renders a recovery screen instead of a blank page when a child throws", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Wystąpił nieoczekiwany błąd");
    expect(screen.getByRole("button", { name: "Uruchom ponownie" })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
