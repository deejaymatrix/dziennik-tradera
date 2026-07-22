import {
  Copy,
  Layers,
  Link2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Unlink2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import type { BrokerTemplate } from "../app/types/instrument";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Modal } from "../ui/components/Modal/Modal";
import { SectionCard } from "../ui/components/SectionCard/SectionCard";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./SzablonyInstrumentowPage.module.css";

/** Etykieta pochodzenia szablonu - z importu brokera, kopia albo utworzony ręcznie. */
const SOURCE_LABEL: Record<BrokerTemplate["source"], string> = {
  broker_import: "Z importu brokera",
  duplicated: "Kopia",
  user_created: "Utworzony ręcznie",
};

interface AssignDialogState {
  template: BrokerTemplate;
}

interface CreateOrRenameDialogState {
  mode: "create" | "rename";
  target?: BrokerTemplate;
}

/**
 * Ekran "Szablony instrumentów" (B2 nowej specyfikacji). Lista wszystkich aktywnych szablonów
 * brokera z akcjami: utwórz ręcznie, duplikuj, zmień nazwę, przypisz do konta ("Zastąp szablon
 * konta"), odepnij, usuń do kosza. Import z terminala MT5 dojdzie w B3 - do tego czasu w
 * nagłówku widnieje placeholder "Importuj dane brokera (wkrótce)".
 */
