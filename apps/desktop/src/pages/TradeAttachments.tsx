import { ArrowDown, ArrowUp, ExternalLink, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DragEvent, KeyboardEvent, ReactElement } from "react";
import { blobToBase64 } from "../app/blobToBase64";
import { invokeCommand } from "../app/invokeCommand";
import { MAX_SCREENSHOT_BYTES } from "../app/types/attachment";
import type { PendingAttachment, ScreenshotCandidate } from "../app/types/attachment";
import { useAttachments } from "../app/useAttachments";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { Modal } from "../ui/components/Modal/Modal";
import { TextField } from "../ui/components/TextField/TextField";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./TradeAttachments.module.css";

export interface TradeAttachmentsProps {
  /** Id ZAPISANEJ transakcji - każda akcja jest wtedy osobną, natychmiast zapisywaną komendą.
   * Brak = tryb oczekujący dla NOWEJ transakcji: załączniki żyją lokalnie w `pending` i trafiają
   * na serwer dopiero po udanym `create_trade` (patrz TradeFormModal.handleSubmit). */
  tradeId?: string;
  pending?: PendingAttachment[];
  onPendingChange?: (pending: PendingAttachment[]) => void;
}

/** Jeden wiersz listy niezależnie od trybu - zapisany załącznik albo oczekujący lokalny. */
interface ViewItem {
  id: string;
  kind: "screenshot" | "link";
  previewUri: string | null;
  url: string | null;
  label: string | null;
}

/**
 * Sekcja "Wykres i załączniki" (Faza 6) na karcie transakcji. Dla zapisanej transakcji działa
 * też w trybie tylko-do-odczytu karty (akcje są niezależne od "Zapisz zmiany"); dla nowej
 * transakcji zbiera załączniki lokalnie, zanim transakcja dostanie id.
 */
