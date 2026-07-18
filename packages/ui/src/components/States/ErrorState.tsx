import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './States.module.css';
import { Heading, Text } from '../Typography/Typography.js';

export interface ErrorStateProps {
  title: string;
  description?: string;
  /** Zwykle przycisk "Spróbuj ponownie" - patrz §14 (długie operacje mają sensowny retry). */
  action?: ReactNode;
  /** Poziom nagłówka - dopasuj do miejsca użycia, żeby nie łamać kolejności h1→h2→h3 (domyślnie 2). */
  headingLevel?: 1 | 2 | 3 | 4;
}

export function ErrorState({ title, description, action, headingLevel = 2 }: ErrorStateProps) {
  return (
    <div className={styles.state} role="alert">
      <div className={styles.errorIcon} aria-hidden="true">
        <AlertTriangle size={32} strokeWidth={1.5} />
      </div>
      <Heading level={headingLevel} className={styles.title}>
        {title}
      </Heading>
      {description ? <Text tone="secondary">{description}</Text> : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
