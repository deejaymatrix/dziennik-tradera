import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Pencil, Plus, PowerOff, Power, SlidersHorizontal } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { Instrument } from "../app/types/instrument";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { Switch } from "../ui/components/Switch/Switch";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { InstrumentFormModal } from "./InstrumentFormModal";
import styles from "./InstrumentsPage.module.css";

export function InstrumentsPage(): ReactElement {
  const { showToast } = useToast();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | undefined>(undefined);

  async function load(): Promise<void> {
    setError(null);
    try {
      const data = await invokeCommand<Instrument[]>("list_instruments", { includeInactive });
      setInstruments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // Wczytanie listy przy starcie i przy zmianie filtra jest zamierzonym efektem
    // ubocznym (synchronizacja z backendem Tauri), nie renderowaniem pochodnym stanu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads includeInactive directly, this is the intended trigger.
  }, [includeInactive]);

  function openCreateForm(): void {
    setEditingInstrument(undefined);
    setFormOpen(true);
  }

  function openEditForm(instrument: Instrument): void {
    setEditingInstrument(instrument);
    setFormOpen(true);
  }

  async function handleDeactivate(instrument: Instrument): Promise<void> {
    try {
      await invokeCommand("deactivate_instrument", { id: instrument.id });
      showToast("Instrument dezaktywowany.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleActivate(instrument: Instrument): Promise<void> {
    try {
      await invokeCommand("activate_instrument", { id: instrument.id });
      showToast("Instrument aktywowany.", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.filters}>
          <Switch
            label="Pokaż nieaktywne"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
        </div>
        <Button variant="primary" onClick={openCreateForm}>
          <Plus size={16} aria-hidden="true" /> Dodaj instrument
        </Button>
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
          title="Brak instrumentów"
          description="Dodaj własny instrument albo włącz podgląd nieaktywnych z biblioteki startowej."
          action={
            <Button variant="primary" onClick={openCreateForm}>
              Dodaj instrument
            </Button>
          }
        />
      )}

      {!error && instruments !== null && instruments.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Nazwa</th>
              <th>Kategoria</th>
              <th>Waluta</th>
              <th>Status</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {instruments.map((instrument) => (
              <tr key={instrument.id}>
                <td>{instrument.symbol}</td>
                <td>{instrument.name}</td>
                <td>{instrument.category ?? "—"}</td>
                <td>{instrument.quote_currency}</td>
                <td>
                  {instrument.is_active ? (
                    <Badge variant="profit">Aktywny</Badge>
                  ) : (
                    <Badge variant="neutral">Nieaktywny</Badge>
                  )}
                </td>
                <td>
                  <div className={tableStyles.actions}>
                    <IconButton
                      icon={<Pencil size={16} />}
                      aria-label={`Edytuj ${instrument.symbol}`}
                      onClick={() => openEditForm(instrument)}
                    />
                    {instrument.is_active ? (
                      <IconButton
                        icon={<PowerOff size={16} />}
                        aria-label={`Dezaktywuj ${instrument.symbol}`}
                        onClick={() => {
                          void handleDeactivate(instrument);
                        }}
                      />
                    ) : (
                      <IconButton
                        icon={<Power size={16} />}
                        aria-label={`Aktywuj ${instrument.symbol}`}
                        onClick={() => {
                          void handleActivate(instrument);
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

      <InstrumentFormModal
        key={formOpen ? (editingInstrument?.id ?? "new") : "closed"}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          void load();
        }}
        instrument={editingInstrument}
      />
    </div>
  );
}