export function SzablonyInstrumentowPage(): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<BrokerTemplate[] | null>(null);
  const [accounts, setAccounts] = useState<AccountWithBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<CreateOrRenameDialogState | null>(null);
  const [assign, setAssign] = useState<AssignDialogState | null>(null);

  async function load(): Promise<void> {
    setError(null);
    try {
      const [ts, accs] = await Promise.all([
        invokeCommand<BrokerTemplate[]>("list_broker_templates", { includeArchived: false }),
        invokeCommand<AccountWithBalance[]>("list_accounts", { includeArchived: false }),
      ]);
      setTemplates(ts);
      setAccounts(accs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const accountsById = useMemo(() => {
    const map = new Map<string, AccountWithBalance>();
    for (const a of accounts ?? []) {
      map.set(a.id, a);
    }
    return map;
  }, [accounts]);

  async function withBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate(template: BrokerTemplate): Promise<void> {
    const suggested = `${template.name} (kopia)`;
    const newName = window.prompt("Nazwa kopii szablonu:", suggested);
    if (!newName?.trim()) {
      return;
    }
    await withBusy(async () => {
      await invokeCommand("duplicate_broker_template", {
        id: template.id,
        newName: newName.trim(),
      });
      showToast(`Utworzono kopię "${newName.trim()}".`, "success");
      await load();
    });
  }

  async function handleUnassign(template: BrokerTemplate): Promise<void> {
    if (
      !(await confirm({
        message: `Odpiąć szablon "${template.name}" od konta? Konto zostanie bez szablonu do czasu przypisania innego - wybierz konto ponownie w widoku szczegółów konta, żeby uzupełnić.`,
        danger: false,
        confirmLabel: "Odepnij",
      }))
    ) {
      return;
    }
    await withBusy(async () => {
      await invokeCommand("unassign_broker_template", { templateId: template.id });
      showToast("Szablon odpięty od konta.", "success");
      await load();
    });
  }

  async function handleArchive(template: BrokerTemplate): Promise<void> {
    if (
      !(await confirm({
        message: `Przenieść szablon "${template.name}" do Kosza? Zawiera ${template.instrument_count} instrumentów. Historyczne transakcje zachowają zamrożone parametry.`,
        danger: true,
        confirmLabel: "Do Kosza",
      }))
    ) {
      return;
    }
    await withBusy(async () => {
      await invokeCommand("archive_broker_template", { id: template.id });
      showToast(`Szablon "${template.name}" przeniesiony do Kosza.`, "success");
      await load();
    });
  }

  if (error) {
    return (
      <div className={styles.page}>
        <ErrorState
          title="Nie udało się wczytać szablonów"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Spróbuj ponownie
            </Button>
          }
        />
      </div>
    );
  }
  if (!templates || !accounts) {
    return (
      <div className={styles.page}>
        <Skeleton height="12rem" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <SectionCard>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Szablony instrumentów</h2>
            <p className={styles.subtitle}>
              Każde konto handlowe ma dokładnie jeden aktywny szablon instrumentów. Instrumenty i
              parametry z różnych szablonów nigdy się nie mieszają.
            </p>
          </div>
          <div className={styles.headerActions}>
            {/* Import danych brokera celowo NIE jest już tutaj - odbywa się w zakładce
                "Instrumenty", w kontekście wybranego szablonu (jeden import na szablon). */}
            <Button variant="primary" onClick={() => setDialog({ mode: "create" })} disabled={busy}>
              <Plus size={16} /> Dodaj szablon
            </Button>
          </div>
        </div>

        {templates.length === 0 ? (
          <EmptyState
            icon={<Layers size={32} />}
            title="Brak szablonów"
            description="Aplikacja zawsze powinna mieć co najmniej jeden szablon. Migracja startowa tworzy 'QuoMarkets RAW' - jeśli go nie widzisz, zgłoś to jako błąd."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Broker</th>
                <th>Typ</th>
                <th>Pochodzenie</th>
                <th className={tableStyles.numeric}>Instrumenty</th>
                <th>Przypisane konto</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const account = template.account_id
                  ? (accountsById.get(template.account_id) ?? null)
                  : null;
                return (
                  <tr key={template.id}>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{template.name}</span>
                    </td>
                    <td>{template.broker_name}</td>
                    <td>{template.account_type ?? "—"}</td>
                    <td>
                      <Badge variant="neutral">{SOURCE_LABEL[template.source]}</Badge>
                    </td>
                    <td className={tableStyles.numeric}>{template.instrument_count}</td>
                    <td>
                      {account ? (
                        <Badge variant="info">
                          {account.name} ({account.currency})
                        </Badge>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <IconButton
                          icon={<SlidersHorizontal size={14} />}
                          aria-label={`Edytuj instrumenty: ${template.name}`}
                          onClick={() => {
                            void navigate(
                              `/instrumenty?template=${encodeURIComponent(template.id)}`,
                            );
                          }}
                          disabled={busy}
                        />
                        <IconButton
                          icon={<Pencil size={14} />}
                          aria-label={`Zmień nazwę: ${template.name}`}
                          onClick={() => setDialog({ mode: "rename", target: template })}
                          disabled={busy}
                        />
                        <IconButton
                          icon={<Copy size={14} />}
                          aria-label={`Duplikuj: ${template.name}`}
                          onClick={() => void handleDuplicate(template)}
                          disabled={busy}
                        />
                        <IconButton
                          icon={<Link2 size={14} />}
                          aria-label={`Przypisz do konta: ${template.name}`}
                          onClick={() => setAssign({ template })}
                          disabled={busy || accounts.length === 0}
                        />
                        {template.account_id && (
                          <IconButton
                            icon={<Unlink2 size={14} />}
                            aria-label={`Odepnij: ${template.name}`}
                            onClick={() => void handleUnassign(template)}
                            disabled={busy}
                          />
                        )}
                        <IconButton
                          icon={<Trash2 size={14} />}
                          aria-label={`Do Kosza: ${template.name}`}
                          onClick={() => void handleArchive(template)}
                          disabled={busy}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {dialog && (
        <TemplateFormModal
          state={dialog}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await load();
          }}
        />
      )}
      {assign && (
        <AssignAccountModal
          template={assign.template}
          accounts={accounts}
          onClose={() => setAssign(null)}
          onSaved={async () => {
            setAssign(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

interface TemplateFormModalProps {
  state: CreateOrRenameDialogState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function TemplateFormModal({ state, onClose, onSaved }: TemplateFormModalProps): ReactElement {
  const { showToast } = useToast();
  const [name, setName] = useState(state.target?.name ?? "");
  const [broker, setBroker] = useState(state.target?.broker_name ?? "");
  const [accountType, setAccountType] = useState(state.target?.account_type ?? "");
  const [saving, setSaving] = useState(false);

  const title = state.mode === "create" ? "Nowy szablon" : `Zmień nazwę: ${state.target?.name}`;

  async function handleSave(): Promise<void> {
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    try {
      if (state.mode === "create") {
        await invokeCommand("create_broker_template", {
          input: {
            name: name.trim(),
            broker_name: broker.trim() || name.trim(),
            account_type: accountType.trim() || null,
          },
        });
        showToast(`Utworzono szablon "${name.trim()}".`, "success");
      } else if (state.target) {
        await invokeCommand("rename_broker_template", {
          id: state.target.id,
          name: name.trim(),
        });
        showToast("Nazwa zaktualizowana.", "success");
      }
      await onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className={styles.form}>
        <TextField
          label="Nazwa szablonu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
        {state.mode === "create" && (
          <>
            <TextField
              label="Nazwa brokera"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              hint="Np. QuoMarkets, IC Markets, Pepperstone."
            />
            <TextField
              label="Typ konta (opcjonalnie)"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              hint="Np. RAW, Standard, ECN."
            />
          </>
        )}
        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
          >
            {saving ? "Zapisywanie..." : state.mode === "create" ? "Utwórz" : "Zapisz"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface AssignAccountModalProps {
  template: BrokerTemplate;
  accounts: AccountWithBalance[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function AssignAccountModal({
  template,
  accounts,
  onClose,
  onSaved,
}: AssignAccountModalProps): ReactElement {
  const { showToast } = useToast();
  const [selected, setSelected] = useState(template.account_id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleAssign(): Promise<void> {
    if (!selected) {
      return;
    }
    setSaving(true);
    try {
      await invokeCommand("assign_broker_template", {
        templateId: template.id,
        accountId: selected,
      });
      showToast(
        `Szablon "${template.name}" przypisany do konta - dotychczasowy szablon tego konta został odpięty.`,
        "success",
      );
      await onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Przypisz szablon do konta: ${template.name}`}>
      <div className={styles.form}>
        <p className={styles.note}>
          Wybrane konto dostanie ten szablon jako aktywny. Poprzedni szablon tego konta zostanie
          bezpiecznie odpięty (nie usunięty - można go później przypisać ponownie albo do innego
          konta).
        </p>
        <Select
          label="Konto"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          options={[
            { value: "", label: "— wybierz konto —" },
            ...accounts.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.currency})`,
            })),
          ]}
        />
        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleAssign()}
            disabled={saving || !selected}
          >
            {saving ? "Przypisywanie..." : "Przypisz"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
