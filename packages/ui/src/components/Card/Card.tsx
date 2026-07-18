import { forwardRef, type HTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lekko jaśniejsze tło - do kart "wyniesionych" nad tło strony. */
  raised?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { raised = false, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={clsx(styles.card, raised && styles.raised, className)} {...props} />
  );
});
