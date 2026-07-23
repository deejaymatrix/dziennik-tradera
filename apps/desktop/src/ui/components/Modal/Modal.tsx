import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconButton } from "../IconButton/IconButton";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `wide` dla formularzy z dwiema kolumnami (np. transakcja z panelem obliczeń po prawej). */
  size?: "default" | "wide";
}

/**
 * Oparty na natywnym <dialog>: przechwytywanie focusu, Esc i tło modalne dostaje
 * się "za darmo" z przeglądarki, bez dodatkowej biblioteki.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  size = "default",
}: ModalProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, size === "wide" ? styles.wide : null].filter(Boolean).join(" ")}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <IconButton icon="×" aria-label="Zamknij" onClick={onClose} />
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
