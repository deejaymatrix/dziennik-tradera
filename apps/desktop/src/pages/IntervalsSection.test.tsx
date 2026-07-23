import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntervalsSection } from "./IntervalsSection";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

vi.mock("../app/PreferencesProvider", () => ({
  usePreferences: () => ({ preferences: null }),
  useOptionalPreferences: () => null,
}));

function renderSection(): void {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <IntervalsSection />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

describe("IntervalsSection - stany widoku", () => {
  beforeEach(() => {
    invokeCommand.mockReset();
  });

  it("nieudane wczytanie pokazuje błąd z akcją, a nie wieczny szkielet", async () => {
    // Wcześniej wyjątek kończył się samym toastem, a lista zostawała na `null` - szkielet
    // ładowania kręcił się bez końca i wyglądał jak zawieszona aplikacja.
    invokeCommand.mockRejectedValue(new Error("Baza jest niedostępna"));
    renderSection();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    // Ten sam komunikat pokazuje też toast, więc szukamy go WEWNĄTRZ stanu błędu - to on ma
    // zostać na ekranie po zniknięciu toastu.
    expect(within(screen.getByRole("alert")).getByText("Baza jest niedostępna")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
  });

  it("pusta lista pokazuje stan pusty, a nie samą pustkę", async () => {
    invokeCommand.mockResolvedValue([]);
    renderSection();

    await waitFor(() => {
      expect(screen.getByText("Brak interwałów")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("wczytane interwały nie pokazują ani błędu, ani stanu pustego", async () => {
    invokeCommand.mockResolvedValue([
      { id: "i1", label: "H1", hidden: false, archived_at: null, sort_order: 0, built_in: true },
    ]);
    renderSection();

    await waitFor(() => {
      expect(screen.getByText("H1")).toBeTruthy();
    });
    expect(screen.queryByText("Brak interwałów")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
