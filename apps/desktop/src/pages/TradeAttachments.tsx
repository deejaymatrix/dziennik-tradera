import { ArrowDown, ArrowUp, ExternalLink, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DragEvent, KeyboardEvent, ReactElement } from "react";
import { blobToBase64 } from "../app/blobToBase64";
import { MAX_SCREENSHOT_BYTES } from "../app/types/attachment";
import { useAttachments } from "../app/useAttachments";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Modal } from "../ui/components/Modal/Modal";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./TradeAttachments.module.css";

export interface TradeAttachmentsProps {
  tradeId: string;
}

/**
 * Sekcja "Wykres i załączniki" (Faza 6) - w odróżnieniu od pól transakcji powyżej, każda akcja
 * tu jest osobną, natychmiast zapisywaną komendą (nie częścią "Zapisz zmiany"), więc sekcja
 * działa niezależnie od tego, czy karta transakcji jest w trybie odczytu czy edycji.
 */
export function TradeAttachments({ tradeId }: TradeAttachmentsProps): ReactElement {
  const {
    attachments,
    error,
    imagesByAttachmentId,
    addFromPath,
    addFromBytes,
    addLink,
    updateLabel,
    reorder,
    remove,
  } = useAttachments(tradeId);
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  async function addImageBlob(blob: Blob): Promise<void> {
    if (blob.size > MAX_SCREENSHOT_BYTES) {
      showToast(
        `Plik jest zbyt duży - limit to ${Math.floor(MAX_SCREENSHOT_BYTES / (1024 * 1024))} MB.`,
        "error",
      );
      return;
    }
    const bytesBase64 = await blobToBase64(blob);
    await addFromBytes(bytesBase64, null);
  }

  async function withBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wystąpił nieoczekiwany błąd.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFromDisk(): Promise<void> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Obrazy", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
    });
    if (!path || Array.isArray(path)) {
      return;
    }
    await withBusy(() => addFromPath(path, null));
  }

  async function handlePasteFromClipboard(): Promise<void> {
    await withBusy(async () => {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          await addImageBlob(blob);
          return;
        }
      }
      showToast("W schowku nie znaleziono obrazu.", "error");
    });
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }
    void withBusy(() => addImageBlob(file));
  }

  // Świadomie NIE <form>: ta sekcja żyje wewnątrz <form> karty transakcji, a HTML zabrania
  // zagnieżdżania formularzy (React zgłasza to jako błąd, a przeglądarka może wtedy wysłać
  // zewnętrzny formularz zamiast tego bloku). Zatwierdzenie to zwykłe kliknięcie/Enter.
  function submitLink(): void {
    const url = linkUrl.trim();
    if (!url) {
      return;
    }
    void withBusy(async () => {
      await addLink(url, linkLabel.trim() || null);
      setLinkUrl("");
      setLinkLabel("");
      setAddingLink(false);
    });
  }

  function handleLinkFieldKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      // Bez tego Enter w polu adresu/nazwy trafiłby do formularza karty transakcji.
      event.preventDefault();
      submitLink();
    }
  }

  async function handleOpenLink(url: string): Promise<void> {
    if (!window.confirm(`Otworzyć ten adres w domyślnej przeglądarce?\n\n${url}`)) {
      return;
    }
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  }

  function handleDelete(id: string, label: string): void {
    if (!window.confirm(`Usunąć załącznik "${label}"? Tej operacji nie można odwrócić.`)) {
      return;
    }
    void withBusy(() => remove(id));
  }

  function handleMove(index: number, direction: -1 | 1): void {
    if (!attachments) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= attachments.length) {
      return;
    }
    const ids = attachments.map((a) => a.id);
    const [moved] = ids.splice(index, 1);
    if (moved !== undefined) {
      ids.splice(target, 0, moved);
    }
    void withBusy(() => reorder(ids));
  }

  function handleLabelBlur(id: string, currentLabel: string | null, nextValue: string): void {
    const next = nextValue.trim();
    if (next !== (currentLabel ?? "")) {
      void withBusy(() => updateLabel(id, next || null));
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>Wykres i załączniki</h3>
        <div className={styles.headerActions}>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void handlePickFromDisk();
            }}
          >
            Dodaj zdjęcie
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void handlePasteFromClipboard();
            }}
          >
            Wklej ze schowka
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setAddingLink(true)}>
            Dodaj link
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {addingLink && (
        <div className={styles.linkForm}>
          <TextField
            label="Adres (https://...)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleLinkFieldKeyDown}
            required
            autoFocus
          />
          <TextField
            label="Nazwa (opcjonalnie)"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            onKeyDown={handleLinkFieldKeyDown}
          />
          <div className={styles.linkFormActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setAddingLink(false);
                setLinkUrl("");
                setLinkLabel("");
              }}
            >
              Anuluj
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={submitLink}>
              Dodaj
            </Button>
          </div>
        </div>
      )}

      <div
        className={[styles.dropzone, isDragOver ? styles.dropzoneActive : ""]
          .filter(Boolean)
          .join(" ")}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {!attachments && <p className={styles.hint}>Wczytywanie...</p>}
        {attachments?.length === 0 && (
          <p className={styles.hint}>
            Brak załączników - dodaj zdjęcie wykresu albo upuść je tutaj.
          </p>
        )}
        {attachments && attachments.length > 0 && (
          <ul className={styles.list}>
            {attachments.map((attachment, index) => (
              <li key={attachment.id} className={styles.item}>
                {attachment.kind === "screenshot" ? (
                  <button
                    type="button"
                    className={styles.thumbnailButton}
                    onClick={() => setPreviewId(attachment.id)}
                    aria-label={`Podgląd: ${attachment.label ?? "zdjęcie"}`}
                  >
                    {imagesByAttachmentId[attachment.id] ? (
                      <img
                        src={imagesByAttachmentId[attachment.id]}
                        alt=""
                        className={styles.thumbnail}
                      />
                    ) : (
                      <span className={styles.thumbnailPlaceholder} />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.linkRow}
                    onClick={() => {
                      void handleOpenLink(attachment.url ?? "");
                    }}
                  >
                    <Link2 size={16} />
                    <span className={styles.linkText}>{attachment.label ?? attachment.url}</span>
                    <ExternalLink size={14} />
                  </button>
                )}
                <input
                  className={styles.labelInput}
                  placeholder={attachment.kind === "link" ? "Nazwa linku" : "Opis zdjęcia"}
                  defaultValue={attachment.label ?? ""}
                  onBlur={(e) => handleLabelBlur(attachment.id, attachment.label, e.target.value)}
                />
                <div className={styles.itemActions}>
                  <IconButton
                    icon={<ArrowUp size={14} />}
                    aria-label="Przesuń wyżej"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                  />
                  <IconButton
                    icon={<ArrowDown size={14} />}
                    aria-label="Przesuń niżej"
                    disabled={index === attachments.length - 1}
                    onClick={() => handleMove(index, 1)}
                  />
                  <IconButton
                    icon={<Trash2 size={14} />}
                    aria-label="Usuń załącznik"
                    onClick={() =>
                      handleDelete(
                        attachment.id,
                        attachment.label ?? (attachment.kind === "link" ? "link" : "zdjęcie"),
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={previewId !== null} title="Podgląd zdjęcia" onClose={() => setPreviewId(null)}>
        {previewId && imagesByAttachmentId[previewId] && (
          <img src={imagesByAttachmentId[previewId]} alt="" className={styles.previewImage} />
        )}
      </Modal>
    </div>
  );
}
