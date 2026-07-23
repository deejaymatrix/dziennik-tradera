import type { ReactElement, ReactNode } from "react";
import styles from "./SettingRow.module.css";

export interface SettingRowProps {
  label: string;
  /** Krótki opis WPŁYWU ustawienia - specyfikacja wymaga go przy każdej mniej oczywistej opcji. */
  description?: string;
  /** Pokazuje znacznik "Wymaga ponownego uruchomienia". Aplikacja NIGDY nie restartuje się sama. */
  requiresRestart?: boolean;
  /** Ustawienie, którego użytkownik nie może wyłączyć (np. autozapis szkicu) - pokazujemy je,
   * żeby było wiadomo, że działa, ale bez przełącznika, który sugerowałby wybór. */
  locked?: boolean;
  children?: ReactNode;
}

export function SettingRow({
  label,
  description,
  requiresRestart,
  locked,
  children,
}: SettingRowProps): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span className={styles.label}>
          {label}
          {locked && <span className={styles.lockedTag}>Zawsze aktywne</span>}
          {requiresRestart && (
            <span className={styles.restartTag}>Wymaga ponownego uruchomienia</span>
          )}
        </span>
        {description && <span className={styles.description}>{description}</span>}
      </div>
      {children && <div className={styles.control}>{children}</div>}
    </div>
  );
}
