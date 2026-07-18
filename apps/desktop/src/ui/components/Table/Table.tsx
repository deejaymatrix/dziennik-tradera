import type { ReactElement, ReactNode } from "react";
import styles from "./Table.module.css";

export interface TableProps {
  children: ReactNode;
  caption?: string;
}

export function Table({ children, caption }: TableProps): ReactElement {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export const tableStyles = styles;
