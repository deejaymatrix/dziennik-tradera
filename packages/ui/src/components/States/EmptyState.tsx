import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import styles from './States.module.css';
import { Heading, Text } from '../Typography/Typography.js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Konkretne działanie (np. przycisk), zgodnie z §4 decyzja 88 - puste ekrany tłumaczą kolejny krok. */
  action?: ReactNode;
  /** Poziom nagłówka - dopasuj do miejsca użycia, żeby nie łamać kolejności h1→h2→h3 (domyślnie 2). */
  headingLevel?: 1 | 2 | 3 | 4;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel = 2,
}: EmptyStateProps) {
  return (
    <div className={styles.state} role="status">
      <div className={styles.icon} aria-hidden="true">
        {icon ?? <Inbox size={32} strokeWidth={1.5} />}
      </div>
      <Heading level={headingLevel} className={styles.title}>
        {title}
      </Heading>
      {description ? <Text tone="secondary">{description}</Text> : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
