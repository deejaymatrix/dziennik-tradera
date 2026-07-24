import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Pencil,
  X,
} from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { Interval } from "../app/types/interval";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./EmotionalStatesSection.module.css";
import settingsStyles from "./SettingsPage.module.css";

/** Zarządzanie listą interwałów używanych na transakcji (Faza 4) - ten sam wzorzec co
 * `EmotionalStatesSection`, rozszerzony o przemianowanie i archiwizację (tylko własne interwały)
 * oraz reorder (wszystkie, wbudowane też). Wbudowane interwały można wyłącznie ukryć. */
export function IntervalsSection(): ReactElement {
  const { showToast } = useToast();
  const [intervals, setIntervals] = useState<Interval[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function load(): Promise<void> {
    try {
      const data = await invokeCommand<Interval[]>("list_intervals", {
        includeHidden: true,
        includeArchived: true,
      });
      setIntervals(data);
      setLoadError(null);
    } catch (e) {
      // Sam toast nie wystarczy: znika po chwili, a lista zostawała na `null`, przez co
      // szkielet ładowania kręcił się w nieskończoność i wyglądał jak zawieszona aplikacja.
      const komunikat = e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.";
      setLoadError(komunikat);
      showToast(komunikat, "error");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowe wczytanie przy montowaniu.
  }, []);

  async function handleToggleHidden(interval: Interval): Promise<void> {
    try {
      await invokeCommand("set_interval_hidden", { id: interval.id, hidden: !interval.hidden });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleArchive(interval: Interval): Promise<void> {
    try {
      await invokeCommand("archive_interval", { id: interval.id });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleRestore(interval: Interval): Promise<void> {
    try {
      await invokeCommand("restore_interval", { id: interval.id });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  function handleStartRename(interval: Interval): void {
    setRenamingId(interval.id);
    setRenameValue(interval.label);
  }

  async function handleConfirmRename(): Promise<void> {
    if (!renamingId || !renameValue.trim()) {
      return;
    }
    try {
      await invokeCommand("update_interval_label", { id: renamingId, label: renameValue.trim() });
      setRenamingId(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleMove(index: number, direction: -1 | 1): Promise<void> {
    if (!intervals) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= intervals.length) {
      return;
    }
    const next = [...intervals];
    const [item] = next.splice(index, 1);
    if (item !== undefined) {
      next.splice(target, 0, item);
    }
    try {
      await invokeCommand("reorder_intervals", { orderedIds: next.map((i) => i.id) });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleAdd(): Promise<void> {
    if (!newLabel.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await invokeCommand("create_interval", { input: { label: newLabel.trim() } });
      setNewLabel("");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // Enter zatwierdza dodanie interwału zamiast nie robić nic - ta sama konwencja co przy
  // dodawaniu interwału bezpośrednio z formularza transakcji (TradeFormModal).
  function handleNewLabelKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAdd();
    }
  }

  return (
    <section className={settingsStyles.section} aria-labelledby="settings-intervals">
      <h2 id="settings-intervals" className={settingsStyles.sectionTitle}>
        Interwały
      </h2>
      <p className={settingsStyles.placeholderNote}>
        Lista interwałów dostępnych do wyboru na transakcji. Wbudowane interwały można ukryć, własne
        można też przemianować i zarchiwizować.
      </p>

      {loadError !== null && (
        <ErrorState
          title="Nie udało się wczytać interwałów"
          description={loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {intervals === null && loadError === null && <Skeleton height="2rem" />}

      {intervals !== null && intervals.length === 0 && (
        <EmptyState
          title="Brak interwałów"
          description="Dodaj pierwszy interwał polem powyżej - pojawi się na liście wyboru w formularzu transakcji."
        />
      )}

      {intervals !== null && (
        <ul className={styles.list}>
          {intervals.map((interval, index) => (
            <li key={interval.id} className={styles.item}>
              {renamingId === interval.id ? (
                <>
                  <TextField
                    label="Etykieta"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className={styles.name}
                  />
                  <div className={styles.actions}>
                    <IconButton
                      icon={<Check size={16} />}
                      aria-label="Zapisz nazwę"
                      onClick={() => {
                        void handleConfirmRename();
                      }}
                    />
                    <IconButton
                      icon={<X size={16} />}
                      aria-label="Anuluj zmianę nazwy"
                      onClick={() => setRenamingId(null)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <span
                    className={[
                      styles.name,
                      (interval.hidden || interval.archived_at) && styles.hiddenName,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {interval.label}
                  </span>
                  <div className={styles.actions}>
                    {interval.is_builtin && <Badge variant="neutral">wbudowany</Badge>}
                    {interval.archived_at && <Badge variant="neutral">zarchiwizowany</Badge>}
                    <IconButton
                      icon={<ArrowUp size={16} />}
                      aria-label={`Przesuń w górę: ${interval.label}`}
                      disabled={index === 0}
                      onClick={() => {
                        void handleMove(index, -1);
                      }}
                    />
                    <IconButton
                      icon={<ArrowDown size={16} />}
                      aria-label={`Przesuń w dół: ${interval.label}`}
                      disabled={index === intervals.length - 1}
                      onClick={() => {
                        void handleMove(index, 1);
                      }}
                    />
                    <IconButton
                      icon={interval.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                      aria-label={
                        interval.hidden ? `Pokaż ${interval.label}` : `Ukryj ${interval.label}`
                      }
                      onClick={() => {
                        void handleToggleHidden(interval);
                      }}
                    />
                    {!interval.is_builtin && (
                      <>
                        <IconButton
                          icon={<Pencil size={16} />}
                          aria-label={`Zmień nazwę: ${interval.label}`}
                          onClick={() => handleStartRename(interval)}
                        />
                        {interval.archived_at ? (
                          <IconButton
                            icon={<ArchiveRestore size={16} />}
                            aria-label={`Przywróć ${interval.label}`}
                            onClick={() => {
                              void handleRestore(interval);
                            }}
                          />
                        ) : (
                          <IconButton
                            icon={<Archive size={16} />}
                            aria-label={`Archiwizuj ${interval.label}`}
                            onClick={() => {
                              void handleArchive(interval);
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <TextField
          label="Nowy interwał"
          className={styles.addField}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={handleNewLabelKeyDown}
        />
        <Button
          variant="secondary"
          disabled={submitting || !newLabel.trim()}
          loading={submitting}
          onClick={() => {
            void handleAdd();
          }}
        >
          Dodaj
        </Button>
      </div>
    </section>
  );
}
