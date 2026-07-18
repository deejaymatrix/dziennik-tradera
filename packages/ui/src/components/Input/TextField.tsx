import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './TextField.module.css';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /**
   * Komunikat błędu walidacji - ustawia aria-invalid i wiąże przez aria-describedby.
   * Typ zawiera jawne `| undefined` (nie tylko `?`), żeby dało się bezpośrednio
   * podpiąć `errors.pole?.message` z react-hook-form pod exactOptionalPropertyTypes.
   */
  error?: string | undefined;
  /** Dodatkowa podpowiedź (np. format oczekiwanych danych). */
  hint?: string | undefined;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, required, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = clsx(error && errorId, hint && !error && hintId) || undefined;

  return (
    <div className={clsx(styles.wrapper, className)}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={styles.input}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
