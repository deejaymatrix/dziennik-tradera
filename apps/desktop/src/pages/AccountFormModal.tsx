import { useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { isValidDecimalString, normalizeDecimalInput } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance, NewAccountInput, UpdateAccountInput } from "../app/types/account";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { Select } from "../ui/components/Select/Select";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./AccountFormModal.module.css";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"];

export interface AccountFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  account?: AccountWithBalance | undefined;
}

/**
 * Rodzic renderuje ten komponent z `key` zależnym od edytowanego konta (patrz
 * AccountsPage), więc pola startowe poniżej liczą się raz przy montowaniu -
 * nie potrzeba efektu resetującego formularz przy zmianie `account`.
 */
export function AccountFormModal({
  open,
  onClose,
  onSaved,
  account,
}: AccountFormModalProps): ReactElement {
  const isEdit = Boolean(account);
  const { showToast } = useToast();

  const [name, setName] = useState(() => account?.name ?? "");
  const [description, setDescription] = useState(() => account?.description ?? "");
  const [accountType, setAccountType] = useState(() => account?.account_type ?? "");
  const [currency, setCurrency] = useState(() => account?.currency ?? "USD");
  const isCurrencySupported = SUPPORTED_CURRENCIES.includes(currency);
  const currencyOptions = isCurrencySupported
    ? SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code }))
    : [
        { value: currency, label: `${currency} (nieobsługiwana — wybierz nową walutę)` },
        ...SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code })),
      ];
  const currencyHint = isCurrencySupported
    ? undefined
    : "To konto ma walutę spoza obecnie obsługiwanych (USD/EUR/GBP). Wybierz nową walutę świadomie — zmiana nie jest wykonywana automatycznie.";
  const [initialBalance, setInitialBalance] = useState(() => account?.initial_balance ?? "0");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    if (!isEdit && !isValidDecimalString(initialBalance)) {
      setFormError("Saldo początkowe musi być liczbą (np. 1000 albo 1000,50).");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && account) {
        const input: UpdateAccountInput = {
          name,
          description: description.trim() ? description : null,
          account_type: accountType.trim() ? accountType : null,
          currency: currency.toUpperCase(),
        };
        await invokeCommand("update_account", { id: account.id, input });
        showToast("Konto zaktualizowane.", "success");
      } else {
        const input: NewAccountInput = {
          name,
          description: description.trim() ? description : null,
          account_type: accountType.trim() ? accountType : null,
          currency: currency.toUpperCase(),
          initial_balance: normalizeDecimalInput(initialBalance) ?? "0",
        };
        await invokeCommand("create_account", { input });
        showToast("Konto utworzone.", "success");
      }
      onSaved();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edytuj konto" : "Nowe konto"}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <TextField
          label="Nazwa konta"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Opis (opcjonalnie)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          label="Typ konta (opcjonalnie)"
          hint="Np. demo, rzeczywiste, prop firm"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        />
        <Select
          label="Waluta"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={currencyOptions}
          {...(currencyHint ? { hint: currencyHint } : {})}
        />
        {!isEdit && (
          <TextField
            label="Saldo początkowe"
            required
            inputMode="decimal"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
          />
        )}
        {formError && (
          <p role="alert" className={styles.error}>
            {formError}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
