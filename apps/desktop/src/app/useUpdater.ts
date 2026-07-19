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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd.";
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
