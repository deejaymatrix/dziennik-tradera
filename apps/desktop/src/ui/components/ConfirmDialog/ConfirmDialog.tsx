import { createContext, useCallback, useContext, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "../Button/Button";
import { Modal } from "../Modal/Modal";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Czerwony przycisk potwierdzenia dla akcji nieodwracalnych (usunięcie, opróżnienie kosza). */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Zastępuje natywne `window.confirm(...)` (16 miejsc w aplikacji przed Fazą 10) stylizowanym,
 * spójnym z resztą UI dialogiem, bez zmiany wywołania w miejscu użycia - `await confirm(...)`
 * zwraca `Promise<boolean>` tak jak poprzednio zwracał `window.confirm`. Wzorzec Provider/hook
 * identyczny jak `ToastProvider`/`useToast`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }): ReactElement {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const normalized: ConfirmOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setPending({ ...normalized, resolve });
    });
  }, []);

  function settle(result: boolean): void {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={pending !== null}
        title={pending?.title ?? "Potwierdzenie"}
        onClose={() => settle(false)}
      >
        {pending && (
          <div className={styles.body}>
            <p className={styles.message}>{pending.message}</p>
            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={() => settle(false)}>
                {pending.cancelLabel ?? "Anuluj"}
              </Button>
              <Button
                type="button"
                variant={pending.danger ? "danger" : "primary"}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? "Potwierdź"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Zwraca funkcję `confirm(options)` - `await confirm("Usunąć?")` albo
 * `await confirm({ message: "...", danger: true })`. */
export function useConfirm(): (options: ConfirmOptions | string) => Promise<boolean> {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm musi być użyty wewnątrz <ConfirmProvider>.");
  }
  return context.confirm;
}
