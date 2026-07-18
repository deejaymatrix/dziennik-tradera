import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "./invokeCommand";

export type TauriQueryState<T> =
  { kind: "loading" } | { kind: "ready"; data: T } | { kind: "error"; message: string };

export interface TauriQueryResult<T> {
  state: TauriQueryState<T>;
  refetch: () => void;
}

/**
 * Wywołuje komendę Tauri i zwraca jej stan. Jeżeli okno działa poza kontekstem Tauri
 * (np. sam podgląd Vite otwarty w zwykłej przeglądarce), zwraca stan błędu zamiast
 * wyrzucać nieobsłużony wyjątek. `refetch` pozwala odświeżyć dane po mutacji (np. po
 * dodaniu konta), bez przeładowania całej strony.
 */
export function useTauriQuery<T>(
  command: string,
  args?: Record<string, unknown>,
): TauriQueryResult<T> {
  const [state, setState] = useState<TauriQueryState<T>>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const data = await invoke<T>(command, args);
        if (!cancelled) {
          setState({ kind: "ready", data });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ kind: "error", message: extractErrorMessage(error) });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- args is a plain object literal at call sites; re-running per identity would loop.
  }, [command, reloadToken]);

  return { state, refetch };
}
