import type { CSSProperties, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tytuł wymagany dla dostępności (aria) - może być wizualnie ukryty przez hideTitle. */
  title: string;
  hideTitle?: boolean;
  /** Opis dla czytników ekranu (Dialog.Description) - wizualnie ukryty, jeśli podany. */
  description?: string;
  children: ReactNode;
}

/** Cienka, dostępna warstwa nad Radix Dialog z własnym wyglądem (fokus-trap i Escape "za darmo"). */
export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={hideTitle ? undefined : styles.title}>
            {hideTitle ? <span style={visuallyHidden}>{title}</span> : title}
          </Dialog.Title>
          {description ? (
            <Dialog.Description style={visuallyHidden}>{description}</Dialog.Description>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
};
