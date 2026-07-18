import { cloneElement, useId, useState } from "react";
import type { ReactElement } from "react";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  content: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}

/**
 * Owija pojedynczy element potomny i pokazuje dymek przy najechaniu myszą lub focusie
 * klawiaturowym (nie tylko hover - inaczej informacja byłaby niedostępna z klawiatury).
 */
export function Tooltip({ content, children }: TooltipProps): ReactElement {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const show = (): void => {
    setVisible(true);
  };
  const hide = (): void => {
    setVisible(false);
  };

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": id })}
      {visible && (
        <span role="tooltip" id={id} className={styles.bubble}>
          {content}
        </span>
      )}
    </span>
  );
}
