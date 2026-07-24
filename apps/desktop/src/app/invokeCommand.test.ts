import { afterEach, describe, expect, it, vi } from "vitest";
import { extractErrorMessage, hasTauriRuntime, invokeCommand } from "./invokeCommand";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const DOMYSLNY_KOMUNIKAT =
  "Komenda zakończyła się błędem, ale backend nie zwrócił czytelnego komunikatu.";

/**
 * `invokeCommand` jest JEDYNYM miejscem, przez które każde wywołanie backendu w aplikacji
 * przechodzi - błąd w normalizacji komunikatu błędu (`extractErrorMessage`) albo w wykrywaniu
 * środowiska Tauri (`hasTauriRuntime`) wpływa na to, co użytkownik widzi przy KAŻDEJ awarii
 * KAŻDEJ komendy. Dotąd zero testów - wszystkie inne testy podmieniają cały moduł przez
 * `vi.mock("./invokeCommand", ...)`, więc jego własna logika nigdy nie była wykonana.
 */
describe("extractErrorMessage", () => {
  it("czyta message z payloadu błędu Rust (AppErrorPayload)", () => {
    expect(extractErrorMessage({ code: "NOT_FOUND", message: "Nie znaleziono konta." })).toBe(
      "Nie znaleziono konta.",
    );
  });

  it("czyta message z instancji Error", () => {
    expect(extractErrorMessage(new Error("zwykły błąd JS"))).toBe("zwykły błąd JS");
  });

  it("zwraca zwykły string bez zmian (Tauri odrzuca stringiem np. przy nieznanej komendzie)", () => {
    expect(extractErrorMessage("command not found")).toBe("command not found");
  });

  it("pusty string i same spacje NIE są traktowane jako czytelny komunikat", () => {
    expect(extractErrorMessage("")).toBe(DOMYSLNY_KOMUNIKAT);
    expect(extractErrorMessage("   ")).toBe(DOMYSLNY_KOMUNIKAT);
  });

  it("obiekt z polem message, które NIE jest stringiem, nie liczy się jako AppErrorPayload", () => {
    expect(extractErrorMessage({ message: 42 })).toBe(DOMYSLNY_KOMUNIKAT);
  });

  it("null/undefined/liczba dostają domyślny komunikat", () => {
    expect(extractErrorMessage(null)).toBe(DOMYSLNY_KOMUNIKAT);
    expect(extractErrorMessage(undefined)).toBe(DOMYSLNY_KOMUNIKAT);
    expect(extractErrorMessage(404)).toBe(DOMYSLNY_KOMUNIKAT);
  });
});

describe("hasTauriRuntime", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("false poza powłoką Tauri (zwykła przeglądarka)", () => {
    expect(hasTauriRuntime()).toBe(false);
  });

  it("true wewnątrz powłoki Tauri", () => {
    // @ts-expect-error - właściwość wstrzykiwana przez runtime Tauri, brak typów
    window.__TAURI_INTERNALS__ = {};
    expect(hasTauriRuntime()).toBe(true);
  });
});

describe("invokeCommand", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    invoke.mockReset();
  });

  it("odrzuca z czytelnym komunikatem PL, gdy nie ma środowiska Tauri - i NIE woła invoke()", async () => {
    await expect(invokeCommand("get_accounts")).rejects.toThrow(
      /Brak środowiska Tauri.*get_accounts/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("zwraca wynik invoke() bez zmian, gdy środowisko Tauri jest obecne", async () => {
    // @ts-expect-error - właściwość wstrzykiwana przez runtime Tauri
    window.__TAURI_INTERNALS__ = {};
    invoke.mockResolvedValue({ id: "konto-1" });

    await expect(invokeCommand("get_account", { id: "konto-1" })).resolves.toEqual({
      id: "konto-1",
    });
    expect(invoke).toHaveBeenCalledWith("get_account", { id: "konto-1" });
  });

  it("normalizuje odrzucenie invoke() do zwykłego Error z czytelnym message i zachowanym cause", async () => {
    // @ts-expect-error - właściwość wstrzykiwana przez runtime Tauri
    window.__TAURI_INTERNALS__ = {};
    const payload = { code: "VALIDATION", message: "Nieprawidłowa data." };
    invoke.mockRejectedValue(payload);

    await expect(invokeCommand("save_trade")).rejects.toMatchObject({
      message: "Nieprawidłowa data.",
      cause: payload,
    });
  });
});
