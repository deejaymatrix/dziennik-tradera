import type { ReactElement } from "react";
import type { EmotionalState } from "../app/types/emotional_state";
import type { MomentEmotion } from "../app/types/trade";
import { Checkbox } from "../ui/components/Checkbox/Checkbox";
import { Select } from "../ui/components/Select/Select";
import { Textarea } from "../ui/components/Textarea/Textarea";
import styles from "./EmotionMomentEditor.module.css";

export interface EmotionMomentEditorProps {
  label: string;
  value: MomentEmotion;
  onChange: (value: MomentEmotion) => void;
  states: EmotionalState[];
  disabled?: boolean;
}

const INTENSITY_OPTIONS = [
  { value: "", label: "— brak —" },
  { value: "1", label: "1 - bardzo słabe" },
  { value: "2", label: "2" },
  { value: "3", label: "3 - umiarkowane" },
  { value: "4", label: "4" },
  { value: "5", label: "5 - bardzo silne" },
];

/** Edytor emocji dla jednego z trzech momentów transakcji (przed/w trakcie/po) - wielokrotny
 * wybór stanu + natężenie 1-5 + notatka, z jawną flagą "Nie uzupełniono" (sekcja "Emocje w 3
 * momentach"). Zaznaczenie "Nie uzupełniono" czyści resztę pól tego momentu. */
export function EmotionMomentEditor({
  label,
  value,
  onChange,
  states,
  disabled,
}: EmotionMomentEditorProps): ReactElement {
  function handleNotFilledChange(checked: boolean): void {
    if (checked) {
      onChange({ state_ids: [], intensity: null, note: null, not_filled: true });
    } else {
      onChange({ ...value, not_filled: false });
    }
  }

  function toggleState(id: string): void {
    const nextIds = value.state_ids.includes(id)
      ? value.state_ids.filter((s) => s !== id)
      : [...value.state_ids, id];
    onChange({ ...value, state_ids: nextIds });
  }

  return (
    <div className={styles.moment}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <Checkbox
          label="Nie uzupełniono"
          checked={value.not_filled}
          onChange={(e) => handleNotFilledChange(e.target.checked)}
          disabled={disabled}
        />
      </div>

      {!value.not_filled && (
        <>
          {states.length === 0 ? (
            <p className={styles.empty}>
              Brak dostępnych stanów emocjonalnych - dodaj je w oknie „Stan emocjonalny" (grupa
              Analiza).
            </p>
          ) : (
            <div className={styles.statesGrid}>
              {states.map((state) => (
                <Checkbox
                  key={state.id}
                  label={state.name}
                  checked={value.state_ids.includes(state.id)}
                  onChange={() => toggleState(state.id)}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
          <Select
            label="Natężenie"
            value={value.intensity !== null ? String(value.intensity) : ""}
            onChange={(e) =>
              onChange({
                ...value,
                intensity: e.target.value ? Number.parseInt(e.target.value, 10) : null,
              })
            }
            options={INTENSITY_OPTIONS}
            disabled={disabled}
          />
          <Textarea
            label="Notatka (opcjonalnie)"
            value={value.note ?? ""}
            onChange={(e) => onChange({ ...value, note: e.target.value || null })}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}
