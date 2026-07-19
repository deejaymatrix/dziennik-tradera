import { forwardRef, useId } from "react";
import type { ReactElement, SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, required, className, ...rest },
  ref,
): ReactElement {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={[styles.select, error && styles.selectError, className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.errorMessage} role="alert">
          {error}
        </span>
      )}
    </div>
  );
});
