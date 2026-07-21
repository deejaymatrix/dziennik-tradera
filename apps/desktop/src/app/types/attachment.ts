export type AttachmentKind = "screenshot" | "link";

/** Ten sam limit co `domain::attachment::MAX_SCREENSHOT_BYTES` po stronie Rust - backend jest
 * autorytatywny, to tylko szybka informacja dla użytkownika przed wysłaniem dużego pliku. */
export const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;

export interface Attachment {
  id: string;
  trade_id: string;
  kind: AttachmentKind;
  file_path: string | null;
  url: string | null;
  label: string | null;
  sha256: string | null;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
}

/** Odpowiedź komendy `read_screenshot_candidate` - zwalidowane zdjęcie z dysku, jeszcze nigdzie
 * nie zapisane (dla nowej transakcji bez id). */
export interface ScreenshotCandidate {
  bytes_base64: string;
  mime: string;
}

/** Załącznik nowej, jeszcze niezapisanej transakcji - trzymany lokalnie w formularzu i wysyłany
 * na serwer dopiero po udanym `create_trade` (transakcja musi najpierw dostać id). Zdjęcia jako
 * base64 (podgląd budowany z `mime`), linki jako adres+nazwa. */
export interface PendingAttachment {
  id: string;
  kind: AttachmentKind;
  bytesBase64?: string;
  mime?: string;
  url?: string;
  label: string | null;
}
