import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Layers,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import {
  INSTRUMENT_CATEGORIES,
  type BrokerTemplate,
  type InstrumentListFilter,
  type InstrumentVisibilityFilter,
  type InstrumentWithDetails,
} from "../app/types/instrument";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Select } from "../ui/components/Select/Select";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { TextField } from "../ui/components/TextField/TextField";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { ImportBrokerModal } from "./ImportBrokerModal";
import { InstrumentFormModal } from "./InstrumentFormModal";
import { NewTemplateModal } from "./NewTemplateModal";
import styles from "./InstrumentsPage.module.css";

const PAGE_SIZE = 25;

const VISIBILITY_OPTIONS: { value: InstrumentVisibilityFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "visible", label: "Widoczne" },
  { value: "hidden", label: "Ukryte" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Wszystkie kategorie" },
  ...INSTRUMENT_CATEGORIES.map((c) => ({ value: c, label: c })),
];

function symbolLabel(instrument: InstrumentWithDetails): ReactElement {
  const isMini = instrument.display_symbol.endsWith("-MINI");
  return (
    <span className={styles.symbolCell}>
      {instrument.display_symbol}
      {isMini && <Badge variant="neutral">MINI</Badge>}
    </span>
  );
}

export function InstrumentsPage(): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<InstrumentVisibilityFilter>("all");
  const [origin, setOrigin] = useState<"all" | "user">("all");
  const [page, setPage] = useState(0);

  // Kontekst szablonu (B1/B2): instrumenty edytuje się zawsze w obrębie jednego szablonu.
  // Startowy szablon bierzemy z parametru URL (wejście z ekranu "Szablony instrumentów" przez
  // "Edytuj instrumenty"), a jak go brak - pierwszy aktywny szablon.
  const [templates, setTemplates] = useState<BrokerTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState<string>("");

  const [instruments, setInstruments] = useState<InstrumentWithDetails[] | null>(null);
  const [visibleOrder, setVisibleOrder] = useState<InstrumentWithDetails[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<InstrumentWithDetails | undefined>(
    undefined,
  );
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );
  /** Jeden import danych brokera na szablon - szablon z importu jest już "zajęty". */
  const alreadyImported = selectedTemplate?.source === "broker_import";

  const filter: InstrumentListFilter = useMemo(
    () => ({
      search: search.trim() ? search.trim() : null,
      category: category ? category : null,
      visibility,
      template_id: templateId || null,
      user_created_only: origin === "user",
    }),
    [search, category, visibility, templateId, origin],
  );

  // Jednorazowe wczytanie listy szablonów + ustalenie startowego (z URL albo pierwszy aktywny).
  useEffect(() => {
    void (async () => {
      try {
        const ts = await invokeCommand<BrokerTemplate[]>("list_broker_templates", {
          includeArchived: false,
        });
        setTemplates(ts);
        const fromUrl = searchParams.get("template");
        const initial = fromUrl && ts.some((t) => t.id === fromUrl) ? fromUrl : (ts[0]?.id ?? "");
        setTemplateId((current) => current || initial);
      } catch {
        // Główny `load` obsłuży i pokaże błąd - tu tylko brak pickera szablonów.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowo przy montowaniu.
  }, []);

  /** Odświeża listę szablonów (po utworzeniu nowego albo po imporcie zmieniającym licznik). */
  async function reloadTemplates(selectId?: string): Promise<void> {
    const ts = await invokeCommand<BrokerTemplate[]>("list_broker_templates", {
      includeArchived: false,
    });
    setTemplates(ts);
    if (selectId) {
      setTemplateId(selectId);
    }
  }

  async function load(): Promise<void> {
    setError(null);
    try {
      const [all, visible] = await Promise.all([
        invokeCommand<InstrumentWithDetails[]>("list_instruments", { filter }),
        invokeCommand<InstrumentWithDetails[]>("list_instruments", {
          filter: {
            search: null,
            category: null,
            visibility: "visible",
            template_id: templateId || null,
          } satisfies InstrumentListFilter,
        }),
      ]);
      setInstruments(all);
      setVisibleOrder(visible);
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load czyta filter bezpośrednio, to jest zamierzony trigger.
  }, [filter]);

  const pageCount = instruments ? Math.max(1, Math.ceil(instruments.length / PAGE_SIZE)) : 1;
  const pageItems = instruments ? instruments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  function openCreateForm(): void {
    setEditingInstrument(undefined);
    setFormOpen(true);
  }

  function openEditForm(instrument: InstrumentWithDetails): void {
    setEditingInstrument(instrument);
    setFormOpen(true);
  }

  function toggleSelected(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function togglePageSelection(): void {
    setSelectedIds((current) => {
      const allSelected = pageItems.every((i) => current.has(i.id));
      const next = new Set(current);
      for (const item of pageItems) {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  }

  async function handleBulkVisibility(isVisible: boolean): Promise<void> {
    try {
      await invokeCommand("set_instruments_visibility_bulk", {
        ids: [...selectedIds],
        isVisible,
      });
      showToast(
        isVisible ? "Zaznaczone instrumenty pokazane." : "Zaznaczone instrumenty ukryte.",
        "success",
      );
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleToggleVisibility(instrument: InstrumentWithDetails): Promise<void> {
    try {
      await invokeCommand("set_instrument_visibility", {
        id: instrument.id,
        isVisible: !instrument.is_visible,
      });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleResetDefaultVisibility(): Promise<void> {
    try {
      await invokeCommand("reset_instrument_visibility_to_default");
      showToast("Przywrócono domyślną widoczność sześciu instrumentów.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleDelete(instrument: InstrumentWithDetails): Promise<void> {
    if (
      !(await confirm({
        message: `Trwale usunąć instrument ${instrument.display_symbol}? Tej operacji nie można cofnąć. Nie uda się, jeśli instrument jest już użyty w jakiejś transakcji.`,
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await invokeCommand("delete_instrument", { id: instrument.id });
      showToast(`Instrument ${instrument.display_symbol} usunięty.`, "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleMoveVisible(index: number, direction: -1 | 1): Promise<void> {
    if (!visibleOrder) return;
    const target = index + direction;
    if (target < 0 || target >= visibleOrder.length) return;
    const reordered = [...visibleOrder];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    try {
      await invokeCommand("reorder_instruments", { orderedIds: reordered.map((i) => i.id) });
      setVisibleOrder(reordered);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.filters}>
          {templates && (
            <div className={styles.templateField}>
              <Select
                label="Szablon"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                options={templates.map((t) => ({
                  value: t.id,
                  label: `${t.name} (${t.instrument_count})`,
                }))}
              />
              <div className={styles.templateActions}>
                <Button variant="ghost" size="sm" onClick={() => setNewTemplateOpen(true)}>
                  <Plus size={14} aria-hidden="true" /> Nowy szablon
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setImportOpen(true)}
                  disabled={!selectedTemplate || alreadyImported}
                  title={
                    alreadyImported
                      ? "Ten szablon ma już zaimportowane dane brokera - jeden import na szablon."
                      : undefined
                  }
                >
                  <Upload size={14} aria-hidden="true" /> Importuj dane brokera
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate("/szablony-instrumentow")}
                >
                  <Layers size={14} aria-hidden="true" /> Zarządzaj szablonami
                </Button>
              </div>
            </div>
          )}
          <TextField
            label="Szukaj"
            icon={<Search size={16} />}
            placeholder="Symbol, opis, kategoria, symbol techniczny..."
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Kategoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={CATEGORY_OPTIONS}
          />
          <Select
            label="Widoczność"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as InstrumentVisibilityFilter)}
            options={VISIBILITY_OPTIONS}
          />
          <Select
            label="Pochodzenie"
            value={origin}
            onChange={(e) => setOrigin(e.target.value as "all" | "user")}
            options={[
              { value: "all", label: "Wszystkie" },
              { value: "user", label: "Dodane przez użytkownika" },
            ]}
          />
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => void handleResetDefaultVisibility()}>
            <RotateCcw size={16} aria-hidden="true" /> Domyślna widoczność
          </Button>
          <Button variant="primary" onClick={openCreateForm}>
            <Plus size={16} aria-hidden="true" /> Dodaj instrument
          </Button>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Nie udało się wczytać instrumentów"
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

      {!error && instruments === null && <Skeleton height="2.5rem" />}

      {!error && instruments !== null && instruments.length === 0 && (
        <EmptyState
          icon={<SlidersHorizontal size={32} aria-hidden="true" />}
          title="Brak instrumentów spełniających filtr"
          description="Zmień wyszukiwanie, kategorię albo widoczność, żeby zobaczyć więcej instrumentów."
        />
      )}

      {!error && instruments !== null && instruments.length > 0 && (
        <>
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span>Zaznaczono: {selectedIds.size}</span>
              <Button variant="secondary" onClick={() => void handleBulkVisibility(true)}>
                Pokaż zaznaczone
              </Button>
              <Button variant="secondary" onClick={() => void handleBulkVisibility(false)}>
                Ukryj zaznaczone
              </Button>
            </div>
          )}

          <p className={styles.counter}>
            Widocznych łącznie: {instruments.filter((i) => i.is_visible).length} z{" "}
            {instruments.length} pasujących do filtra
          </p>

          <Table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Zaznacz wszystkie na tej stronie"
                    checked={pageItems.length > 0 && pageItems.every((i) => selectedIds.has(i.id))}
                    onChange={togglePageSelection}
                  />
                </th>
                <th>Symbol</th>
                <th>Opis</th>
                <th>Kategoria</th>
                <th>Widoczność</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((instrument) => (
                <tr key={instrument.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Zaznacz ${instrument.display_symbol}`}
                      checked={selectedIds.has(instrument.id)}
                      onChange={() => toggleSelected(instrument.id)}
                    />
                  </td>
                  <td>{symbolLabel(instrument)}</td>
                  <td>
                    <div>{instrument.description}</div>
                    <div className={styles.technicalSymbol}>{instrument.source_symbol}</div>
                  </td>
                  <td>{instrument.category}</td>
                  <td>
                    {instrument.is_visible ? (
                      <Badge variant="profit">Widoczny</Badge>
                    ) : (
                      <Badge variant="neutral">Ukryty</Badge>
                    )}
                  </td>
                  <td>
                    <div className={tableStyles.actions}>
                      <IconButton
                        icon={instrument.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}
                        aria-label={
                          instrument.is_visible
                            ? `Ukryj ${instrument.display_symbol}`
                            : `Pokaż ${instrument.display_symbol}`
                        }
                        onClick={() => {
                          void handleToggleVisibility(instrument);
                        }}
                      />
                      <IconButton
                        icon={<Pencil size={16} />}
                        aria-label={`Edytuj ${instrument.display_symbol}`}
                        onClick={() => openEditForm(instrument)}
                      />
                      {instrument.factory_index === null && (
                        <IconButton
                          icon={<Trash2 size={16} />}
                          aria-label={`Usuń ${instrument.display_symbol}`}
                          onClick={() => {
                            void handleDelete(instrument);
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className={styles.pagination}>
            <Button
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Poprzednia
            </Button>
            <span>
              Strona {page + 1} z {pageCount}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Następna
            </Button>
          </div>
        </>
      )}

      {visibleOrder && visibleOrder.length > 0 && (
        <section className={styles.orderSection} aria-labelledby="instrument-order-heading">
          <h2 id="instrument-order-heading" className={styles.orderHeading}>
            Kolejność widocznych instrumentów
          </h2>
          <ul className={styles.orderList}>
            {visibleOrder.map((instrument, index) => (
              <li key={instrument.id} className={styles.orderItem}>
                <span>{instrument.display_symbol}</span>
                <div className={tableStyles.actions}>
                  <IconButton
                    icon={<ArrowUp size={16} />}
                    aria-label={`Przesuń ${instrument.display_symbol} wyżej`}
                    disabled={index === 0}
                    onClick={() => {
                      void handleMoveVisible(index, -1);
                    }}
                  />
                  <IconButton
                    icon={<ArrowDown size={16} />}
                    aria-label={`Przesuń ${instrument.display_symbol} niżej`}
                    disabled={index === visibleOrder.length - 1}
                    onClick={() => {
                      void handleMoveVisible(index, 1);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InstrumentFormModal
        key={formOpen ? (editingInstrument?.id ?? "new") : "closed"}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          void load();
        }}
        instrument={editingInstrument}
        templateId={templateId || null}
      />

      {newTemplateOpen && (
        <NewTemplateModal
          onClose={() => setNewTemplateOpen(false)}
          onCreated={async (template) => {
            setNewTemplateOpen(false);
            await reloadTemplates(template.id);
          }}
        />
      )}

      {importOpen && selectedTemplate && (
        <ImportBrokerModal
          template={selectedTemplate}
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            setImportOpen(false);
            await reloadTemplates();
            await load();
          }}
        />
      )}
    </div>
  );
}
