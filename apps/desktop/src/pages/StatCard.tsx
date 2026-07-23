import type { ReactElement } from "react";
import { Link } from "react-router";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  label: string;
  value: string;
  tone?: "profit" | "loss";
  /** `primary` - kafelek z górnego rzędu, z większą liczbą. `secondary` - wskaźnik uzupełniający,
   * wizualnie lżejszy. Bez tego rozróżnienia wszystkie kafelki krzyczą tak samo głośno i nie
   * widać, co jest naprawdę ważne. */
  emphasis?: "primary" | "secondary";
  /** Dokąd prowadzi kliknięcie - do danych ŹRÓDŁOWYCH tego wskaźnika. Bez tego KPI jest ślepym
   * zaułkiem: widać liczbę, ale nie da się sprawdzić, skąd się wzięła. */
  to?: string;
}

export function StatCard({
  label,
  value,
  tone,
  emphasis = "secondary",
  to,
}: StatCardProps): ReactElement {
  const classes = [
    styles.card,
    emphasis === "primary" ? styles.primary : styles.secondary,
    to ? styles.clickable : null,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span className={styles.label}>{label}</span>
      <span
        className={[
          styles.value,
          tone === "profit" && styles.profit,
          tone === "loss" && styles.loss,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  return <div className={classes}>{content}</div>;
}
