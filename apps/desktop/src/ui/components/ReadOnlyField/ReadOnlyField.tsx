import type { ReactElement, ReactNode } from "react";
import styles from "./ReadOnlyField.module.css";

export interface ReadOnlyFieldRow {
  label: string;
  value: ReactNode;
  tone?: "profit" | "loss";
}

export interface ReadOnlyFieldProps {
  rows: ReadOnlyFieldRow[];
}

/** Siatka par etykieta→wartość w trybie tylko-do-odczytu - konsolidacja wzorca dotąd
 * powtórzonego niemal bez zmian w `TradeBalanceCard` i `TradePreviewCard` (Faza 10). */
export function ReadOnlyField({ rows }: ReadOnlyFieldProps): ReactElement {
  return (
    <div className={styles.grid}>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <span className={styles.label}>{row.label}</span>
          <span
            className={[
              styles.value,
              row.tone === "profit" && styles.profit,
              row.tone === "loss" && styles.loss,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
