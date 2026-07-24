import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAttachments } from "./useAttachments";
import type { Attachment } from "./types/attachment";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("./invokeCommand", () => ({ invokeCommand }));

function zalacznik(id: string, kind: Attachment["kind"]): Attachment {
  return {
    id,
    trade_id: "transakcja-1",
    kind,
    file_path: kind === "screenshot" ? `C:\\zdjecia\\${id}.png` : null,
    url: kind === "link" ? `https://example.com/${id}` : null,
    label: null,
    sha256: null,
    size_bytes: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  };
}

/**
 * `useAttachments` zarządza załącznikami jednej transakcji (Faza 6) - dodawanie, usuwanie,
 * zmiana etykiety, kolejności. Dwie nieoczywiste, ryzykowne części bez dotychczasowego testu:
 * (1) obrazy pobierane są TYLKO dla załączników typu "screenshot" ("link" nie ma podglądu, więc
 * błędne wywołanie `read_attachment_image` dla linku byłoby marnowaniem zapytań albo błędem);
 * (2) `runThenReload` przy niepowodzeniu akcji PONOWNIE RZUCA błąd (nie tylko ustawia `error`) -
 * wywołujący (np. formularz dodawania załącznika) polega na tym, żeby np. nie zamykać okna po
 * nieudanej operacji. Zamiana rethrow na ciche połknięcie błędu byłaby niewidoczna w code review.
 */
describe("useAttachments", () => {
  afterEach(() => {
    invokeCommand.mockReset();
  });

  it("puste tradeId nic nie ładuje (tryb nowej, niezapisanej transakcji)", () => {
    const { result } = renderHook(() => useAttachments(""));
    expect(result.current.attachments).toBeNull();
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("ładuje listę i obrazy WYŁĄCZNIE dla załączników typu 'screenshot', nie dla 'link'", async () => {
    invokeCommand.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "list_attachments") {
        return Promise.resolve([zalacznik("s1", "screenshot"), zalacznik("l1", "link")]);
      }
      if (command === "read_attachment_image") {
        return Promise.resolve(`base64-obrazu-${String(args?.id)}`);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });

    const { result } = renderHook(() => useAttachments("transakcja-1"));
    await waitFor(() => expect(result.current.attachments).not.toBeNull());

    expect(result.current.imagesByAttachmentId).toEqual({ s1: "base64-obrazu-s1" });
    expect(invokeCommand).toHaveBeenCalledWith("read_attachment_image", { id: "s1" });
    expect(invokeCommand).not.toHaveBeenCalledWith("read_attachment_image", { id: "l1" });
  });

  it("addLink() woła komendę z poprawnymi argumentami i odświeża listę po powodzeniu", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_attachments") {
        return Promise.resolve([]);
      }
      if (command === "add_link_attachment") {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });

    const { result } = renderHook(() => useAttachments("transakcja-1"));
    await waitFor(() => expect(result.current.attachments).toEqual([]));

    invokeCommand.mockClear();
    invokeCommand.mockImplementation((command: string) => {
      if (command === "add_link_attachment") {
        return Promise.resolve(undefined);
      }
      if (command === "list_attachments") {
        return Promise.resolve([zalacznik("l1", "link")]);
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });

    await act(async () => {
      await result.current.addLink("https://example.com", "Setup");
    });

    expect(invokeCommand).toHaveBeenCalledWith("add_link_attachment", {
      tradeId: "transakcja-1",
      url: "https://example.com",
      label: "Setup",
    });
    expect(invokeCommand).toHaveBeenCalledWith("list_attachments", { tradeId: "transakcja-1" });
    expect(result.current.attachments).toEqual([zalacznik("l1", "link")]);
  });

  it("nieudana akcja ustawia error i PONOWNIE RZUCA - wywołujący dostaje odrzuconą obietnicę", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_attachments") {
        return Promise.resolve([]);
      }
      if (command === "add_link_attachment") {
        return Promise.reject(new Error("Nieprawidłowy adres URL."));
      }
      return Promise.reject(new Error("nieoczekiwana komenda"));
    });

    const { result } = renderHook(() => useAttachments("transakcja-1"));
    await waitFor(() => expect(result.current.attachments).toEqual([]));

    invokeCommand.mockClear();
    await act(async () => {
      await expect(result.current.addLink("zła-wartość", null)).rejects.toThrow(
        "Nieprawidłowy adres URL.",
      );
    });

    expect(result.current.error).toBe("Nieprawidłowy adres URL.");
    expect(invokeCommand).not.toHaveBeenCalledWith("list_attachments", expect.anything());
  });

  it("reload() ponownie ładuje listę dla aktualnego tradeId", async () => {
    invokeCommand.mockImplementation((command: string) => {
      if (command === "list_attachments") {
        return Promise.resolve([zalacznik("s1", "screenshot")]);
      }
      return Promise.resolve("obraz");
    });

    const { result } = renderHook(() => useAttachments("transakcja-1"));
    await waitFor(() => expect(result.current.attachments).not.toBeNull());

    invokeCommand.mockClear();
    await act(async () => {
      await result.current.reload();
    });
    expect(invokeCommand).toHaveBeenCalledWith("list_attachments", { tradeId: "transakcja-1" });
  });
});
