import type { ReactElement } from "react";
import { formatDecimal, formatSignedMoney } from "../app/decimal";
import type { Trade } from "../app/types/trade";
import { TRADE_SIDE_LABELS } from "../app/types/trade";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { Modal } from "../ui/components/Modal/Modal";
import { Table, tableStyles } from "../ui/components/Table/Table";
import styles from "./DayTradesModal.module.css";

export interface DayTradesModalProps {
  /** Etykieta dnia do wyświetlenia w tytule, np. "10 lipca 2026". */
  dateLabel: string;
  trades: Trade[];
  currency: string;
  onClose: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Podgląd transakcji, do których odnosi się kliknięty dzień w Kalendarzu (sekcja "Kalendarz" -
 * dzień pokazuje tylko zagregowany wynik i liczbę transakcji, bez możliwości zobaczenia, KTÓRE
 * to transakcje). Wyłącznie do odczytu - edycja zostaje na stronie "Historia transakcji".
 */
export function DayTradesModal({
  dateLabel,
  trades,
  currency,
  onClose,
}: DayTradesModalProps): ReactElement {
  return (
    <Modal open onClose={onClose} title={`Transakcje - ${dateLabel}`} size="wide">
      <div className={styles.previewTable}>
        <Table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Kierunek</th>
              <th className={tableStyles.numeric}>Wolumen</th>
              <th>Otwarcie</th>
              <th>Zamknięcie</th>
              <th className={tableStyles.numeric}>Wynik netto</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td>{trade.instrument_spec_snapshot?.display_symbol ?? "—"}</td>
                <td>
                  <Badge variant={trade.side === "buy" ? "info" : "accent"}>
                    {TRADE_SIDE_LABELS[trade.side]}
                  </Badge>
                </td>
                <td className={tableStyles.numeric}>
                  {trade.volume ? formatDecimal(trade.volume) : "—"}
                </td>
                <td>{formatTime(trade.opened_at)}</td>
                <td>{formatTime(trade.closed_at)}</td>
                <td className={tableStyles.numeric}>
                  {trade.net_pnl !== null ? formatSignedMoney(trade.net_pnl, currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onClose}>
          Zamknij
        </Button>
      </div>
    </Modal>
  );
}
