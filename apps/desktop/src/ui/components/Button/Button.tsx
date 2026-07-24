import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactElement } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stan „loading” z sekcji 9 promptu: pokazuje spinner, blokuje ponowne kliknięcie
   * i ustawia `aria-busy` - zamiast każdego miejsca użycia ręcznie podmieniającego tekst
   * na "Zapisywanie..." i pamiętającego dodać `disabled` osobno. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    className,
    type = "button",
    loading = false,
    disabled,
    children,
    ...rest
  },
  ref,
): ReactElement {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    loading && styles.loading,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* Spinner NAD tekstem, nie zamiast niego - `.label` chowa się przez `visibility: hidden`
          (nie `display: none`), więc przycisk nie zmienia szerokości, gdy zaczyna się ładować. */}
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.label}>{children}</span>
    </button>
  );
});
