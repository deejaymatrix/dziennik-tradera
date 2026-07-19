import type { ReactElement } from "react";
import type { TradeAuditEntry } from "../app/types/trade";
import styles from "./TradeAuditLog.module.css";

export interface TradeAuditLogProps {
  entries: TradeAuditEntry[] | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
}

/** Lokalny dziennik zmian pól tej transakcji (sekcja "Tryb odczytu i przycisk Edytuj") - jeden
 * wpis na zapisaną edycję, tylko gdy coś realnie się zmieniło. Puste/nieznane - nic nie renderuje. */
export function TradeAuditLog({ entries }: TradeAuditLogProps): ReactElement | null {
  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Historia zmian ({entries.length})</summary>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <p className={styles.date}>{formatDateTime(entry.changed_at)}</p>
            <ul className={styles.changes}>
              {entry.changes.map((change, index) => (
                <li key={index}>
                  <strong>{change.field}:</strong> {change.old_value ?? "—"} →{" "}
                  {change.new_value ?? "—"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}
