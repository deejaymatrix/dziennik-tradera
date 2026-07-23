import type { ReactElement } from "react";
import { Pencil, Pin, PinOff, X } from "lucide-react";
import { formatMoney, formatSignedMoney } from "../app/decimal";
import type { Trade } from "../app/types/trade";
import { TRADE_SIDE_LABELS, TRADE_STATUS_LABELS } from "../app/types/trade";
import { Badge } from "../ui/components/Badge/Badge";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import styles from "./TradeInspector.module.css";

export interface TradeInspectorProps {
  trade: Trade;
  currency: string;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onEdit: () => void;
  /** Otwiera pełną kartę transakcji - inspektor pokazuje skrót, nie wszystko. */
  onOpenFull: () => void;
}

function Row({ label, value }: { label: string; value: string | null }): ReactElement | null {
  if (value === null || value === "") {
    return null;
  }
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

/**
 * Panel szczegółów transakcji obok tabeli (sekcja 7 promptu, model Split View + Inspector).
 *
 * Jest TYLKO DO ODCZYTU - edycja wymaga jawnego kliknięcia „Edytuj", dokładnie jak w karcie
 * transakcji. Nie zasłania tabeli: użytkownik przegląda listę i podgląda kolejne pozycje bez
 * opuszczania widoku.
 */
export function TradeInspector({
  trade,
  currency,
  pinned,
  onTogglePin,
  onClose,
  onEdit,
  onOpenFull,
}: TradeInspectorProps): ReactElement {
  const netto = trade.net_pnl;
  const zamkniecia = trade.partial_closes;

  return (
    <aside className={styles.panel} aria-label={`Szczegóły transakcji ${trade.display_number}`}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.number}>#{trade.display_number}</span>
          <span className={styles.symbol}>
            {trade.instrument_spec_snapshot?.display_symbol ?? "— bez instrumentu —"}
          </span>
          <Badge variant={trade.status === "closed" ? "neutral" : "accent"}>
            {TRADE_STATUS_LABELS[trade.status]}
          </Badge>
        </div>
        <div className={styles.headerActions}>
          <IconButton
            icon={pinned ? <PinOff size={16} /> : <Pin size={16} />}
            aria-label={pinned ? "Odepnij panel szczegółów" : "Przypnij panel szczegółów"}
            onClick={onTogglePin}
          />
          <IconButton
            icon={<X size={16} />}
            aria-label="Zamknij panel szczegółów"
            onClick={onClose}
          />
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Wynik</h3>
          <p
            className={[
              styles.result,
              netto === null ? null : Number(netto) >= 0 ? styles.profit : styles.loss,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {netto === null ? "Brak danych" : formatSignedMoney(netto, currency)}
          </p>
          <dl className={styles.list}>
            <Row label="Brutto" value={trade.gross_pnl && formatMoney(trade.gross_pnl, currency)} />
            <Row label="Punkty" value={trade.pnl_points} />
            <Row label="R" value={trade.pnl_r} />
            <Row
              label="Ryzyko"
              value={trade.risk_amount && formatMoney(trade.risk_amount, currency)}
            />
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Podstawowe</h3>
          <dl className={styles.list}>
            <Row label="Kierunek" value={TRADE_SIDE_LABELS[trade.side]} />
            <Row label="Lot" value={trade.volume} />
            <Row label="Cena wejścia" value={trade.entry_price} />
            <Row label="Cena wyjścia" value={trade.exit_price} />
            <Row label="Stop loss" value={trade.stop_loss} />
            <Row label="Take profit" value={trade.take_profit} />
            <Row label="Interwał" value={trade.interval} />
            <Row label="Sesja" value={trade.session} />
            <Row label="Strategia" value={trade.strategy_snapshot?.name ?? null} />
          </dl>
        </section>

        {zamkniecia.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Częściowe zamknięcia ({zamkniecia.length})</h3>
            <dl className={styles.list}>
              {zamkniecia.map((z, i) => (
                <Row
                  key={i}
                  label={`Lot ${z.closed_volume}`}
                  value={formatMoney(z.realized_pnl, currency)}
                />
              ))}
            </dl>
          </section>
        )}

        {(trade.plan_before ?? trade.conclusion) && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notatki</h3>
            {trade.plan_before && <p className={styles.note}>{trade.plan_before}</p>}
            {trade.conclusion && <p className={styles.note}>{trade.conclusion}</p>}
          </section>
        )}
      </div>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={onOpenFull}>
          Pełna karta
        </Button>
        <Button variant="primary" onClick={onEdit} disabled={Boolean(trade.deleted_at)}>
          <Pencil size={16} aria-hidden="true" /> Edytuj
        </Button>
      </footer>
    </aside>
  );
}
