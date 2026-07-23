import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import { useOptionalPreferences } from "../../../app/PreferencesProvider";
import styles from "./TextField.module.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  /** Ikona wewnątrz pola (np. lupa dla wyszukiwania) - czysto wizualna, aria-hidden. */
  icon?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, required, className, ...rest },
  ref,
): ReactElement {
  const id = useId();
  // Podpowiedź pod polem można wyłączyć w Ustawieniach → Zachowanie aplikacji. Komunikat BŁĘDU
  // zostaje zawsze - to nie jest podpowiedź, tylko informacja o tym, że coś jest nie tak.
  const preferences = useOptionalPreferences();
  const hintsVisible = preferences?.behavior.show_field_hints ?? true;
  const hintId = hint && hintsVisible ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && (
          <span className={styles.requiredMark} aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className={styles.inputWrapper}>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          required={required}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            styles.input,
            icon && styles.inputWithIcon,
            error && styles.inputError,
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
      </div>
      {hint && hintsVisible && !error && (
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
