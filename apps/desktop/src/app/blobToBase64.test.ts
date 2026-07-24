import { describe, expect, it } from "vitest";
import { blobToBase64 } from "./blobToBase64";

/**
 * Koduje załączniki (wklejenie ze schowka, upuszczenie pliku) do base64 przed wysłaniem przez
 * IPC do komendy Tauri. Błąd tutaj cicho zepsułby zapisany plik (np. zostawiony prefiks
 * "data:...;base64," w bajtach, albo obcięty pierwszy znak przy złym indeksie przecinka) -
 * użytkownik zobaczyłby uszkodzony obraz dopiero przy próbie otwarcia załącznika. Zero testów.
 */
describe("blobToBase64", () => {
  it("koduje zawartość blob jako base64 bez prefiksu data URL", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const base64 = await blobToBase64(blob);
    expect(base64.startsWith("data:")).toBe(false);
    expect(base64).not.toContain(",");
    expect(atob(base64)).toBe("hello");
  });

  it("poprawnie koduje bajty binarne (sygnatura PNG), nie tylko tekst", async () => {
    const bajty = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const blob = new Blob([bajty], { type: "image/png" });
    const base64 = await blobToBase64(blob);
    const zdekodowane = Uint8Array.from(atob(base64), (znak) => znak.charCodeAt(0));
    expect(Array.from(zdekodowane)).toEqual(Array.from(bajty));
  });

  it("odrzuca obietnicę z błędem, gdy odczyt pliku się nie powiedzie", async () => {
    const oryginalny = globalThis.FileReader;
    class ZepsutyFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      error = new Error("symulowany błąd odczytu");
      readAsDataURL(): void {
        queueMicrotask(() => this.onerror?.());
      }
    }
    // @ts-expect-error - podmiana konstruktora na potrzeby testu ścieżki błędu
    globalThis.FileReader = ZepsutyFileReader;
    try {
      await expect(blobToBase64(new Blob(["x"]))).rejects.toThrow("symulowany błąd odczytu");
    } finally {
      globalThis.FileReader = oryginalny;
    }
  });
});
