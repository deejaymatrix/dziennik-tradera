import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactElement } from "react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, disabled, ...rest },
  ref,
): ReactElement {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={[styles.wrapper, disabled && styles.disabledLabel].filter(Boolean).join(" ")}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        disabled={disabled}
        className={[styles.checkbox, className].filter(Boolean).join(" ")}
        {...rest}
      />
      {label}
    </label>
  );
});
