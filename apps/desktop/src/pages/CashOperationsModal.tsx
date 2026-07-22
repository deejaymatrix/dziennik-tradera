import { useEffect, useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { formatMoney, isValidDecimalString, normalizeDecimalInput } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type {
  CashOperation,
  CashOperationKind,
  NewCashOperationInput,
} from "../app/types/cashOperation";
import { CASH_OPERATION_KIND_LABELS } from "../app/types/cashOperation";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { Modal } from "../ui/components/Modal/Modal";
import { Select } from "../ui/components/Select/Select";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./CashOperationsModal.module.css";

export interface CashOperationsModalProps {
  open: boolean;
  onClose: () => void;
  account: AccountWithBalance | null;
  onOperationAdded: () => void;
}

const KIND_OPTIONS: { value: CashOperationKind; label: string }[] = [
  { value: "deposit", label: CASH_OPERATION_KIND_LABELS.deposit },
  { value: "withdrawal", label: CASH_OPERATION_KIND_LABELS.withdrawal },
  { value: "adjustment", label: CASH_OPERATION_KIND_LABELS.adjustment },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rodzic renderuje ten komponent z `key` zależnym od id konta (patrz
 * AccountsPage), więc przy zmianie konta dostajemy świeżą instancję -
 * pola formularza startują puste bez osobnego efektu resetującego.
 */
export function CashOperationsModal({
  open,
  onClose,
  account,
  onOperationAdded,
}: CashOperationsModalProps): ReactElement | null {
  const { showToast } = useToast();
  const [operations, setOperations] = useState<CashOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [kind, setKind] = useState<CashOperationKind>("deposit");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadOperations(accountId: string): Promise<void> {
    setLoading(true);
    setListError(null);
    try {
      const data = await invokeCommand<CashOperation[]>("list_cash_operations", { accountId });
      setOperations(data);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (account) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- początkowe pobranie historii operacji dla tego konta (nowa instancja, patrz key w AccountsPage).
      void loadOperations(account.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ta instancja komponentu jest zawsze dla jednego, stałego konta (key wymusza remount przy zmianie).
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!account) {
      return;
    }
    setFormError(null);

    if (!isValidDecimalString(amount)) {
      setFormError(
        "Kwota musi być liczbą (np. 100 albo 100,50, dla korekty można poprzedzić znakiem -).",
      );
      return;
    }

    setSubmitting(true);
    try {
      const input: NewCashOperationInput = {
        account_id: account.id,
        kind,
        amount: normalizeDecimalInput(amount) ?? amount,
        occurred_at: new Date(occurredAt).toISOString(),
        note: note.trim() ? note : null,
      };
      await invokeCommand("create_cash_operation", { input });
      showToast("Operacja zapisana.", "success");
      setAmount("");
      setNote("");
      await loadOperations(account.id);
      onOperationAdded();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!account) {
    return null;
  }

  return (
    <Modal open={open} onClose={onClose} title={`Operacje finansowe — ${account.name}`}>
      <div className={styles.wrapper}>
        <p className={styles.balance}>
          Saldo bieżące: <strong>{formatMoney(account.balance, account.currency)}</strong>
        </p>

        <form
          className={styles.form}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <Select
            label="Rodzaj"
            value={kind}
            onChange={(e) => setKind(e.target.value as CashOperationKind)}
            options={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <TextField
            label="Kwota"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField
            label="Data"
            type="date"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
          <TextField
            label="Notatka (opcjonalnie)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {formError && (
            <p role="alert" className={styles.error}>
              {formError}
            </p>
          )}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Zapisywanie..." : "Dodaj operację"}
            </Button>
          </div>
        </form>

        <h3 className={styles.historyTitle}>Historia</h3>
        {loading && <p>Ładowanie...</p>}
        {listError && (
          <p role="alert" className={styles.error}>
            {listError}
          </p>
        )}
        {!loading && !listError && operations.length === 0 && (
          <EmptyState
            title="Brak operacji"
            description="Ten rachunek nie ma jeszcze żadnych wpłat, wypłat ani korekt."
          />
        )}
        {!loading && !listError && operations.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Rodzaj</th>
                <th className={tableStyles.numeric}>Kwota</th>
                <th>Notatka</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((op) => (
                <tr key={op.id}>
                  <td>{new Date(op.occurred_at).toLocaleDateString("pl-PL")}</td>
                  <td>{CASH_OPERATION_KIND_LABELS[op.kind]}</td>
                  <td className={tableStyles.numeric}>
                    {formatMoney(op.amount, account.currency)}
                  </td>
                  <td>{op.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Modal>
  );
}
