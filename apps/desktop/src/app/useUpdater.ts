import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; progress: number | null }
  | { kind: "ready-to-restart" }
  | { kind: "error"; message: string };

/**
 * Tłumaczy surowy błąd wtyczki aktualizacji na zdanie, z którym użytkownik może coś zrobić.
 *
 * Wtyczka zwraca komunikaty po angielsku, w rodzaju „Could not fetch a valid release JSON from
 * the remote" - dla osoby nietechnicznej to nic nie znaczy, a co gorsza brzmi jak awaria
 * aplikacji, podczas gdy w praktyce oznacza po prostu brak sieci albo brak opublikowanego
 * jeszcze wydania. Surowa treść zostaje dołączona na końcu, żeby nie utracić informacji
 * przydatnej przy zgłaszaniu problemu.
 */
export function describeUpdateError(error: unknown): string {
  const surowy = error instanceof Error ? error.message : String(error);
  const n = surowy.toLowerCase();

  // Brak internetu / zablokowane połączenie.
  if (
    n.includes("network") ||
    n.includes("dns") ||
    n.includes("timed out") ||
    n.includes("timeout") ||
    n.includes("connection") ||
    n.includes("unreachable") ||
    n.includes("failed to lookup")
  ) {
    return "Brak połączenia z internetem - nie udało się sprawdzić aktualizacji. Aplikacja działa normalnie bez sieci; spróbuj później.";
  }

  // Wydanie jeszcze nieopublikowane albo endpoint nie zwraca manifestu.
  if (
    n.includes("404") ||
    n.includes("not found") ||
    n.includes("release json") ||
    n.includes("could not fetch")
  ) {
    return "Serwer aktualizacji nie ma jeszcze żadnego opublikowanego wydania. To normalne przed pierwszym wydaniem - nie jest to błąd aplikacji.";
  }

  // Podpis się nie zgadza - jedyny przypadek, w którym trzeba użytkownika zatrzymać.
  if (n.includes("signature") || n.includes("verif") || n.includes("pubkey")) {
    return "Podpis pobranej aktualizacji się nie zgadza - instalacja została przerwana dla bezpieczeństwa. NIE instaluj tej wersji ręcznie i zgłoś problem.";
  }

  return `Nie udało się sprawdzić aktualizacji: ${surowy}`;
}

function errorMessage(error: unknown): string {
  return describeUpdateError(error);
}

/** Sprawdzanie/pobieranie/instalowanie aktualizacji (`@tauri-apps/plugin-updater`) - nigdy nie
 * instaluje niczego bez wyraźnej akcji użytkownika (przycisk "Pobierz i zainstaluj"). */
export function useUpdater(): {
  state: UpdateState;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartNow: () => Promise<void>;
} {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  async function checkForUpdates(): Promise<void> {
    setState({ kind: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      setState(update ? { kind: "available", update } : { kind: "up-to-date" });
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  }

  async function downloadAndInstall(): Promise<void> {
    if (state.kind !== "available") {
      return;
    }
    const { update } = state;
    setState({ kind: "downloading", progress: null });
    let totalBytes = 0;
    let downloadedBytes = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          setState({
            kind: "downloading",
            progress:
              totalBytes > 0
                ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                : null,
          });
        }
      });
      setState({ kind: "ready-to-restart" });
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  }

  async function restartNow(): Promise<void> {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }

  return { state, checkForUpdates, downloadAndInstall, restartNow };
}
