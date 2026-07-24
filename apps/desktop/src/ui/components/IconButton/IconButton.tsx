import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  icon: ReactNode;
  /** Wymagane - IconButton nie ma widocznego tekstu, więc czytnik ekranu potrzebuje etykiety. */
  "aria-label": string;
  isActive?: boolean;
  /** Ten sam stan „loading” co w `Button` (sekcja 9 promptu) - IconButton go dotąd nie miał,
   * co część 52 audytu O7 znalazła jako architektoniczną lukę w kilku miejscach (np. wiersze
   * Kosza). Ikona chowa się przez `visibility`, nie `display: none`, więc przycisk nie
   * zmienia rozmiaru w trakcie ładowania. */
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, isActive = false, loading = false, className, type = "button", disabled, ...rest },
  ref,
): ReactElement {
  const classes = [
    styles.iconButton,
    isActive && styles.active,
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
      aria-pressed={isActive || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.iconWrapper}>{icon}</span>
    </button>
  );
});
