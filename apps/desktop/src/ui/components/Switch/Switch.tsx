import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactElement } from "react";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, disabled, ...rest },
  ref,
): ReactElement {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={[styles.wrapper, disabled && styles.wrapperDisabled].filter(Boolean).join(" ")}
    >
      <span className={styles.track}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
          disabled={disabled}
          className={[styles.input, className].filter(Boolean).join(" ")}
          {...rest}
        />
        <span className={styles.thumb} aria-hidden="true" />
      </span>
      {label}
    </label>
  );
});
