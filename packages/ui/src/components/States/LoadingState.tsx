import styles from './States.module.css';
import { Spinner } from '../Spinner/Spinner.js';
import { Text } from '../Typography/Typography.js';

export interface LoadingStateProps {
  label?: string;
}

/** Stan ładowania całej sekcji (nie do użytku wewnątrz przycisków - tam wystarczy sam Spinner). */
export function LoadingState({ label = 'Wczytywanie…' }: LoadingStateProps) {
  return (
    <div className={styles.state}>
      <Spinner size="lg" label={label} />
      <Text tone="secondary">{label}</Text>
    </div>
  );
}
