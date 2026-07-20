import type { ReactElement, ReactNode } from "react";
import styles from "./ChartCard.module.css";

export interface ChartCardProps {
  title: string;
  hint?: string;
  /** Karta zajmuje całą szerokość siatki - dla wykresów z wieloma kategoriami (np. wykres
   * dzienny na 31 słupków), gdzie wąska połowa siatki robi z osi X nieczytelną plamę. */
  fullWidth?: boolean;
  children: ReactNode;
}

/** Wspólny wrapper kart z wykresem/tabelą w zakładce Raporty (Faza 9) - ten sam wzorzec, co
 * dotychczasowa `.chartSection` na Dashboardzie, tylko wydzielony do ponownego użycia. */
export function ChartCard({ title, hint, fullWidth, children }: ChartCardProps): ReactElement {
  return (
    <div className={[styles.card, fullWidth && styles.fullWidth].filter(Boolean).join(" ")}>
      <h3 className={styles.title}>{title}</h3>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </div>
  );
}
