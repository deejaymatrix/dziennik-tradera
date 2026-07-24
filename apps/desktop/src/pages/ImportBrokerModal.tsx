import { useState } from "react";
import type { ReactElement } from "react";
import { invokeCommand } from "../app/invokeCommand";
import type { BrokerTemplate } from "../app/types/instrument";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { Table, tableStyles } from "../ui/components/Table/Table";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./ImportBrokerModal.module.css";

interface ImportPreviewRow {
  source_symbol: string;
  display_symbol: string;
  canonical_symbol: string;
  variant: string;
  currency_profit: string;
  contract_size: string;
}

interface ImportPreview {
  row_count: number;
  rows: ImportPreviewRow[];
  warnings: string[];
}

export interface ImportBrokerModalProps {
  /** Szablon, do którego wjadą instrumenty - import jest zawsze w kontekście jednego szablonu. */
  template: BrokerTemplate;
  onClose: () => void;
  onImported: () => Promise<void>;
}

/**
 * Kreator importu danych brokera z pliku CSV (eksport parametrów instrumentów z MT5).
 * Krok 1: wybór pliku → podgląd BEZ zapisu. Krok 2: zatwierdzenie → atomowy import do
 * wybranego szablonu. Sam plik czyta backend (komenda przyjmuje ścieżkę), tu idzie tylko ścieżka.
 *
 * Import wchodzi do szablonu dokładnie RAZ - blokada powtórnego importu jest po stronie bazy
 * (jedna transakcja ze sprawdzeniem), tutaj tylko nie pokazujemy przycisku, gdy szablon jest już
 * wypełniony.
 */
export function ImportBrokerModal({
  template,
  onClose,
  onImported,
}: ImportBrokerModalProps): ReactElement {
  const { showToast } = useToast();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePickFile(): Promise<void> {
    setError(null);
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Dane instrumentów brokera", extensions: ["csv", "txt"] }],
    });
    if (!path || Array.isArray(path)) {
      return;
    }
    setBusy(true);
    try {
      const result = await invokeCommand<ImportPreview>("preview_broker_import", {
        sourcePath: path,
      });
      setSourcePath(path);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się odczytać pliku.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!sourcePath) {
      return;
    }
    setBusy(true);
    try {
      const updated = await invokeCommand<BrokerTemplate>("import_instruments_into_template", {
        templateId: template.id,
        sourcePath,
      });
      showToast(
        `Zaimportowano ${updated.instrument_count} instrumentów do szablonu "${updated.name}".`,
        "success",
      );
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import się nie powiódł.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Importuj dane brokera do "${template.name}"`}>
      <div className={styles.form}>
        <p className={styles.note}>
          Wskaż plik CSV z eksportem parametrów instrumentów z terminala MT5. Aplikacja odczyta
          tabelę i wgra ją do tego szablonu - nic nie zostanie zapisane, dopóki nie klikniesz
          &bdquo;Importuj&rdquo;. Szablon przyjmuje import tylko raz; dane innego brokera wgraj do
          nowego szablonu.
        </p>

        <div className={styles.pickRow}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handlePickFile()}
            disabled={busy}
          >
            {sourcePath ? "Zmień plik" : "Wybierz plik CSV"}
          </Button>
          {sourcePath && <span className={styles.fileName}>{sourcePath.split(/[\\/]/).pop()}</span>}
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {preview && (
          <>
            <div className={styles.summary}>
              <Badge variant="info">Rozpoznano {preview.row_count} instrumentów</Badge>
              {preview.warnings.map((w) => (
                <Badge key={w} variant="neutral">
                  {w}
                </Badge>
              ))}
            </div>
            <div className={styles.previewTable}>
              <Table>
                <thead>
                  <tr>
                    <th>Symbol brokera</th>
                    <th>Wyświetlany</th>
                    <th>Wariant</th>
                    <th>Waluta</th>
                    <th className={tableStyles.numeric}>Kontrakt</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr key={r.source_symbol}>
                      <td>{r.source_symbol}</td>
                      <td>{r.display_symbol}</td>
                      <td>{r.variant === "MINI" ? <Badge variant="neutral">MINI</Badge> : "—"}</td>
                      <td>{r.currency_profit}</td>
                      <td className={tableStyles.numeric}>{r.contract_size}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {preview.rows.length > 50 && (
                <p className={styles.note}>...i {preview.rows.length - 50} więcej.</p>
              )}
            </div>
          </>
        )}

        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleImport()}
            disabled={busy || !preview}
            loading={busy}
          >
            Importuj
          </Button>
        </div>
      </div>
    </Modal>
  );
}
