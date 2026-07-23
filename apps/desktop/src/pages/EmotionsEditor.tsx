import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { X } from "lucide-react";
import type { EmotionalState } from "../app/types/emotional_state";
import type { EmotionEntry, TradeEmotions } from "../app/types/trade";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { TextField } from "../ui/components/TextField/TextField";
import styles from "./EmotionsEditor.module.css";

export interface EmotionsEditorProps {
  value: TradeEmotions;
  onChange: (value: TradeEmotions) => void;
  states: EmotionalState[];
  disabled?: boolean;
}

const SCALE = [1, 2, 3, 4, 5];

/**
 * Emocje transakcji jako płaska lista (sekcja 6.8): jedno pole "Dodaj emocję", z którego dodaje
 * się emocje POJEDYNCZO, dowolnie wiele. Każda dodana emocja to osobny wiersz z nazwą, skalą
 * natężenia 1-5 (pięć szybkich przycisków, skrajne opisane "Słaba"/"Bardzo silna") i przyciskiem
 * usunięcia. Skala pojawia się dopiero PO dodaniu konkretnej emocji.
 *
 * Brak wybranej emocji = pusta lista = brak danych. Bez żadnego "nie uzupełniono".
 */
export function EmotionsEditor({
  value,
  onChange,
  states,
  disabled,
}: EmotionsEditorProps): ReactElement {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const stateById = useMemo(() => {
    const map = new Map<string, EmotionalState>();
    for (const s of states) {
      map.set(s.id, s);
    }
    return map;
  }, [states]);

  const selectedIds = new Set(value.entries.map((e) => e.state_id));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Bez obcinania listy: użytkownik ma widzieć WSZYSTKIE dostępne emocje, a nie pierwsze kilka.
    return states
      .filter((s) => !s.hidden && !selectedIds.has(s.id))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIds pochodzi z value.entries.
  }, [query, states, value.entries]);

  function addEmotion(stateId: string): void {
    if (selectedIds.has(stateId)) {
      return;
    }
    onChange({ entries: [...value.entries, { state_id: stateId, intensity: null }] });
    // Po dodaniu emocji lista podpowiedzi znika - żeby dodać kolejną, użytkownik klika pole
    // ponownie. Bez tego dropdown zostawał otwarty i zasłaniał świeżo dodany wiersz.
    setQuery("");
    setFocused(false);
  }

  function setIntensity(stateId: string, intensity: number): void {
    onChange({
      entries: value.entries.map((e) =>
        // Ponowne kliknięcie tej samej wartości ją zdejmuje (wraca do "nie wybrano na skali").
        e.state_id === stateId
          ? { ...e, intensity: e.intensity === intensity ? null : intensity }
          : e,
      ),
    });
  }

  function removeEmotion(stateId: string): void {
    onChange({ entries: value.entries.filter((e) => e.state_id !== stateId) });
  }

  function labelFor(entry: EmotionEntry): string {
    return stateById.get(entry.state_id)?.name ?? "(usunięta emocja)";
  }

  return (
    <div className={styles.wrapper}>
      {!disabled && (
        <div
          className={styles.searchRow}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setFocused(false);
            }
          }}
        >
          <TextField
            label="Dodaj emocję"
            placeholder="Wpisz, żeby wyszukać..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
          />
          {focused && suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => addEmotion(s.id)}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {value.entries.length === 0 ? (
        <p className={styles.emptyHint}>
          {disabled ? "Nie zapisano żadnych emocji." : "Nie dodano żadnych emocji."}
        </p>
      ) : (
        <div className={styles.list}>
          {value.entries.map((entry) => (
            <div key={entry.state_id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.name}>{labelFor(entry)}</span>
                {!disabled && (
                  <IconButton
                    icon={<X size={16} />}
                    aria-label={`Usuń emocję ${labelFor(entry)}`}
                    onClick={() => removeEmotion(entry.state_id)}
                  />
                )}
              </div>
              <div className={styles.scale}>
                <span className={styles.scaleEnd}>Słaba</span>
                <div className={styles.scaleButtons}>
                  {SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={[
                        styles.scaleButton,
                        entry.intensity === n ? styles.scaleButtonActive : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-pressed={entry.intensity === n}
                      aria-label={`Natężenie ${n} z 5 dla ${labelFor(entry)}`}
                      disabled={disabled ?? false}
                      onClick={() => setIntensity(entry.state_id, n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className={styles.scaleEnd}>Bardzo silna</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
