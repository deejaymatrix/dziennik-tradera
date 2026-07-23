import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { CommandPalette } from "./CommandPalette";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

function renderPalette(): void {
  navigate.mockReset();
  render(
    <MemoryRouter>
      <CommandPalette />
    </MemoryRouter>,
  );
}

/** Paleta reaguje na skrót globalny, więc test też musi go wysłać do dokumentu. */
async function otworz(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.keyboard("{Control>}k{/Control}");
}

describe("Paleta poleceń", () => {
  it("jest niewidoczna, dopóki nie użyje się skrótu", () => {
    renderPalette();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("otwiera się i zamyka skrótem Ctrl+K", async () => {
    const user = userEvent.setup();
    renderPalette();

    await otworz(user);
    expect(screen.getByRole("dialog", { name: "Paleta poleceń" })).toBeInTheDocument();

    await otworz(user);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zamyka się klawiszem Escape", async () => {
    const user = userEvent.setup();
    renderPalette();
    await otworz(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filtruje polecenia po wpisanym tekście", async () => {
    const user = userEvent.setup();
    renderPalette();
    await otworz(user);

    await user.type(screen.getByLabelText("Szukaj polecenia"), "raport");

    expect(screen.getByRole("button", { name: /Raporty/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kalkulator/ })).not.toBeInTheDocument();
  });

  it("Enter uruchamia zaznaczone polecenie i zamyka paletę", async () => {
    const user = userEvent.setup();
    renderPalette();
    await otworz(user);

    await user.type(screen.getByLabelText("Szukaj polecenia"), "kosz");
    await user.keyboard("{Enter}");

    expect(navigate).toHaveBeenCalledWith("/kosz");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("strzałki przesuwają zaznaczenie", async () => {
    const user = userEvent.setup();
    renderPalette();
    await otworz(user);

    // Bez filtrowania pierwsza pozycja to akcja "Nowa transakcja"; strzałka w dół przechodzi
    // na "Sprawdź aktualizacje".
    await user.keyboard("{ArrowDown}{Enter}");

    expect(navigate).toHaveBeenCalledWith("/ustawienia");
  });

  it("nie zawiera żadnej operacji niszczącej", async () => {
    const user = userEvent.setup();
    renderPalette();
    await otworz(user);

    // Prompt wprost zabrania trwałego usuwania w palecie - pilnujemy tego testem, bo przy
    // dokładaniu kolejnych poleceń łatwo o tym zapomnieć.
    for (const zakazane of [/usuń/i, /trwale/i, /opróżnij/i, /skasuj/i]) {
      expect(screen.queryByRole("button", { name: zakazane })).not.toBeInTheDocument();
    }
  });
});
