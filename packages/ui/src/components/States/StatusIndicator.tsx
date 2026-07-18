import clsx from 'clsx';
import styles from './States.module.css';

export type StatusTone = 'neutral' | 'success' | 'danger' | 'accent' | 'warning';

export interface StatusIndicatorProps {
  label: string;
  tone?: StatusTone;
  /** Dodatkowy opis dla czytników ekranu, gdy sama etykieta nie wystarcza. */
  description?: string;
}

/**
 * Generyczny wskaźnik "kropka + etykieta" - np. status synchronizacji, online/offline.
 * Mapowanie konkretnych stanów domenowych (np. SyncStatus) na tone/label wykonuje
 * warstwa wyżej (packages/app-shell), packages/ui pozostaje bez zależności domenowych.
 */
export function StatusIndicator({ label, tone = 'neutral', description }: StatusIndicatorProps) {
  return (
    <span className={styles.indicator} title={description}>
      <span className={clsx(styles.dot, styles[`dot-${tone}`])} aria-hidden="true" />
      {label}
    </span>
  );
}
