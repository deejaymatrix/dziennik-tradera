import type { HTMLAttributes, ReactElement } from "react";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutral" | "accent" | "profit" | "loss" | "info" | "warning";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className, ...rest }: BadgeProps): ReactElement {
  const classes = [styles.badge, styles[variant], className].filter(Boolean).join(" ");
  return <span className={classes} {...rest} />;
}
