import { useEffect, useState } from "react";

export interface AppStatus {
  version: string;
  env: string;
}

type AppStatusState =
  { kind: "loading" } | { kind: "ready"; status: AppStatus } | { kind: "error"; message: string };

/**
 * Pobiera status aplikacji z backendu Rust. Jeżeli okno działa poza
 * kontekstem Tauri (np. sam podgląd Vite otwarty w zwykłej przeglądarce),
 * pokazujemy to jawnie zamiast wyrzucać nieobsłużony wyjątek.
 */
export function useAppStatus(): AppStatusState {
  const [state, setState] = useState<AppStatusState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const status = await invoke<AppStatus>("get_app_status");
        if (!cancelled) {
          setState({ kind: "ready", status });
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
  }, []);

  return state;
}
