import clsx from 'clsx';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Etykieta dla czytników ekranu - domyślnie polski komunikat ładowania. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Wczytywanie…', className }: SpinnerProps) {
  return (
    <span role="status" className={clsx(styles.spinner, styles[size], className)}>
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {label}
      </span>
    </span>
  );
}
