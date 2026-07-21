import type { ReactElement, ReactNode } from "react";
import styles from "./SectionCard.module.css";

export interface SectionCardProps {
  children: ReactNode;
  /** `alt` dla mniejszych, zagnieżdżonych kart (np. w karcie transakcji) - `default` dla kart
   * będących głównym blokiem strony (Ustawienia, Eksport i kopie). */
  surface?: "default" | "alt";
  padding?: "sm" | "md";
  className?: string;
}

/** Wspólna otoczka "karty" (tło + ramka + zaokrąglenie) - konsolidacja niemal identycznego
 * `.card`/`.section` powtarzającego się dotąd osobno w kilku modułach CSS (Faza 10). */
export function SectionCard({
  children,
  surface = "default",
  padding = "md",
  className,
}: SectionCardProps): ReactElement {
  const classes = [styles.card, styles[surface], styles[padding], className]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}
