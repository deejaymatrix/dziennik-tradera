import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { RotateCcw, Search, Trash, Trash2 } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { EmptyTrashResult, TrashEntityType, TrashItem } from "../app/types/trash";
import { TRASH_ENTITY_LABELS } from "../app/types/trash";
import { Badge } from "../ui/components/Badge/Badge";
import type { BadgeVariant } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./KoszPage.module.css";

const TYPE_BADGE_VARIANT: Record<TrashEntityType, BadgeVariant> = {
  account: "info",
  trade: "warning",
  strategy: "accent",
  interval: "neutral",
  trading_rule: "profit",
};

const TYPE_FILTER_OPTIONS: { value: TrashEntityType | ""; label: string }[] = [
  { value: "", label: "Wszystkie typy" },
  { value: "account", label: "Konta" },
  { value: "trade", label: "Transakcje" },
  { value: "strategy", label: "Strategie" },
  { value: "interval", label: "Interwały" },
  { value: "trading_rule", label: "Pytania (Zasady handlu)" },
];

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function itemKey(item: Pick<TrashItem, "entity_type" | "id">): string {
  return `${item.entity_type}:${item.id}`;
}

/**
 * Uniwersalny Kosz (Faza 5) - agreguje to, co już archiwizują/miękko usuwają istniejące ekrany
 * (konta, transakcje, strategie, własne interwały) w jedną listę z Przywróć/Usuń trwale
 * (pojedynczo i zbiorczo) oraz "Opróżnij kosz" (automatyczna kopia zapasowa przed czyszczeniem -
 * patrz `TrashService::empty` w backendzie). Świadomie poza zakresem: własne instrumenty (mają
 * już bezpieczne, natychmiastowe usuwanie blokowane dla używanych) i pojedyncze elementy zasad
 * strategii (zagnieżdżone pola bez własnej sygnatury czasowej, zarządzane na ekranie strategii).
 */
