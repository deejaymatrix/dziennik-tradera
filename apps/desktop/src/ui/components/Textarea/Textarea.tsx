import { forwardRef, useId } from "react";
import type { ReactElement, TextareaHTMLAttributes } from "react";
import { useOptionalPreferences } from "../../../app/PreferencesProvider";
import styles from "./Textarea.module.css";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, rows = 3, ...rest },
  ref,
): ReactElement {
  const id = useId();
  // Podpowiedź pod polem można wyłączyć w Ustawieniach; komunikat błędu zostaje zawsze.
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
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[styles.textarea, error && styles.textareaError, className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
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
