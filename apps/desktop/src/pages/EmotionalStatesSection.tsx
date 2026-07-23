import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { invokeCommand } from "../app/invokeCommand";
import type { EmotionalState } from "../app/types/emotional_state";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ErrorState } from "../ui/components/ErrorState/ErrorState";
import { Skeleton } from "../ui/components/Skeleton/Skeleton";
import { TextField } from "../ui/components/TextField/TextField";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./EmotionalStatesSection.module.css";
import settingsStyles from "./SettingsPage.module.css";

/** Zarządzanie listą stanów emocjonalnych używanych na karcie transakcji (sekcja "Emocje w 3
 * momentach") - wbudowane stany można tylko ukryć, własne można też usunąć w całości. */
export function EmotionalStatesSection(): ReactElement {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [states, setStates] = useState<EmotionalState[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load(): Promise<void> {
    try {
      const data = await invokeCommand<EmotionalState[]>("list_emotional_states", {
        includeHidden: true,
      });
      setStates(data);
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

  async function handleToggleHidden(state: EmotionalState): Promise<void> {
    try {
      await invokeCommand("set_emotional_state_hidden", { id: state.id, hidden: !state.hidden });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleDelete(state: EmotionalState): Promise<void> {
    if (!(await confirm(`Usunąć stan emocjonalny "${state.name}"?`))) {
      return;
    }
    try {
      await invokeCommand("delete_emotional_state", { id: state.id });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    }
  }

  async function handleAdd(): Promise<void> {
    if (!newName.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await invokeCommand("create_emotional_state", { input: { name: newName.trim() } });
      setNewName("");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={settingsStyles.section} aria-labelledby="settings-emotional-states">
      <h2 id="settings-emotional-states" className={settingsStyles.sectionTitle}>
        Stany emocjonalne
      </h2>
      <p className={settingsStyles.placeholderNote}>
        Lista stanów dostępnych do wyboru w 3 momentach transakcji (przed/w trakcie/po). Wbudowane
        stany można ukryć, własne można też usunąć.
      </p>

      {loadError !== null && (
        <ErrorState
          title="Nie udało się wczytać stanów emocjonalnych"
          description={loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Spróbuj ponownie
            </Button>
          }
        />
      )}

      {states === null && loadError === null && <Skeleton height="2rem" />}

      {states !== null && states.length === 0 && (
        <EmptyState
          title="Brak stanów emocjonalnych"
          description="Dodaj pierwszy stan polem powyżej - pojawi się do wyboru przy transakcji."
        />
      )}

      {states !== null && (
        <ul className={styles.list}>
          {states.map((state) => (
            <li key={state.id} className={styles.item}>
              <span
                className={[styles.name, state.hidden && styles.hiddenName]
                  .filter(Boolean)
                  .join(" ")}
              >
                {state.name}
              </span>
              <div className={styles.actions}>
                {state.is_builtin && <Badge variant="neutral">wbudowany</Badge>}
                <IconButton
                  icon={state.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                  aria-label={state.hidden ? `Pokaż ${state.name}` : `Ukryj ${state.name}`}
                  onClick={() => {
                    void handleToggleHidden(state);
                  }}
                />
                {!state.is_builtin && (
                  <IconButton
                    icon={<Trash2 size={16} />}
                    aria-label={`Usuń ${state.name}`}
                    onClick={() => {
                      void handleDelete(state);
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <TextField
          label="Nowy stan emocjonalny"
          className={styles.addField}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={submitting || !newName.trim()}
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
