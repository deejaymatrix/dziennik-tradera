import { useEffect, useState } from "react";
import { invokeCommand } from "./invokeCommand";
import type { Attachment } from "./types/attachment";

export interface UseAttachmentsResult {
  attachments: Attachment[] | null;
  error: string | null;
  imagesByAttachmentId: Record<string, string>;
  reload: () => Promise<void>;
  addFromPath: (sourcePath: string, label: string | null) => Promise<void>;
  addFromBytes: (bytesBase64: string, label: string | null) => Promise<void>;
  addLink: (url: string, label: string | null) => Promise<void>;
  updateLabel: (id: string, label: string | null) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Zarządza załącznikami jednej transakcji (Faza 6) - w odróżnieniu od pól samej transakcji,
 * każda akcja tutaj to niezależna, natychmiast zapisywana komenda (nie część "Zapisz zmiany"
 * formularza), więc sekcja działa też w trybie tylko-do-odczytu karty transakcji.
 * Puste `tradeId` = nowa, jeszcze niezapisana transakcja (tryb oczekujący w `TradeAttachments`)
 * - hook wtedy nic nie pobiera i nie wywołuje żadnych komend. */
export function useAttachments(tradeId: string): UseAttachmentsResult {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagesByAttachmentId, setImagesByAttachmentId] = useState<Record<string, string>>({});

  async function load(id: string): Promise<void> {
    if (!id) {
      return;
    }
    setError(null);
    try {
      const data = await invokeCommand<Attachment[]>("list_attachments", { tradeId: id });
      setAttachments(data);
      const images = await Promise.all(
        data
          .filter((a) => a.kind === "screenshot")
          .map(
            async (a) =>
              [a.id, await invokeCommand<string>("read_attachment_image", { id: a.id })] as const,
          ),
      );
      setImagesByAttachmentId(Object.fromEntries(images));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tradeId);
  }, [tradeId]);

  async function runThenReload(action: () => Promise<unknown>): Promise<void> {
    setError(null);
    try {
      await action();
      await load(tradeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.");
      throw e;
    }
  }

  return {
    attachments,
    error,
    imagesByAttachmentId,
    reload: () => load(tradeId),
    addFromPath: (sourcePath, label) =>
      runThenReload(() =>
        invokeCommand("add_screenshot_attachment_from_path", { tradeId, sourcePath, label }),
      ),
    addFromBytes: (bytesBase64, label) =>
      runThenReload(() =>
        invokeCommand("add_screenshot_attachment_from_bytes", { tradeId, bytesBase64, label }),
      ),
    addLink: (url, label) =>
      runThenReload(() => invokeCommand("add_link_attachment", { tradeId, url, label })),
    updateLabel: (id, label) =>
      runThenReload(() => invokeCommand("update_attachment_label", { id, label })),
    reorder: (orderedIds) =>
      runThenReload(() => invokeCommand("reorder_attachments", { tradeId, orderedIds })),
    remove: (id) => runThenReload(() => invokeCommand("delete_attachment", { id })),
  };
}
