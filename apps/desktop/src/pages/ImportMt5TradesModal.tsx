import { useState } from "react";
import type { ReactElement } from "react";
import { invokeCommand } from "../app/invokeCommand";
import type { AccountWithBalance } from "../app/types/account";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { Select } from "../ui/components/Select/Select";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./ImportMt5TradesModal.module.css";

interface Mt5PreviewRow {
  ticket: string;
  symbol: string;
  side: string;
  volume: string;
  open_time: string;
  close_time: string;
  instrument_id: string | null;
  already_imported: boolean;
}

interface Mt5ImportPreview {
  row_count: number;
  matched_count: number;
  already_imported_count: number;
  unmatched_symbols: string[];
  rows: Mt5PreviewRow[];
}

interface Mt5ImportResult {
  imported_count: number;
  skipped_unmatched: number;
  skipped_duplicate: number;
  errors: string[];
}

export interface ImportMt5TradesModalProps {
  accounts: AccountWithBalance[];
  onClose: () => void;
  onImported: () => Promise<void>;
}

/**
 * Kreator importu historii transakcji z terminala MT5 (Historia → prawy klik → "Zapisz jako
 * Raport", plik .xlsx). Ten sam wzorzec co `ImportBrokerModal`: wybór pliku → podgląd BEZ zapisu
 * → zatwierdzenie → atomowy import. Wybór konta docelowego jest JAWNYM, pierwszym krokiem tego
 * kreatora (nie domyślnym/dziedziczonym z innej strony) - transakcje z importu muszą trafić na
 * to konto, które użytkownik świadomie wskazał, nie na cokolwiek było ostatnio wybrane gdzie
 * indziej. Rozpoznanie instrumentu wymaga, żeby wybrane konto miało przypisany szablon z już
 * zaimportowanymi instrumentami brokera (symbole typu "XAUUSDs" mają sens tylko w kontekście
 * konkretnego szablonu) - stąd niedopasowane symbole są jawnie wypisane w podglądzie zamiast po
 * cichu pomijane.
 */
export function ImportMt5TradesModal({
  accounts,
  onClose,
  onImported,
}: ImportMt5TradesModalProps): ReactElement {
  const [accountId, setAccountId] = useState("");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<Mt5ImportPreview | null>(null);
  const [result, setResult] = useState<Mt5ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleAccountChange(nextAccountId: string): void {
    setAccountId(nextAccountId);
    setSourcePath(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function handlePickFile(): Promise<void> {
    if (!accountId) {
      return;
    }
    setError(null);
    setResult(null);
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Raport historii MT5", extensions: ["xlsx"] }],
    });
    if (!path || Array.isArray(path)) {
      return;
    }
    setBusy(true);
    try {
      const preview = await invokeCommand<Mt5ImportPreview>("preview_mt5_import", {
        accountId,
        sourcePath: path,
      });
      setSourcePath(path);
      setPreview(preview);
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
      const importResult = await invokeCommand<Mt5ImportResult>("import_mt5_trades", {
        accountId,
        sourcePath,
      });
      setResult(importResult);
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import się nie powiódł.");
    } finally {
      setBusy(false);
    }
  }

  const importableCount = preview
    ? preview.rows.filter((r) => r.instrument_id && !r.already_imported).length
    : 0;

  return (
    <Modal open onClose={onClose} title="Importuj historię transakcji z MT5">
      <div className={styles.form}>
        <p className={styles.note}>
          Wskaż konto, a potem plik xlsx wyeksportowany z terminala MT5 (Historia → prawy klik →
          &bdquo;Zapisz jako Raport&rdquo;). Zaimportowane zostaną tylko zamknięte pozycje, których
          symbol rozpoznano w szablonie instrumentów tego konta i które nie były jeszcze importowane
          - nic nie zostanie zapisane, dopóki nie klikniesz &bdquo;Importuj&rdquo;.
        </p>

        <Select
          label="Konto docelowe"
          value={accountId}
          onChange={(e) => handleAccountChange(e.target.value)}
          options={[
            { value: "", label: "Wybierz konto..." },
            ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
          ]}
        />

        <div className={styles.pickRow}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handlePickFile()}
            disabled={busy || !accountId}
            loading={busy}
          >
            {sourcePath ? "Zmień plik" : "Wybierz plik xlsx"}
          </Button>
          {sourcePath && <span className={styles.fileName}>{sourcePath.split(/[\\/]/).pop()}</span>}
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {preview && !result && (
          <>
            <div className={styles.summary}>
              <Badge variant="info">Rozpoznano {preview.row_count} pozycji</Badge>
              <Badge variant={importableCount > 0 ? "profit" : "neutral"}>
                Do zaimportowania: {importableCount}
              </Badge>
              {preview.already_imported_count > 0 && (
                <Badge variant="neutral">Już zaimportowane: {preview.already_imported_count}</Badge>
              )}
              {preview.unmatched_symbols.length > 0 && (
                <Badge variant="loss">
                  Nierozpoznane symbole: {preview.unmatched_symbols.length}
                </Badge>
              )}
            </div>

            {preview.unmatched_symbols.length > 0 && (
              <ul className={styles.unmatchedList}>
                {preview.unmatched_symbols.map((s) => (
                  <li key={s}>
                    &bdquo;{s}&rdquo; - brak w szablonie instrumentów tego konta, import tej pozycji
                    zostanie pominięty.
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.previewTable}>
              <Table>
                <thead>
                  <tr>
                    <th>Bilet</th>
                    <th>Symbol</th>
                    <th>Kierunek</th>
                    <th className={tableStyles.numeric}>Wolumen</th>
                    <th>Otwarcie</th>
                    <th>Zamknięcie</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr key={r.ticket}>
                      <td>{r.ticket}</td>
                      <td>{r.symbol}</td>
                      <td>{r.side === "buy" ? "BUY" : "SELL"}</td>
                      <td className={tableStyles.numeric}>{r.volume}</td>
                      <td>{r.open_time}</td>
                      <td>{r.close_time}</td>
                      <td>
                        {r.already_imported ? (
                          <Badge variant="neutral">już zaimportowana</Badge>
                        ) : r.instrument_id ? (
                          <Badge variant="profit">gotowa</Badge>
                        ) : (
                          <Badge variant="loss">nierozpoznany symbol</Badge>
                        )}
                      </td>
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

        {result && (
          <div className={styles.summary}>
            <Badge variant="profit">Zaimportowano: {result.imported_count}</Badge>
            {result.skipped_duplicate > 0 && (
              <Badge variant="neutral">Pominięte (duplikat): {result.skipped_duplicate}</Badge>
            )}
            {result.skipped_unmatched > 0 && (
              <Badge variant="loss">
                Pominięte (nierozpoznany symbol): {result.skipped_unmatched}
              </Badge>
            )}
            {result.errors.length > 0 && (
              <ul className={styles.unmatchedList}>
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {result ? "Zamknij" : "Anuluj"}
          </Button>
          {!result && (
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleImport()}
              disabled={busy || !preview || importableCount === 0}
              loading={busy}
            >
              Importuj
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
