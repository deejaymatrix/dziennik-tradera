import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Layers, Pencil } from "lucide-react";
import { formatMoney } from "../app/decimal";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type { BrokerTemplate } from "../app/types/instrument";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { Modal } from "../ui/components/Modal/Modal";
import { ReadOnlyField } from "../ui/components/ReadOnlyField/ReadOnlyField";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./AccountDetailsModal.module.css";

export interface AccountDetailsModalProps {
  account: AccountWithBalance;
  onClose: () => void;
  /** Otwiera formularz edycji konta - świadomie ten sam, którego używa lista kont. */
  onEdit: () => void;
  /** Zmiana szablonu wpływa na listy instrumentów, więc lista kont musi się odświeżyć. */
  onChanged: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Szczegóły konta handlowego (sekcja 4 specyfikacji) - tryb odczytu z przyciskiem "Edytuj konto"
 * oraz przypisanym szablonem instrumentów.
 *
 * Zmiana szablonu NIE jest zwykłym nadpisaniem identyfikatora: idzie przez atomowe
 * `assign_broker_template` ("Zastąp szablon konta"), które w jednej transakcji odpina poprzedni
 * szablon i przypina nowy, odrzucając szablon zajęty przez inne konto. Relacja konto↔szablon
 * jest jeden-do-jednego i wymuszona w bazie, nie tylko w interfejsie (sekcja 1.2).
 */
export function AccountDetailsModal({
  account,
  onClose,
  onEdit,
  onChanged,
}: AccountDetailsModalProps): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [templates, setTemplates] = useState<BrokerTemplate[] | null>(null);
  /** Potrzebne wyłącznie po to, żeby nazwać konto, z którego szablon zostanie zdjęty. */
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadTemplates(): Promise<void> {
    try {
      const [list, accountList] = await Promise.all([
        invokeCommand<BrokerTemplate[]>("list_broker_templates", { includeArchived: false }),
        invokeCommand<AccountWithBalance[]>("list_accounts", { includeArchived: false }),
      ]);
      setTemplates(list);
      setAccounts(accountList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się wczytać szablonów.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTemplates();
  }, []);

  const assigned = templates?.find((t) => t.account_id === account.id) ?? null;
  // Pokazujemy WSZYSTKIE aktywne szablony, także te leżące na innych kontach - przypisanie jest
  // przeniesieniem, więc ukrywanie ich zostawiało konto bez żadnej drogi do pasującego szablonu.
  // Przy takim wyborze potwierdzenie mówi wprost, z którego konta szablon zniknie.
  const selectable = templates ?? [];

  function accountNameFor(templateAccountId: string | null): string | null {
    if (!templateAccountId || templateAccountId === account.id) {
      return null;
    }
    return accounts?.find((a) => a.id === templateAccountId)?.name ?? "inne konto";
  }

  function optionLabel(t: BrokerTemplate): string {
    const owner = accountNameFor(t.account_id);
    const base = `${t.name} (${t.instrument_count} instrumentów)`;
    return owner ? `${base} — teraz na koncie: ${owner}` : base;
  }

  async function handleReplace(): Promise<void> {
    const target = templates?.find((t) => t.id === selectedTemplateId);
    if (!target) {
      return;
    }
    const takenFrom = accountNameFor(target.account_id);
    const message = [
      assigned
        ? `Zastąpić szablon konta "${account.name}"?\n\nZ: „${assigned.name}" (${assigned.instrument_count} instrumentów)\nNa: „${target.name}" (${target.instrument_count} instrumentów)`
        : `Przypisać szablon „${target.name}" (${target.instrument_count} instrumentów) do konta "${account.name}"?`,
      // Jeden szablon należy do jednego konta, więc przypisanie stąd zabiera go tamtemu - to musi
      // być powiedziane wprost, zanim użytkownik potwierdzi.
      takenFrom
        ? `\nUWAGA: ten szablon jest teraz przypisany do konta "${takenFrom}" i zostanie z niego zdjęty. Tamto konto zostanie bez szablonu.`
        : null,
      "\nTransakcje już zapisane zachowują zamrożone parametry, więc ich wyniki się nie zmienią.",
    ]
      .filter(Boolean)
      .join("\n");

    if (!(await confirm({ message, confirmLabel: assigned ? "Zastąp szablon" : "Przypisz" }))) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await invokeCommand("assign_broker_template", {
        templateId: target.id,
        accountId: account.id,
      });
      showToast(`Konto "${account.name}" korzysta teraz z szablonu „${target.name}".`, "success");
      setReplacing(false);
      await loadTemplates();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zmienić szablonu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Konto: ${account.name}`}>
      <div className={styles.body}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Dane konta</h3>
          <ReadOnlyField
            rows={[
              { label: "Nazwa", value: account.name },
              { label: "Broker", value: assigned?.broker_name ?? "—" },
              { label: "Typ konta", value: account.account_type ?? "—" },
              { label: "Waluta", value: account.currency },
              {
                label: "Saldo początkowe",
                value: formatMoney(account.initial_balance, account.currency),
              },
              {
                label: "Aktualne saldo",
                value: formatMoney(account.balance, account.currency),
              },
              ...(account.description ? [{ label: "Opis", value: account.description }] : []),
              { label: "Utworzone", value: formatDate(account.created_at) },
              { label: "Zaktualizowane", value: formatDate(account.updated_at) },
              ...(account.archived_at
                ? [{ label: "Zarchiwizowane", value: formatDate(account.archived_at) }]
                : []),
            ]}
          />
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Szablon instrumentów</h3>

          {templates === null ? (
            <Skeleton height="4rem" />
          ) : (
            <>
              <div className={styles.templateRow}>
                <div className={styles.templateName}>
                  {assigned ? (
                    <>
                      <strong>{assigned.name}</strong>
                      <span className={styles.templateMeta}>
                        {assigned.broker_name}
                        {assigned.account_type ? ` · ${assigned.account_type}` : ""} ·{" "}
                        {assigned.instrument_count} instrumentów
                      </span>
                    </>
                  ) : (
                    <Badge variant="neutral">Brak przypisanego szablonu</Badge>
                  )}
                </div>
                {!replacing && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedTemplateId(assigned?.id ?? selectable[0]?.id ?? "");
                      setReplacing(true);
                    }}
                  >
                    <Layers size={14} aria-hidden="true" />{" "}
                    {assigned ? "Zastąp szablon" : "Przypisz szablon"}
                  </Button>
                )}
              </div>

              {!assigned && (
                <p className={styles.warning}>
                  Bez szablonu to konto pokazuje instrumenty ze wszystkich szablonów naraz, więc te
                  same symbole mogą się dublować. Przypisz szablon brokera, u którego handlujesz.
                </p>
              )}

              {replacing && (
                <div className={styles.replaceForm}>
                  <Select
                    label="Szablon dla tego konta"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    options={selectable.map((t) => ({ value: t.id, label: optionLabel(t) }))}
                    hint="Jeden szablon należy do jednego konta. Wybranie szablonu z innego konta przeniesie go tutaj, a tamto konto zostanie bez szablonu."
                  />
                  <p className={styles.note}>
                    Transakcje już zapisane zachowują zamrożone parametry instrumentów, więc zmiana
                    szablonu nigdy nie zmienia ich wyników wstecz.
                  </p>
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => setReplacing(false)} disabled={busy}>
                      Anuluj
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void handleReplace()}
                      disabled={busy || !selectedTemplateId || selectedTemplateId === assigned?.id}
                    >
                      {busy ? "Zapisywanie..." : "Zapisz szablon"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Zamknij
          </Button>
          <Button variant="primary" onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> Edytuj konto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
