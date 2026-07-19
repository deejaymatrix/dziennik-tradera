import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { Checkbox } from "../ui/components/Checkbox/Checkbox";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { TextField } from "../ui/components/TextField/TextField";
import styles from "./RuleListEditor.module.css";

/** Kształt wspólny dla EntryRule/ManagementRule - `required` jest opcjonalne, bo tylko zasady
 * wejścia go mają (sekcja "Przebudowa zasad strategii": zarządzanie pozycją bez podziału
 * wymagane/opcjonalne). */
export interface RuleLike {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  sort_order: number;
  required?: boolean;
}

export interface RuleListEditorProps<T extends RuleLike> {
  title: string;
  hint?: string;
  rules: T[];
  onChange: (rules: T[]) => void;
  showRequiredToggle: boolean;
  makeBlankRule: () => T;
}

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item !== undefined) {
    next.splice(target, 0, item);
  }
  return next.map((rule, i) => ({ ...rule, sort_order: i }));
}

/** Zarządzana lista zasad (wejścia albo zarządzania pozycją) - dodawanie, reorder
 * (klawiaturowo/przyciskami), archiwizacja bez usuwania, trwałe usunięcie. Ten sam wzorzec dla
 * obu list zasad, różnica to tylko przełącznik "Wymagana" (wyłącznie zasady wejścia). */
export function RuleListEditor<T extends RuleLike>({
  title,
  hint,
  rules,
  onChange,
  showRequiredToggle,
  makeBlankRule,
}: RuleListEditorProps<T>): ReactElement {
  function updateRule(index: number, patch: Partial<T>): void {
    const next = rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
    onChange(next);
  }

  function removeRule(index: number): void {
    onChange(rules.filter((_, i) => i !== index).map((rule, i) => ({ ...rule, sort_order: i })));
  }

  function addRule(): void {
    onChange([...rules, { ...makeBlankRule(), sort_order: rules.length }]);
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <IconButton icon={<Plus size={16} />} aria-label={`Dodaj: ${title}`} onClick={addRule} />
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}

      {rules.length === 0 && <p className={styles.empty}>Brak zasad - dodaj pierwszą.</p>}

      {rules.length > 0 && (
        <ul className={styles.list}>
          {rules.map((rule, index) => (
            <li key={rule.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <TextField
                  label="Nazwa"
                  value={rule.name}
                  onChange={(e) => updateRule(index, { name: e.target.value } as Partial<T>)}
                  className={styles.nameField}
                />
                <div className={styles.itemActions}>
                  <IconButton
                    icon={<ArrowUp size={16} />}
                    aria-label={`Przesuń w górę: ${rule.name}`}
                    disabled={index === 0}
                    onClick={() => onChange(move(rules, index, -1))}
                  />
                  <IconButton
                    icon={<ArrowDown size={16} />}
                    aria-label={`Przesuń w dół: ${rule.name}`}
                    disabled={index === rules.length - 1}
                    onClick={() => onChange(move(rules, index, 1))}
                  />
                  <IconButton
                    icon={<Trash2 size={16} />}
                    aria-label={`Usuń: ${rule.name}`}
                    onClick={() => removeRule(index)}
                  />
                </div>
              </div>
              <TextField
                label="Opis (opcjonalnie)"
                value={rule.description ?? ""}
                onChange={(e) =>
                  updateRule(index, {
                    description: e.target.value.trim() ? e.target.value : null,
                  } as Partial<T>)
                }
              />
              <div className={styles.itemFlags}>
                {showRequiredToggle && (
                  <Checkbox
                    label="Wymagana"
                    checked={rule.required ?? false}
                    onChange={(e) =>
                      updateRule(index, { required: e.target.checked } as Partial<T>)
                    }
                  />
                )}
                <Checkbox
                  label="Archiwalna"
                  checked={rule.archived}
                  onChange={(e) => updateRule(index, { archived: e.target.checked } as Partial<T>)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
