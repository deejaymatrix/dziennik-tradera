import type { ReactElement } from "react";
import type { ChecklistItem, ChecklistStatus, StrategyChecklist } from "../app/types/trade";
import { requiresUnfulfilledReason } from "../app/types/trade";
import { Select } from "../ui/components/Select/Select";
import { TextField } from "../ui/components/TextField/TextField";
import styles from "./StrategyChecklistEditor.module.css";

export interface StrategyChecklistEditorProps {
  checklist: StrategyChecklist;
  onChange: (checklist: StrategyChecklist) => void;
  disabled?: boolean;
  /** Ustawiane po nieudanej próbie finalnego zapisu - podświetla brakujące powody zamiast
   * czerwienić pola od pierwszej chwili, zanim użytkownik w ogóle spróbował zapisać. */
  showReasonErrors?: boolean;
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
 * "Checklist w transakcji"). Niespełniona WYMAGANA zasada nie blokuje zapisu szkicu, ale odsłania
 * pod sobą obowiązkowe pole "Powód niespełnienia", bez którego nie przejdzie finalny zapis
 * (sekcja 6.6). Każda taka zasada ma własny, niezależny powód. */
export function StrategyChecklistEditor({
  checklist,
  onChange,
  disabled,
  showReasonErrors,
}: StrategyChecklistEditorProps): ReactElement | null {
  if (checklist.entry.length === 0 && checklist.management.length === 0) {
    return null;
  }

  /** Zmiana statusu na inny niż "niespełniona" kasuje powód - powód przypięty do spełnionej
   * zasady byłby bez sensu i zapisałby się do historycznej migawki jako śmieć. */
  function withStatus(item: ChecklistItem, status: ChecklistStatus): ChecklistItem {
    const next = { ...item, status };
    return requiresUnfulfilledReason(next) ? next : { ...next, reason: null };
  }

  function updateEntry(index: number, status: ChecklistStatus): void {
    const next = checklist.entry.map((item, i) => (i === index ? withStatus(item, status) : item));
    onChange({ ...checklist, entry: next });
  }

  function updateManagement(index: number, status: ChecklistStatus): void {
    const next = checklist.management.map((item, i) =>
      i === index ? withStatus(item, status) : item,
    );
    onChange({ ...checklist, management: next });
  }

  function updateEntryReason(index: number, reason: string): void {
    const next = checklist.entry.map((item, i) => (i === index ? { ...item, reason } : item));
    onChange({ ...checklist, entry: next });
  }

  function updateManagementReason(index: number, reason: string): void {
    const next = checklist.management.map((item, i) => (i === index ? { ...item, reason } : item));
    onChange({ ...checklist, management: next });
  }

  /** Pole powodu renderowane bezpośrednio pod zasadą, której dotyczy (sekcja 6.6). */
  function reasonField(item: ChecklistItem, onReasonChange: (reason: string) => void) {
    if (!requiresUnfulfilledReason(item)) {
      return null;
    }
    const empty = (item.reason ?? "").trim() === "";
    // `error` rozkładamy warunkowo, a nie jako `error={... : undefined}` - przy
    // `exactOptionalPropertyTypes` jawne `undefined` nie jest tym samym co brak właściwości.
    const errorProp =
      showReasonErrors && empty ? { error: "Podaj powód niespełnienia tej zasady." } : {};
    return (
      <div className={styles.reason}>
        <TextField
          label="Powód niespełnienia"
          placeholder="Dlaczego ta zasada nie została spełniona?"
          value={item.reason ?? ""}
          onChange={(e) => onReasonChange(e.target.value)}
          disabled={disabled ?? false}
          required
          {...errorProp}
        />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h3 className={styles.title}>Checklist strategii</h3>

      {checklist.entry.length > 0 && (
        <div className={styles.group}>
          <span className={styles.groupTitle}>Zasady wejścia</span>
          {checklist.entry.map((item, index) => (
            <div key={item.rule_id} className={styles.item}>
              <div className={styles.row}>
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
              {reasonField(item, (reason) => updateEntryReason(index, reason))}
            </div>
          ))}
        </div>
      )}

      {checklist.management.length > 0 && (
        <div className={styles.group}>
          <span className={styles.groupTitle}>Zasady zarządzania pozycją</span>
          {checklist.management.map((item, index) => (
            <div key={item.rule_id} className={styles.item}>
              <div className={styles.row}>
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
              {reasonField(item, (reason) => updateManagementReason(index, reason))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
