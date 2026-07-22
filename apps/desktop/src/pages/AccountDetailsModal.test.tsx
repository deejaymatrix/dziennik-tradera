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
    template_id: null,
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
    account_count: 0,
    created_at: "2026-07-22T11:00:00Z",
    updated_at: "2026-07-22T11:00:00Z",
    archived_at: null,
    instrument_count: 1052,
    ...overrides,
  };
}

/** Konto już powiązane z szablonem `t1` - powiązanie mieszka na koncie (migracja 0011). */
const accountWithTemplate = account({ template_id: "t1" });

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
    invokeCommand.mockResolvedValue([template()]);

    renderModal(
      <AccountDetailsModal
        account={accountWithTemplate}
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
    invokeCommand.mockResolvedValue([template()]);

    renderModal(
      <AccountDetailsModal
        account={account()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText("Brak przypisanego szablonu")).toBeInTheDocument();
    // (konto bez `template_id` - patrz `account()` bez nadpisań)
    expect(screen.getByText(/te same symbole mogą się dublować/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Przypisz szablon/ })).toBeInTheDocument();
  });

  it("do przypisania daje też szablon używany już przez inne konta", async () => {
    invokeCommand.mockResolvedValue([
      template({ id: "t2", name: "Nieużywany szablon", account_count: 0 }),
      // Jeden szablon obsługuje wiele kont, więc używany NIE znika z listy - kilka rachunków
      // u tego samego brokera ma prawo dzielić katalog instrumentów.
      template({ id: "t3", name: "Wspólny szablon", account_count: 2 }),
    ]);

    renderModal(
      <AccountDetailsModal
        account={account()}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: /Przypisz szablon/ }));

    const select = await screen.findByLabelText(/Szablon dla tego konta/);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual([
      "Nieużywany szablon (1052 instrumentów)",
      "Wspólny szablon (1052 instrumentów) — używany przez 2 kont(a)",
    ]);
    expect(screen.getByText(/NIE DA SIĘ cofnąć/)).toBeInTheDocument();
  });

  it("konto z szablonem nie ma już żadnej możliwości jego zmiany", async () => {
    invokeCommand.mockResolvedValue([
      template({ id: "t1", name: "Vantage STP", account_count: 1 }),
      template({ id: "t2", name: "Inny szablon" }),
    ]);

    renderModal(
      <AccountDetailsModal
        account={accountWithTemplate}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText("Vantage STP")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Przypisz szablon|Zastąp szablon/ })).toBeNull();
    expect(screen.getByText(/Zmiana wymaga usunięcia konta/)).toBeInTheDocument();
  });

  it("przycisk Edytuj konto oddaje sterowanie liście kont", async () => {
    invokeCommand.mockResolvedValue([template()]);
    const onEdit = vi.fn();

    renderModal(
      <AccountDetailsModal
        account={accountWithTemplate}
        onClose={vi.fn()}
        onEdit={onEdit}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: /Edytuj konto/ }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledOnce());
  });
});