export function TradeAttachments({
  tradeId,
  pending,
  onPendingChange,
}: TradeAttachmentsProps): ReactElement {
  const isPendingMode = tradeId === undefined;
  const pendingItems = pending ?? [];
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
  } = useAttachments(tradeId ?? "");
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const items: ViewItem[] = isPendingMode
    ? pendingItems.map((p) => ({
        id: p.id,
        kind: p.kind,
        previewUri:
          p.kind === "screenshot" && p.bytesBase64
            ? `data:${p.mime ?? "image/png"};base64,${p.bytesBase64}`
            : null,
        url: p.url ?? null,
        label: p.label,
      }))
    : (attachments ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
        previewUri: imagesByAttachmentId[a.id] ?? null,
        url: a.url,
        label: a.label,
      }));
  const loading = !isPendingMode && attachments === null;

  function appendPending(item: PendingAttachment): void {
    onPendingChange?.([...pendingItems, item]);
  }

  async function addImageBlob(blob: Blob): Promise<void> {
    if (blob.size > MAX_SCREENSHOT_BYTES) {
      showToast(
        `Plik jest zbyt duży - limit to ${Math.floor(MAX_SCREENSHOT_BYTES / (1024 * 1024))} MB.`,
        "error",
      );
      return;
    }
    const bytesBase64 = await blobToBase64(blob);
    if (isPendingMode) {
      appendPending({
        id: crypto.randomUUID(),
        kind: "screenshot",
        bytesBase64,
        mime: blob.type || "image/png",
        label: null,
      });
      return;
    }
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
    await withBusy(async () => {
      if (isPendingMode) {
        // Nowa transakcja nie ma jeszcze id - backend tylko waliduje plik i oddaje bajty,
        // właściwy zapis nastąpi po utworzeniu transakcji.
        const candidate = await invokeCommand<ScreenshotCandidate>("read_screenshot_candidate", {
          sourcePath: path,
        });
        appendPending({
          id: crypto.randomUUID(),
          kind: "screenshot",
          bytesBase64: candidate.bytes_base64,
          mime: candidate.mime,
          label: null,
        });
        return;
      }
      await addFromPath(path, null);
    });
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
    if (isPendingMode) {
      // Ta sama reguła co w backendzie (domain::attachment::is_valid_https_url) - walidacja tu
      // tylko dla natychmiastowej informacji zwrotnej, autorytatywna jest ta przy zapisie.
      if (!/^https:\/\/\S+$/i.test(url)) {
        showToast("Link musi być prawidłowym adresem zaczynającym się od https://.", "error");
        return;
      }
      appendPending({
        id: crypto.randomUUID(),
        kind: "link",
        url,
        label: linkLabel.trim() || null,
      });
      setLinkUrl("");
      setLinkLabel("");
      setAddingLink(false);
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
    if (isPendingMode) {
      onPendingChange?.(pendingItems.filter((p) => p.id !== id));
      return;
    }
    if (!window.confirm(`Usunąć załącznik "${label}"? Tej operacji nie można odwrócić.`)) {
      return;
    }
    void withBusy(() => remove(id));
  }

  function handleMove(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= items.length) {
      return;
    }
    if (isPendingMode) {
      const next = [...pendingItems];
      const [moved] = next.splice(index, 1);
      if (moved !== undefined) {
        next.splice(target, 0, moved);
      }
      onPendingChange?.(next);
      return;
    }
    const ids = items.map((a) => a.id);
    const [moved] = ids.splice(index, 1);
    if (moved !== undefined) {
      ids.splice(target, 0, moved);
    }
    void withBusy(() => reorder(ids));
  }

  function handleLabelBlur(id: string, currentLabel: string | null, nextValue: string): void {
    const next = nextValue.trim();
    if (next === (currentLabel ?? "")) {
      return;
    }
    if (isPendingMode) {
      onPendingChange?.(pendingItems.map((p) => (p.id === id ? { ...p, label: next || null } : p)));
      return;
    }
    void withBusy(() => updateLabel(id, next || null));
  }

  const previewItem = previewId ? (items.find((i) => i.id === previewId) ?? null) : null;

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

      {isPendingMode && pendingItems.length > 0 && (
        <p className={styles.hint}>
          Załączniki zostaną zapisane razem z transakcją po kliknięciu "Zapisz".
        </p>
      )}

      {!isPendingMode && error && (
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
        {loading && <p className={styles.hint}>Wczytywanie...</p>}
        {!loading && items.length === 0 && (
          <p className={styles.hint}>
            Brak załączników - dodaj zdjęcie wykresu albo upuść je tutaj.
          </p>
        )}
        {items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item, index) => (
              <li key={item.id} className={styles.item}>
                {item.kind === "screenshot" ? (
                  <button
                    type="button"
                    className={styles.thumbnailButton}
                    onClick={() => setPreviewId(item.id)}
                    aria-label={`Podgląd: ${item.label ?? "zdjęcie"}`}
                  >
                    {item.previewUri ? (
                      <img src={item.previewUri} alt="" className={styles.thumbnail} />
                    ) : (
                      <span className={styles.thumbnailPlaceholder} />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.linkRow}
                    onClick={() => {
                      void handleOpenLink(item.url ?? "");
                    }}
                  >
                    <Link2 size={16} />
                    <span className={styles.linkText}>{item.label ?? item.url}</span>
                    <ExternalLink size={14} />
                  </button>
                )}
                <input
                  className={styles.labelInput}
                  placeholder={item.kind === "link" ? "Nazwa linku" : "Opis zdjęcia"}
                  defaultValue={item.label ?? ""}
                  onBlur={(e) => handleLabelBlur(item.id, item.label, e.target.value)}
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
                    disabled={index === items.length - 1}
                    onClick={() => handleMove(index, 1)}
                  />
                  <IconButton
                    icon={<Trash2 size={14} />}
                    aria-label="Usuń załącznik"
                    onClick={() =>
                      handleDelete(
                        item.id,
                        item.label ?? (item.kind === "link" ? "link" : "zdjęcie"),
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={previewItem !== null} title="Podgląd zdjęcia" onClose={() => setPreviewId(null)}>
        {previewItem?.previewUri && (
          <img src={previewItem.previewUri} alt="" className={styles.previewImage} />
        )}
      </Modal>
    </div>
  );
}