export function KoszPage(): ReactElement {
  const { showToast } = useToast();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TrashEntityType | "">("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setError(null);
    try {
      const data = await invokeCommand<TrashItem[]>("list_trash_items", {});
      setItems(data);
      setSelectedKeys(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) {
      return [];
    }
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter && item.entity_type !== typeFilter) {
        return false;
      }
      if (needle && !item.label.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [items, search, typeFilter]);

  function toggleSelected(item: TrashItem): void {
    const key = itemKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllFiltered(): void {
    setSelectedKeys((current) => {
      const allSelected =
        filtered.length > 0 && filtered.every((item) => current.has(itemKey(item)));
      const next = new Set(current);
      for (const item of filtered) {
        const key = itemKey(item);
        if (allSelected) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  }

  async function handleRestore(item: TrashItem): Promise<void> {
    setBusy(true);
    try {
      await invokeCommand("restore_trash_item", { entityType: item.entity_type, id: item.id });
      showToast(`Przywrócono: ${item.label}.`, "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge(item: TrashItem): Promise<void> {
    if (!window.confirm(`Trwale usunąć "${item.label}"? Tej operacji nie można cofnąć.`)) {
      return;
    }
    setBusy(true);
    try {
      await invokeCommand("purge_trash_item", { entityType: item.entity_type, id: item.id });
      showToast(`Trwale usunięto: ${item.label}.`, "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkRestore(): Promise<void> {
    const selected = (items ?? []).filter((item) => selectedKeys.has(itemKey(item)));
    if (selected.length === 0) {
      return;
    }
    setBusy(true);
    try {
      for (const item of selected) {
        await invokeCommand("restore_trash_item", { entityType: item.entity_type, id: item.id });
      }
      showToast(`Przywrócono ${selected.length} elementów.`, "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkPurge(): Promise<void> {
    const selected = (items ?? []).filter((item) => selectedKeys.has(itemKey(item)));
    if (selected.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Trwale usunąć ${selected.length} zaznaczonych elementów? Tej operacji nie można cofnąć.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      let purged = 0;
      const failures: string[] = [];
      for (const item of selected) {
        try {
          await invokeCommand("purge_trash_item", { entityType: item.entity_type, id: item.id });
          purged += 1;
        } catch (e) {
          failures.push(`${item.label}: ${e instanceof Error ? e.message : "błąd"}`);
        }
      }
      if (failures.length === 0) {
        showToast(`Trwale usunięto ${purged} elementów.`, "success");
      } else {
        showToast(
          `Usunięto ${purged} z ${selected.length}. Nie udało się: ${failures.join("; ")}`,
          "error",
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleEmptyTrash(): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Opróżnić cały Kosz? Trwale usunie to wszystkie ${items.length} elementów (po automatycznej kopii zapasowej). Tej operacji nie można cofnąć.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await invokeCommand<EmptyTrashResult>("empty_trash", {});
      if (result.failed.length === 0) {
        showToast(`Kosz opróżniony - usunięto trwale ${result.purged} elementów.`, "success");
      } else {
        showToast(
          `Usunięto ${result.purged} elementów. Nie udało się usunąć ${result.failed.length}: ${result.failed
            .map((f) => `${f.label} (${f.message})`)
            .join("; ")}`,
          "error",
        );
      }
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
          <TextField
            label="Szukaj"
            icon={<Search size={16} />}
            placeholder="Nazwa..."
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Typ"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TrashEntityType | "")}
            options={TYPE_FILTER_OPTIONS}
          />
        </div>
        <Button
          variant="danger"
          disabled={busy || !items || items.length === 0}
          onClick={() => {
            void handleEmptyTrash();
          }}
        >
          <Trash2 size={16} aria-hidden="true" /> Opróżnij kosz
        </Button>
      </div>

      {error && (
        <ErrorState
          title="Nie udało się wczytać Kosza"
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

      {!error && items === null && <Skeleton height="2.5rem" />}

      {!error && items !== null && items.length === 0 && (
        <EmptyState
          icon={<Trash size={32} aria-hidden="true" />}
          title="Kosz jest pusty"
          description="Zarchiwizowane konta, usunięte transakcje, zarchiwizowane strategie i interwały pojawią się tutaj."
        />
      )}

      {!error && items !== null && items.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<Search size={32} aria-hidden="true" />}
          title="Brak elementów spełniających filtr"
          description="Zmień wyszukiwanie albo typ, żeby zobaczyć więcej elementów kosza."
        />
      )}

      {!error && filtered.length > 0 && (
        <>
          {selectedKeys.size > 0 && (
            <div className={styles.bulkBar}>
              <span>Zaznaczono: {selectedKeys.size}</span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void handleBulkRestore();
                }}
              >
                Przywróć zaznaczone
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  void handleBulkPurge();
                }}
              >
                Usuń trwale zaznaczone
              </Button>
            </div>
          )}

          <Table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Zaznacz wszystkie widoczne"
                    checked={filtered.every((item) => selectedKeys.has(itemKey(item)))}
                    onChange={toggleAllFiltered}
                  />
                </th>
                <th>Typ</th>
                <th>Nazwa</th>
                <th>Usunięto</th>
                <th>Zależności</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={itemKey(item)}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Zaznacz ${item.label}`}
                      checked={selectedKeys.has(itemKey(item))}
                      onChange={() => toggleSelected(item)}
                    />
                  </td>
                  <td>
                    <Badge variant={TYPE_BADGE_VARIANT[item.entity_type]}>
                      {TRASH_ENTITY_LABELS[item.entity_type]}
                    </Badge>
                  </td>
                  <td>{item.label}</td>
                  <td>{formatDateTime(item.deleted_at)}</td>
                  <td className={styles.dependencyCell}>{item.dependency_note ?? "—"}</td>
                  <td>
                    <div className={tableStyles.actions}>
                      <IconButton
                        icon={<RotateCcw size={16} />}
                        aria-label={`Przywróć ${item.label}`}
                        disabled={busy}
                        onClick={() => {
                          void handleRestore(item);
                        }}
                      />
                      <IconButton
                        icon={<Trash2 size={16} />}
                        aria-label={`Usuń trwale ${item.label}`}
                        disabled={busy}
                        onClick={() => {
                          void handlePurge(item);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
