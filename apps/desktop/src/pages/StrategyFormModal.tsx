import { useState } from "react";
import type { ReactElement, SubmitEvent } from "react";
import { invokeCommand } from "../app/invokeCommand";
import type { EntryRule, ManagementRule, Strategy, StrategyInput } from "../app/types/strategy";
import { Button } from "../ui/components/Button/Button";
import { ColorPicker } from "../ui/components/ColorPicker/ColorPicker";
import { Modal } from "../ui/components/Modal/Modal";
import { Textarea } from "../ui/components/Textarea/Textarea";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import { RuleListEditor } from "./RuleListEditor";
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

function newEntryRule(): EntryRule {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: null,
    required: true,
    archived: false,
    sort_order: 0,
  };
}

function newManagementRule(): ManagementRule {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: null,
    archived: false,
    sort_order: 0,
  };
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
  const [entryRules, setEntryRules] = useState<EntryRule[]>(() => strategy?.entry_rules ?? []);
  const [managementRules, setManagementRules] = useState<ManagementRule[]>(
    () => strategy?.management_rules ?? [],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const input: StrategyInput = {
      name,
      description: description.trim() ? description : null,
      color: color.trim() ? color : null,
      entry_rules: entryRules,
      management_rules: managementRules,
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
            <span className={styles.colorLabel}>Kolor</span>
            <ColorPicker value={color} onChange={setColor} sampleLabel={name} />
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

        <RuleListEditor
          title="Zasady wejścia"
          hint="Każda zasada może być wymagana albo opcjonalna - przy transakcji niespełniona wymagana zasada nie blokuje zapisu, tylko oznacza naruszenie planu."
          rules={entryRules}
          onChange={setEntryRules}
          showRequiredToggle
          makeBlankRule={newEntryRule}
        />

        <RuleListEditor
          title="Zasady zarządzania pozycją"
          rules={managementRules}
          onChange={setManagementRules}
          showRequiredToggle={false}
          makeBlankRule={newManagementRule}
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
