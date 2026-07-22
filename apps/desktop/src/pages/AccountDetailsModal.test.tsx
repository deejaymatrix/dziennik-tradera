import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDetailsModal } from "./AccountDetailsModal";
import { formatMoney } from "../app/decimal";
import type { AccountWithBalance } from "../app/types/account";
import type { BrokerTemplate } from "../app/types/instrument";
import { ConfirmProvider } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "../ui/components/Toast/ToastProvider";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("../app/invokeCommand", () => ({ invokeCommand }));

function account(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
  return {
    id: "a1",
    name: "Konto Vantage",
    description: null,
    account_type: "STP",
    currency: "USD",
    initial_balance: "5000",
    created_at: "2026-07-22T10:00:00Z",
    updated_at: "2026-07-22T10:00:00Z",
    archived_at: null,
    balance: "5250.50",
    ...overrides,
  };
}

function template(overrides: Partial<BrokerTemplate> = {}): BrokerTemplate {
  return {
    id: "t1",
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
    ...overrides,
  };
}

/** Zwraca `void`, a nie wynik `render` - w typach Reacta 19 `ReactNode` obejmuje też `Promise`,
 * przez co lint uznawał każde wywołanie za nieobsłużoną obietnicę. */
function renderModal(node: ReactElement): void {
  render(
    <ToastProvider>
      <ConfirmProvider>{node}</ConfirmProvider>
    </ToastProvider>,
  );
}

describe("AccountDetailsModal", () => {
  beforeEach(() => {
    invokeCommand.mockReset();
  });

  it("pokazuje dane konta razem z przypisanym szablonem i brokerem", async () => {
    invokeCommand.mockResolvedValue([template({ account_id: "a1" })]);

    renderModal(
      <AccountDetailsModal
        account={account()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    // Broker bierze się z przypisanego szablonu - konto samo w sobie go nie przechowuje.
    expect(await screen.findByText("Vantage STP")).toBeInTheDocument();
    expect(screen.getByText(/Vantage · STP · 1052 instrumentów/)).toBeInTheDocument();
    // Porównujemy z wynikiem `formatMoney`, a nie z zapisanym na sztywno tekstem - inaczej test
    // sprawdzałby dane lokalizacyjne `Intl` w środowisku testowym zamiast tego, co nas obchodzi:
    // czy saldo i saldo początkowe w ogóle trafiły do widoku.
    expect(screen.getByText(formatMoney("5250.50", "USD"))).toBeInTheDocument();
    expect(screen.getByText(formatMoney("5000", "USD"))).toBeInTheDocument();
  });

  it("ostrzega, gdy konto nie ma przypisanego szablonu", async () => {
    invokeCommand.mockResolvedValue([template({ account_id: null })]);

    renderModal(
      <AccountDetailsModal
        account={account()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText("Brak przypisanego szablonu")).toBeInTheDocument();
    expect(screen.getByText(/te same symbole mogą się dublować/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Przypisz szablon/ })).toBeInTheDocument();
  });

  it("do wyboru daje tylko szablony wolne albo należące do tego konta", async () => {
    invokeCommand.mockResolvedValue([
      template({ id: "t1", name: "Vantage STP", account_id: "a1" }),
      template({ id: "t2", name: "Wolny szablon", account_id: null }),
      // Zajęty przez INNE konto - backend i tak by go odrzucił, więc go nie pokazujemy.
      template({ id: "t3", name: "Szablon innego konta", account_id: "a2" }),
    ]);

    renderModal(
      <AccountDetailsModal
        account={account()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: /Zastąp szablon/ }));

    const select = await screen.findByLabelText(/Szablon dla tego konta/);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual([
      "Vantage STP (1052 instrumentów)",
      "Wolny szablon (1052 instrumentów)",
    ]);
    expect(options.join()).not.toContain("Szablon innego konta");
  });

  it("przycisk Edytuj konto oddaje sterowanie liście kont", async () => {
    invokeCommand.mockResolvedValue([template({ account_id: "a1" })]);
    const onEdit = vi.fn();

    renderModal(
      <AccountDetailsModal
        account={account()}
        onClose={vi.fn()}
        onEdit={onEdit}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: /Edytuj konto/ }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledOnce());
  });
});
