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
  const [replacing, setReplacing] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadTemplates(): Promise<void> {
    try {
      const list = await invokeCommand<BrokerTemplate[]>("list_broker_templates", {
        includeArchived: false,
      });
      setTemplates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się wczytać szablonów.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTemplates();
  }, []);

  const assigned = templates?.find((t) => t.id === account.template_id) ?? null;
  // Do wyboru KAŻDY aktywny szablon - jeden szablon obsługuje wiele kont (np. kilka rachunków
  // u tego samego brokera na wspólnym katalogu instrumentów).
  const selectable = templates ?? [];

  function optionLabel(t: BrokerTemplate): string {
    const base = `${t.name} (${t.instrument_count} instrumentów)`;
    return t.account_count > 0 ? `${base} — używany przez ${t.account_count} kont(a)` : base;
  }

  async function handleReplace(): Promise<void> {
    const target = templates?.find((t) => t.id === selectedTemplateId);
    if (!target) {
      return;
    }
    const message =
      `Przypisać szablon „${target.name}" (${target.instrument_count} instrumentów) do konta "${account.name}"?\n\n` +
      "TEGO NIE DA SIĘ COFNĄĆ. Konto zostaje z tym szablonem na stałe - jeżeli powiązanie okaże się błędne, jedynym wyjściem jest usunięcie całego konta.";

    if (!(await confirm({ message, confirmLabel: "Przypisz na stałe", danger: true }))) {
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
                {/* Przypisać można TYLKO konto, które szablonu jeszcze nie ma - powiązanie jest
                    nieodwracalne, więc nie ma tu przycisku "zmień". */}
                {!assigned && !replacing && selectable.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedTemplateId(selectable[0]?.id ?? "");
                      setReplacing(true);
                    }}
                  >
                    <Layers size={14} aria-hidden="true" /> Przypisz szablon
                  </Button>
                )}
              </div>

              {assigned ? (
                <p className={styles.note}>
                  Powiązanie konta z szablonem jest trwałe - transakcje tego konta odnoszą się do
                  instrumentów z tego szablonu, więc podmiana pod istniejącą historią nie jest
                  możliwa. Zmiana wymaga usunięcia konta.
                </p>
              ) : (
                <p className={styles.warning}>
                  Bez szablonu to konto pokazuje instrumenty ze wszystkich szablonów naraz, więc te
                  same symbole mogą się dublować. Przypisz szablon brokera, u którego handlujesz.
                  {selectable.length === 0 &&
                    " Nie ma jeszcze żadnego szablonu - zaimportuj dane brokera w zakładce Instrumenty."}
                </p>
              )}

              {replacing && (
                <div className={styles.replaceForm}>
                  <Select
                    label="Szablon dla tego konta"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    options={selectable.map((t) => ({ value: t.id, label: optionLabel(t) }))}
                    hint="Jeden szablon może obsługiwać wiele kont - jeżeli masz kilka rachunków u tego samego brokera, wskaż im ten sam szablon."
                  />
                  <p className={styles.warning}>
                    Przypisania NIE DA SIĘ cofnąć ani zmienić. Jeżeli okaże się błędne, jedynym
                    wyjściem jest usunięcie całego konta.
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
