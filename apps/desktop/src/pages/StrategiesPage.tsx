import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Archive, ArchiveRestore, Copy, ListChecks, Pencil, Plus } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { Strategy } from "../app/types/strategy";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Switch } from "../ui/components/Switch/Switch";
import { Tag } from "../ui/components/Tag/Tag";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { StrategyFormModal } from "./StrategyFormModal";
import styles from "./StrategiesPage.module.css";

export function StrategiesPage(): ReactElement {
  const { showToast } = useToast();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setError(null);
    try {
      const data = await invokeCommand<Strategy[]>("list_strategies", { includeArchived });
      setStrategies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // Wczytanie listy przy starcie i przy zmianie filtra jest zamierzonym efektem
    // ubocznym (synchronizacja z backendem Tauri), nie renderowaniem pochodnym stanu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads includeArchived directly, this is the intended trigger.
  }, [includeArchived]);

  function openCreateForm(): void {
    setEditingStrategy(undefined);
    setFormOpen(true);
  }

  function openEditForm(strategy: Strategy): void {
    setEditingStrategy(strategy);
    setFormOpen(true);
  }

  async function handleDuplicate(strategy: Strategy): Promise<void> {
    setBusy(true);
    try {
      await invokeCommand("duplicate_strategy", { id: strategy.id });
      showToast("Strategia zduplikowana.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(strategy: Strategy): Promise<void> {
    setBusy(true);
    try {
      await invokeCommand("archive_strategy", { id: strategy.id });
      showToast("Strategia zarchiwizowana.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(strategy: Strategy): Promise<void> {
    setBusy(true);
    try {
      await invokeCommand("restore_strategy", { id: strategy.id });
      showToast("Strategia przywrócona.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.filters}>
          <Switch
            label="Pokaż zarchiwizowane"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
        </div>
        <Button variant="primary" onClick={openCreateForm}>
          <Plus size={16} aria-hidden="true" /> Dodaj strategię
        </Button>
      </div>

      {error && (
        <ErrorState
          title="Nie udało się wczytać strategii"
          description={error}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void load();
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {!error && strategies === null && <Skeleton height="2.5rem" />}

      {!error && strategies !== null && strategies.length === 0 && (
        <EmptyState
          icon={<ListChecks size={32} aria-hidden="true" />}
          title="Brak strategii"
          description="Lista strategii startuje pusta - utwórz pierwszą, żeby móc przypisywać ją do transakcji."
          action={
            <Button variant="primary" onClick={openCreateForm}>
              Utwórz strategię
            </Button>
          }
        />
      )}

      {!error && strategies !== null && strategies.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Nazwa</th>
              <th>Tagi</th>
              <th>Status</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {strategies.map((strategy) => (
              <tr key={strategy.id}>
                <td>
                  <div className={styles.nameCell}>
                    <span
                      className={styles.colorDot}
                      style={{ backgroundColor: strategy.color ?? "transparent" }}
                      aria-hidden="true"
                    />
                    {strategy.name}
                  </div>
                </td>
                <td>
                  <div className={styles.tagsCell}>
                    {strategy.tags.length > 0
                      ? strategy.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
                      : "—"}
                  </div>
                </td>
                <td>
                  {strategy.archived_at ? (
                    <Badge variant="neutral">Zarchiwizowana</Badge>
                  ) : (
                    <Badge variant="profit">Aktywna</Badge>
                  )}
                </td>
                <td>
                  <div className={tableStyles.actions}>
                    <IconButton
                      icon={<Pencil size={16} />}
                      aria-label={`Edytuj ${strategy.name}`}
                      onClick={() => openEditForm(strategy)}
                    />
                    <IconButton
                      icon={<Copy size={16} />}
                      aria-label={`Duplikuj ${strategy.name}`}
                      loading={busy}
                      onClick={() => {
                        void handleDuplicate(strategy);
                      }}
                    />
                    {strategy.archived_at ? (
                      <IconButton
                        icon={<ArchiveRestore size={16} />}
                        aria-label={`Przywróć ${strategy.name}`}
                        loading={busy}
                        onClick={() => {
                          void handleRestore(strategy);
                        }}
                      />
                    ) : (
                      <IconButton
                        icon={<Archive size={16} />}
                        aria-label={`Archiwizuj ${strategy.name}`}
                        loading={busy}
                        onClick={() => {
                          void handleArchive(strategy);
                        }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <StrategyFormModal
        key={formOpen ? (editingStrategy?.id ?? "new") : "closed"}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          void load();
        }}
        strategy={editingStrategy}
      />
    </div>
  );
}
