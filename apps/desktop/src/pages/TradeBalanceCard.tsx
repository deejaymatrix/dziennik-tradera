import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import type { TradeBalanceContext } from "../app/types/trade";
import styles from "./TradeBalanceCard.module.css";

export interface TradeBalanceCardProps {
  isEdit: boolean;
  context: TradeBalanceContext | null;
  currentBalance: string;
  currency?: string;
}

/** Saldo konta w kontekście tej transakcji (sekcja "Saldo przed/po/aktualne"). Dla nowej,
 * jeszcze niezapisanej transakcji pokazuje tylko aktualne saldo konta - przed/po nie mają
 * jeszcze sensu, bo transakcja nie istnieje. Dla edytowanej transakcji pokazuje migawkę
 * sprzed rozpoczęcia edycji (nie przelicza się na żywo przy zmianie pól w formularzu). */
export function TradeBalanceCard({
  isEdit,
  context,
  currentBalance,
  currency,
}: TradeBalanceCardProps): ReactElement {
  if (!isEdit) {
    return (
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.label}>Aktualne saldo konta</span>
          <span className={styles.value}>{formatMoney(currentBalance, currency)}</span>
        </div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className={styles.card}>
        <p className={styles.empty}>Wczytywanie salda...</p>
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: "Saldo przed transakcją", value: context.balance_before },
    { label: "Saldo po transakcji", value: context.balance_after },
    { label: "Aktualne saldo konta", value: context.current_balance },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.grid}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.value}>{formatMoney(row.value, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
