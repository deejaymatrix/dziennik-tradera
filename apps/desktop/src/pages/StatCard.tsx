import type { ReactElement } from "react";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}

export function StatCard({ label, value, tone }: StatCardProps): ReactElement {
  return (
    <div className={styles.card}>
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
    </div>
  );
}
