import type { ReactElement } from "react";
import { Plus, X } from "lucide-react";
import { decimalSign, subtractDecimalStrings, sumDecimalStrings } from "../app/decimal";
import type { PartialCloseRow } from "../app/tradeForm";
import { blankPartialCloseRow, isBlankPartialCloseRow } from "../app/tradeForm";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { TextField } from "../ui/components/TextField/TextField";
import styles from "./PartialClosesEditor.module.css";

export interface PartialClosesEditorProps {
  rows: PartialCloseRow[];
  onChange: (rows: PartialCloseRow[]) => void;
  /** Lot początkowy transakcji, prosto z pola "Lot" formularza (surowy tekst). */
  volume: string;
  /** Waluta rachunku - kwoty zrealizowanego wyniku są zawsze w niej. */
  currency: string;
  disabled?: boolean;
}

/** Podsumowanie lotów: początkowy, zamknięty i pozostały. `null` oznacza "nie da się policzyć",
 * co pokazujemy jako "Brak danych" - specyfikacja (6.5) zabrania wyświetlania fałszywego `0`,
 * gdy danych po prostu nie ma. */
interface VolumeSummary {
  initial: string | null;
  closed: string;
  remaining: string | null;
}

function summarize(rows: PartialCloseRow[], volume: string): VolumeSummary {
  const filled = rows.filter((row) => !isBlankPartialCloseRow(row));
  const closed = sumDecimalStrings(filled.map((row) => row.closedVolume)) ?? "0";
  const initial = volume.trim() ? (sumDecimalStrings([volume]) ?? null) : null;
  const remaining = initial === null ? null : subtractDecimalStrings(initial, closed);
  return { initial, closed, remaining };
}

/**
 * Częściowe zamykanie pozycji (sekcja 6.9). Dowolna liczba wpisów, każdy niesie WYŁĄCZNIE
 * zamknięty lot i kwotę zrealizowanego wyniku tej części - bez ceny i bez daty, bo przy
 * częściowych zamknięciach źródłem wyniku są wpisane kwoty, a nie przeliczenie z ceny wyjścia.
 *
 * Edycja odbywa się w miejscu (pola są od razu edytowalne), więc osobna akcja "Edytuj" nie jest
 * potrzebna - wpis usuwa się krzyżykiem, dopóki transakcja nie została zapisana.
 */
export function PartialClosesEditor({
  rows,
  onChange,
  volume,
  currency,
  disabled,
}: PartialClosesEditorProps): ReactElement {
  const { initial, closed, remaining } = summarize(rows, volume);
  const remainingSign = remaining === null ? null : decimalSign(remaining);
  const overClosed =
    initial !== null && remaining !== null && remainingSign !== null && remainingSign < 0;

  function updateRow(index: number, patch: Partial<PartialCloseRow>): void {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    onChange([...rows, blankPartialCloseRow()]);
  }

  function removeRow(index: number): void {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.title}>Częściowe zamknięcia</span>
        {!disabled && (
          <Button type="button" variant="secondary" onClick={addRow}>
            <Plus size={16} aria-hidden="true" /> Dodaj częściowe zamknięcie
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className={styles.hint}>
          Brak częściowych zamknięć - wynik policzy się z ceny wejścia i wyjścia.
        </p>
      ) : (
        <>
          <ol className={styles.list}>
            {rows.map((row, index) => (
              // Klucz po indeksie jest tu bezpieczny: wpisów się nie sortuje ani nie przenosi,
              // a usunięcie i tak przebudowuje całą listę od tego miejsca w dół.
              <li key={index} className={styles.row}>
                <span className={styles.number}>{index + 1}.</span>
                <TextField
                  label="Zamknięty lot"
                  inputMode="decimal"
                  placeholder="np. 0,5"
                  value={row.closedVolume}
                  onChange={(e) => updateRow(index, { closedVolume: e.target.value })}
                  disabled={disabled ?? false}
                />
                <TextField
                  label={`Zrealizowany wynik (${currency})`}
                  inputMode="decimal"
                  placeholder="np. -12,40"
                  value={row.realizedPnl}
                  onChange={(e) => updateRow(index, { realizedPnl: e.target.value })}
                  disabled={disabled ?? false}
                />
                {!disabled && (
                  <IconButton
                    icon={<X size={16} />}
                    aria-label={`Usuń częściowe zamknięcie nr ${index + 1}`}
                    onClick={() => removeRow(index)}
                  />
                )}
              </li>
            ))}
          </ol>

          <dl className={[styles.counter, overClosed ? styles.counterError : null]
            .filter(Boolean)
            .join(" ")}
          >
            <div className={styles.counterItem}>
              <dt>Lot początkowy</dt>
              <dd>{initial ?? "Brak danych"}</dd>
            </div>
            <div className={styles.counterItem}>
              <dt>Zamknięty</dt>
              <dd>{closed}</dd>
            </div>
            <div className={styles.counterItem}>
              <dt>Pozostały</dt>
              <dd>{remaining ?? "Brak danych"}</dd>
            </div>
          </dl>

          {overClosed && (
            <p className={styles.error} role="alert">
              Suma zamkniętych lotów przekracza lot początkowy transakcji.
            </p>
          )}
          {!overClosed && remainingSign === 0 && (
            <p className={styles.closedNote}>
              Cały lot zamknięty - transakcja zostanie zapisana jako zamknięta.
            </p>
          )}
        </>
      )}
    </div>
  );
}
