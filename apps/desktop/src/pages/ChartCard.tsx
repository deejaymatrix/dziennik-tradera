import type { ReactElement, ReactNode } from "react";
import styles from "./ChartCard.module.css";

export interface ChartCardProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

/** Wspólny wrapper kart z wykresem/tabelą w zakładce Raporty (Faza 9) - ten sam wzorzec, co
 * dotychczasowa `.chartSection` na Dashboardzie, tylko wydzielony do ponownego użycia. */
export function ChartCard({ title, hint, children }: ChartCardProps): ReactElement {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </div>
  );
}
