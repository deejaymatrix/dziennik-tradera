import { useId } from "react";
import type { ReactElement, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./FormPanel.module.css";

/** Stan wypełnienia sekcji pokazywany w nagłówku - także wtedy, gdy panel jest zwinięty. */
export type PanelStatus = "complete" | "partial" | "empty" | "error";

const STATUS_LABEL: Record<PanelStatus, string> = {
  complete: "Uzupełnione",
  partial: "Częściowo",
  empty: "Puste",
  error: "Do poprawy",
};

const STATUS_CLASS: Record<PanelStatus, string | undefined> = {
  complete: styles.statusComplete,
  partial: styles.statusPartial,
  empty: styles.statusEmpty,
  error: styles.statusError,
};

export interface FormPanelProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  status: PanelStatus;
  /** Nadpisuje domyślny opis statusu, np. konkretną liczbą braków. */
  statusLabel?: string;
  children: ReactNode;
}

/**
 * Zwijana sekcja formularza transakcji (sekcja 6.1 specyfikacji). Nagłówek niesie czytelny status
 * kompletności, żeby przy zwiniętym panelu dało się poznać, czy zostało tam coś do uzupełnienia.
 *
 * Zawartość zwiniętego panelu ZOSTAJE w drzewie (ukryta atrybutem `hidden`), a nie jest
 * odmontowywana - inaczej zwinięcie sekcji kasowałoby wpisane dane i stan pól, czego
 * specyfikacja zabrania wprost.
 */
export function FormPanel({
  title,
  open,
  onToggle,
  status,
  statusLabel,
  children,
}: FormPanelProps): ReactElement {
  const bodyId = useId();

  return (
    <section className={styles.panel}>
      <button
        type="button"
        className={styles.header}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={[styles.chevron, open ? styles.chevronOpen : null].filter(Boolean).join(" ")}
        />
        <span className={styles.title}>{title}</span>
        <span className={[styles.status, STATUS_CLASS[status]].filter(Boolean).join(" ")}>
          {statusLabel ?? STATUS_LABEL[status]}
        </span>
      </button>
      <div id={bodyId} className={styles.body} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
