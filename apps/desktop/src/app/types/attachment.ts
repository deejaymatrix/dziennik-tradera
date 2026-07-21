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
