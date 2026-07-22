import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountFormModal } from "./AccountFormModal";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

const TEMPLATES = [
  {
    id: "t-wolny",
    name: "Vantage STP",
    broker_name: "Vantage",
    account_type: "STP",
    source: "broker_import",
    import_format_version: 1,
    account_id: null,
    created_at: "2026-07-22T11:00:00Z",
    updated_at: "2026-07-22T11:00:00Z",
    archived_at: null,
    instrument_count: 1052,
  },
  {
    id: "t-zajety",
    name: "QuoMarkets RAW",
    broker_name: "QuoMarkets",
    account_type: "RAW",
    source: "broker_import",
    import_format_version: 1,
    account_id: "a-stare",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    archived_at: null,
    instrument_count: 350,
  },
];

const ACCOUNTS = [
  {
    id: "a-stare",
    name: "Stare konto",
    description: null,
    account_type: null,
    currency: "USD",
    initial_balance: "1000",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    balance: "1000",
  },
];

function renderForm(node: ReactElement): void {
  render(<ToastProvider>{node}</ToastProvider>);
}

function mockBackend(): void {
  invokeCommand.mockImplementation((command: string) => {
    if (command === "list_broker_templates") return Promise.resolve(TEMPLATES);
    if (command === "list_accounts") return Promise.resolve(ACCOUNTS);
    if (command === "create_account") return Promise.resolve({ id: "a-nowe" });
    return Promise.resolve(null);
  });
}

describe("AccountFormModal - szablon przy zakładaniu konta", () => {
  beforeEach(() => {
    invokeCommand.mockReset();
    mockBackend();
  });

  it("podpowiada pierwszy WOLNY szablon, nie zabierając go innemu kontu", async () => {
    renderForm(<AccountFormModal open onClose={vi.fn()} onSaved={vi.fn()} />);

    const select = await screen.findByLabelText(/Szablon instrumentów/);
    await waitFor(() => expect(select).toHaveValue("t-wolny"));
  });

  it("opisuje szablon zajęty przez inne konto zamiast go ukrywać", async () => {
    renderForm(<AccountFormModal open onClose={vi.fn()} onSaved={vi.fn()} />);

    const select = await screen.findByLabelText(/Szablon instrumentów/);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("QuoMarkets RAW (350 instrumentów) — teraz na koncie: Stare konto");
    expect(options).toContain("Bez szablonu (przypiszę później)");
  });

  it("po utworzeniu konta od razu przypina wybrany szablon", async () => {
    renderForm(<AccountFormModal open onClose={vi.fn()} onSaved={vi.fn()} />);

    await screen.findByLabelText(/Szablon instrumentów/);
    await userEvent.type(screen.getByLabelText(/Nazwa konta/), "Konto Vantage");
    await userEvent.click(screen.getByRole("button", { name: /Utwórz|Zapisz/ }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("assign_broker_template", {
        templateId: "t-wolny",
        accountId: "a-nowe",
      }),
    );
  });

  it("nie przypina niczego, gdy wybrano brak szablonu", async () => {
    renderForm(<AccountFormModal open onClose={vi.fn()} onSaved={vi.fn()} />);

    const select = await screen.findByLabelText(/Szablon instrumentów/);
    await userEvent.selectOptions(select, "");
    await userEvent.type(screen.getByLabelText(/Nazwa konta/), "Konto bez szablonu");
    await userEvent.click(screen.getByRole("button", { name: /Utwórz|Zapisz/ }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenCalledWith("create_account", expect.anything()),
    );
    expect(invokeCommand).not.toHaveBeenCalledWith("assign_broker_template", expect.anything());
  });
});
