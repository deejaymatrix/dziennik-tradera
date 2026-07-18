import type { ReactElement, ReactNode } from "react";
import styles from "./Tag.module.css";

export interface TagProps {
  children: ReactNode;
  onRemove?: () => void;
  className?: string;
}

export function Tag({ children, onRemove, className }: TagProps): ReactElement {
  const classes = [styles.tag, className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      {children}
      {onRemove && (
        <button
          type="button"
          className={styles.removeButton}
          onClick={onRemove}
          aria-label={`Usuń tag ${typeof children === "string" ? children : ""}`.trim()}
        >
          ×
        </button>
      )}
    </span>
  );
}
