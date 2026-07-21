import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import type { TradeBalanceContext } from "../app/types/trade";
import { ReadOnlyField } from "../ui/components/ReadOnlyField/ReadOnlyField";
import { SectionCard } from "../ui/components/SectionCard/SectionCard";
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
      <SectionCard surface="alt" padding="sm">
        <ReadOnlyField
          rows={[{ label: "Aktualne saldo konta", value: formatMoney(currentBalance, currency) }]}
        />
      </SectionCard>
    );
  }

  if (!context) {
    return (
      <SectionCard surface="alt" padding="sm">
        <p className={styles.empty}>Wczytywanie salda...</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard surface="alt" padding="sm">
      <ReadOnlyField
        rows={[
          { label: "Saldo przed transakcją", value: formatMoney(context.balance_before, currency) },
          { label: "Saldo po transakcji", value: formatMoney(context.balance_after, currency) },
          { label: "Aktualne saldo konta", value: formatMoney(context.current_balance, currency) },
        ]}
      />
    </SectionCard>
  );
}
