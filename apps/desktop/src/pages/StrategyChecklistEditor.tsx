import type { ReactElement } from "react";
import type { ChecklistStatus, StrategyChecklist } from "../app/types/trade";
import { Select } from "../ui/components/Select/Select";
import styles from "./StrategyChecklistEditor.module.css";

export interface StrategyChecklistEditorProps {
  checklist: StrategyChecklist;
  onChange: (checklist: StrategyChecklist) => void;
  disabled?: boolean;
}

const ENTRY_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "not_applicable", label: "Nie dotyczy" },
  { value: "fulfilled", label: "Spełniona" },
  { value: "unfulfilled", label: "Niespełniona" },
];

const MANAGEMENT_STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "not_applicable", label: "Nie dotyczy" },
  { value: "fulfilled", label: "Wykonana" },
  { value: "unfulfilled", label: "Niewykonana" },
];

/** Checklist zasad wybranej strategii, zamrożona w momencie jej wyboru na transakcji (sekcja
 * "Checklist w transakcji") - niespełniona wymagana zasada nie blokuje zapisu, tylko oznacza
 * naruszenie planu widoczne później przy przeglądzie transakcji. */
export function StrategyChecklistEditor({
  checklist,
  onChange,
  disabled,
}: StrategyChecklistEditorProps): ReactElement | null {
  if (checklist.entry.length === 0 && checklist.management.length === 0) {
    return null;
  }

  function updateEntry(index: number, status: ChecklistStatus): void {
    const next = checklist.entry.map((item, i) => (i === index ? { ...item, status } : item));
    onChange({ ...checklist, entry: next });
  }

  function updateManagement(index: number, status: ChecklistStatus): void {
    const next = checklist.management.map((item, i) => (i === index ? { ...item, status } : item));
    onChange({ ...checklist, management: next });
  }

  return (
    <div className={styles.section}>
      <h3 className={styles.title}>Checklist strategii</h3>

      {checklist.entry.length > 0 && (
        <div className={styles.group}>
          <span className={styles.groupTitle}>Zasady wejścia</span>
          {checklist.entry.map((item, index) => (
            <div key={item.rule_id} className={styles.row}>
              <span className={styles.itemName}>
                {item.name}
                {item.required && (
                  <span className={styles.requiredMark} title="Zasada wymagana">
                    {" "}
                    *
                  </span>
                )}
              </span>
              <Select
                label="Status"
                value={item.status}
                onChange={(e) => updateEntry(index, e.target.value as ChecklistStatus)}
                options={ENTRY_STATUS_OPTIONS}
                disabled={disabled}
                className={styles.statusSelect}
              />
            </div>
          ))}
        </div>
      )}

      {checklist.management.length > 0 && (
        <div className={styles.group}>
          <span className={styles.groupTitle}>Zasady zarządzania pozycją</span>
          {checklist.management.map((item, index) => (
            <div key={item.rule_id} className={styles.row}>
              <span className={styles.itemName}>{item.name}</span>
              <Select
                label="Status"
                value={item.status}
                onChange={(e) => updateManagement(index, e.target.value as ChecklistStatus)}
                options={MANAGEMENT_STATUS_OPTIONS}
                disabled={disabled}
                className={styles.statusSelect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
