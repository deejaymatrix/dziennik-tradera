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
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, isActive = false, className, type = "button", ...rest },
  ref,
): ReactElement {
  const classes = [styles.iconButton, isActive && styles.active, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-pressed={isActive || undefined}
      {...rest}
    >
      {icon}
    </button>
  );
});
