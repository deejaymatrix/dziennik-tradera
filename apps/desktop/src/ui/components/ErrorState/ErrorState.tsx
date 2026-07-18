import type { ReactElement, ReactNode } from "react";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function ErrorState({ title, description, action }: ErrorStateProps): ReactElement {
  return (
    <div className={styles.wrapper} role="alert">
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
