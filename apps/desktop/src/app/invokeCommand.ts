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
  // Tauri odrzuca zwykłym stringiem m.in. przy niezarejestrowanej komendzie albo braku
  // uprawnienia - warto pokazać ten tekst zamiast zgadywać przyczynę.
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "Komenda zakończyła się błędem, ale backend nie zwrócił czytelnego komunikatu.";
}

/** Czy strona działa wewnątrz powłoki Tauri (a nie w zwykłej przeglądarce na serwerze Vite). */
export function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Wywołuje komendę Tauri i normalizuje błąd do zwykłego Error z czytelnym komunikatem. */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  // Sprawdzane JAWNIE, żeby brak backendu nie udawał błędu komendy - i odwrotnie: żeby realny
  // błąd backendu nie był mylnie opisywany jako "brak środowiska Tauri".
  if (!hasTauriRuntime()) {
    throw new Error(
      `Brak środowiska Tauri - komenda "${command}" wymaga uruchomienia aplikacji desktopowej (start-dev.bat), a nie samego adresu w przeglądarce.`,
    );
  }

  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(extractErrorMessage(error), { cause: error });
  }
}
