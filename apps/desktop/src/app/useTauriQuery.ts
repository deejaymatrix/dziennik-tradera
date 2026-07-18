import { useEffect, useState } from "react";

export type TauriQueryState<T> =
  { kind: "loading" } | { kind: "ready"; data: T } | { kind: "error"; message: string };

/**
 * Wywołuje komendę Tauri i zwraca jej stan. Jeżeli okno działa poza kontekstem Tauri
 * (np. sam podgląd Vite otwarty w zwykłej przeglądarce), zwraca stan błędu zamiast
 * wyrzucać nieobsłużony wyjątek.
 */
export function useTauriQuery<T>(
  command: string,
  args?: Record<string, unknown>,
): TauriQueryState<T> {
  const [state, setState] = useState<TauriQueryState<T>>({ kind: "loading" });

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
          const message =
            error instanceof Error
              ? error.message
              : "Brak środowiska Tauri (uruchomiono poza aplikacją desktopową).";
          setState({ kind: "error", message });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- args is a plain object literal at call sites; re-running per identity would loop.
  }, [command]);

  return state;
}
