import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import type { TradeCalculation } from "../app/types/trade";
import { ReadOnlyField } from "../ui/components/ReadOnlyField/ReadOnlyField";
import type { ReadOnlyFieldRow } from "../ui/components/ReadOnlyField/ReadOnlyField";
import { SectionCard } from "../ui/components/SectionCard/SectionCard";
import styles from "./TradePreviewCard.module.css";

export interface TradePreviewCardProps {
  calculation: TradeCalculation | null;
  currency?: string;
}

function formatDecimalNumber(value: string | null, digits = 2): string {
  if (value === null) {
    return "—";
  }
  const num = Number(value);
  return Number.isNaN(num) ? value : num.toFixed(digits);
}

/** Podgląd na żywo wyniku silnika przeliczeń (domain::trade_calculations) - ryzyko, RR,
 * przewidywany wynik i wynik zrealizowany, odświeżany przy każdej zmianie pól formularza. */
export function TradePreviewCard({ calculation, currency }: TradePreviewCardProps): ReactElement {
  if (!calculation) {
    return (
      <SectionCard surface="alt" padding="sm">
        <p className={styles.empty}>
          Uzupełnij instrument, cenę wejścia i wolumen, żeby zobaczyć podgląd wyniku.
        </p>
      </SectionCard>
    );
  }

  const rows: ReadOnlyFieldRow[] = [
    {
      label: "Ryzyko (SL)",
      value:
        calculation.risk_amount !== null
          ? `${formatMoney(calculation.risk_amount, currency)}${
              calculation.risk_percent !== null
                ? ` (${formatDecimalNumber(calculation.risk_percent)}%)`
                : ""
            }`
          : "—",
    },
    {
      label: "Potencjalny zysk (TP)",
      value:
        calculation.reward_amount !== null ? formatMoney(calculation.reward_amount, currency) : "—",
    },
    {
      label: "RR planowane",
      value: calculation.rr_planned !== null ? formatDecimalNumber(calculation.rr_planned) : "—",
    },
    {
      label: "Wynik brutto",
      value: calculation.gross_pnl !== null ? formatMoney(calculation.gross_pnl, currency) : "—",
    },
    {
      label: "Wynik netto",
      value: calculation.net_pnl !== null ? formatMoney(calculation.net_pnl, currency) : "—",
      ...(calculation.net_pnl !== null
        ? { tone: Number(calculation.net_pnl) >= 0 ? "profit" : "loss" }
        : {}),
    },
    {
      label: "R (wynik/ryzyko)",
      value: calculation.pnl_r !== null ? `${formatDecimalNumber(calculation.pnl_r)}R` : "—",
    },
    {
      label: "Punkty",
      value: calculation.pnl_points !== null ? formatDecimalNumber(calculation.pnl_points, 1) : "—",
    },
  ];

  return (
    <SectionCard surface="alt" padding="sm">
      <ReadOnlyField rows={rows} />
    </SectionCard>
  );
}
