import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'accent';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={clsx(styles.badge, styles[tone], className)} {...props} />;
}
