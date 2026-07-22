import { useEffect, useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { isValidDecimalString, normalizeDecimalInput } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance, NewAccountInput, UpdateAccountInput } from "../app/types/account";
import type { BrokerTemplate } from "../app/types/instrument";
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

  // Szablon instrumentów wybierany OD RAZU przy zakładaniu konta. Przy edycji tego pola nie ma -
  // tam zmiana szablonu idzie przez prowadzone "Zastąp szablon konta" w szczegółach konta, które
  // ostrzega, z którego konta szablon zostanie zdjęty.
  const [templates, setTemplates] = useState<BrokerTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    if (isEdit) {
      return;
    }
    void (async () => {
      try {
        const templateList = await invokeCommand<BrokerTemplate[]>("list_broker_templates", {
          includeArchived: false,
        });
        setTemplates(templateList);
        setTemplateId(templateList[0]?.id ?? "");
      } catch {
        // Brak listy szablonów nie może blokować zakładania konta - pole zostaje puste.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowo przy montowaniu.
  }, []);

  // Każdy aktywny szablon jest do wzięcia - jeden szablon obsługuje wiele kont, więc kilka
  // rachunków u tego samego brokera spokojnie dzieli ten sam katalog instrumentów.
  const templateOptions = [
    { value: "", label: "Bez szablonu (przypiszę później)" },
    ...templates.map((t) => ({
      value: t.id,
      label:
        t.account_count > 0
          ? `${t.name} (${t.instrument_count} instrumentów) — używany przez ${t.account_count} kont(a)`
          : `${t.name} (${t.instrument_count} instrumentów)`,
    })),
  ];
  const templateHint =
    "Szablon decyduje, jakie instrumenty i parametry zobaczysz przy transakcjach na tym koncie. Wyboru NIE DA SIĘ później zmienić - błędne powiązanie naprawia się usunięciem konta.";
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
        const created = await invokeCommand<AccountWithBalance>("create_account", { input });
        // Szablon przypisujemy od razu po utworzeniu konta - inaczej konto rodzi się bez
        // instrumentów i użytkownik musi szukać, gdzie to dopiąć.
        if (templateId) {
          await invokeCommand("assign_broker_template", {
            templateId,
            accountId: created.id,
          });
        }
        showToast(
          templateId ? "Konto utworzone i połączone z szablonem." : "Konto utworzone.",
          "success",
        );
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
        {!isEdit && (
          <Select
            label="Szablon instrumentów"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            options={templateOptions}
            hint={templateHint}
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
