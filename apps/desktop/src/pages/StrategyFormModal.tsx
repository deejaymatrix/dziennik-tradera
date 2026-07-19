import { useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { invokeCommand } from "../app/invokeCommand";
import type { Strategy, StrategyInput } from "../app/types/strategy";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { Textarea } from "../ui/components/Textarea/Textarea";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./StrategyFormModal.module.css";

export interface StrategyFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  strategy?: Strategy | undefined;
}

function tagsToText(tags: string[]): string {
  return tags.join(", ");
}

function textToTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Rodzic renderuje ten komponent z `key` zależnym od edytowanej strategii (patrz
 * StrategiesPage), więc pola startowe poniżej liczą się raz przy montowaniu - nie
 * potrzeba efektu resetującego formularz.
 */
export function StrategyFormModal({
  open,
  onClose,
  onSaved,
  strategy,
}: StrategyFormModalProps): ReactElement {
  const isEdit = Boolean(strategy);
  const { showToast } = useToast();

  const [name, setName] = useState(() => strategy?.name ?? "");
  const [color, setColor] = useState(() => strategy?.color ?? "#d7b45a");
  const [tagsText, setTagsText] = useState(() => tagsToText(strategy?.tags ?? []));
  const [description, setDescription] = useState(() => strategy?.description ?? "");
  const [entryRules, setEntryRules] = useState(() => strategy?.entry_rules ?? "");
  const [managementRules, setManagementRules] = useState(() => strategy?.management_rules ?? "");
  const [exitRules, setExitRules] = useState(() => strategy?.exit_rules ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const input: StrategyInput = {
      name,
      description: description.trim() ? description : null,
      color: color.trim() ? color : null,
      entry_rules: entryRules.trim() ? entryRules : null,
      management_rules: managementRules.trim() ? managementRules : null,
      exit_rules: exitRules.trim() ? exitRules : null,
      tags: textToTags(tagsText),
    };

    setSubmitting(true);
    try {
      if (isEdit && strategy) {
        await invokeCommand("update_strategy", { id: strategy.id, input });
        showToast("Strategia zaktualizowana.", "success");
      } else {
        await invokeCommand("create_strategy", { input });
        showToast("Strategia utworzona.", "success");
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
    <Modal open={open} onClose={onClose} title={isEdit ? "Edytuj strategię" : "Nowa strategia"}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={styles.grid}>
          <TextField
            label="Nazwa"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className={styles.colorField}>
            <TextField
              label="Kolor"
              hint="Kod HEX, np. #d7b45a"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <span className={styles.colorSwatch} style={{ backgroundColor: color }} />
          </div>
        </div>
        <TextField
          label="Tagi (opcjonalnie, oddzielone przecinkami)"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          hint="Np. trend, wybicie, spółki dywidendowe"
        />
        <Textarea
          label="Opis (opcjonalnie)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Textarea
          label="Zasady wejścia (opcjonalnie)"
          value={entryRules}
          onChange={(e) => setEntryRules(e.target.value)}
        />
        <Textarea
          label="Zasady zarządzania pozycją (opcjonalnie)"
          value={managementRules}
          onChange={(e) => setManagementRules(e.target.value)}
        />
        <Textarea
          label="Zasady wyjścia (opcjonalnie)"
          value={exitRules}
          onChange={(e) => setExitRules(e.target.value)}
        />
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
