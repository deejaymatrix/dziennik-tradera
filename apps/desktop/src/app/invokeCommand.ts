/**
 * Błąd zwrócony przez komendę Tauri, gdy backend zwróci Err(AppError) - patrz
 * error.rs po stronie Rust (custom Serialize: {code, message}). Odrzucona
 * obietnica invoke() dostaje dokładnie ten kształt, nie instancję Error.
 */
export interface AppErrorPayload {
  code: string;
  message: string;
}

function isAppErrorPayload(value: unknown): value is AppErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export function extractErrorMessage(error: unknown): string {
  if (isAppErrorPayload(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Brak środowiska Tauri (uruchomiono poza aplikacją desktopową).";
}

/** Wywołuje komendę Tauri i normalizuje błąd do zwykłego Error z czytelnym komunikatem. */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(extractErrorMessage(error), { cause: error });
  }
}
