import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import type { TradeCalculation } from "../app/types/trade";
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
      <div className={styles.card}>
        <p className={styles.empty}>
          Uzupełnij instrument, cenę wejścia i wolumen, żeby zobaczyć podgląd wyniku.
        </p>
      </div>
    );
  }

  const rows: { label: string; value: string; tone?: "profit" | "loss" }[] = [
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
    <div className={styles.card}>
      <div className={styles.grid}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span
              className={[
                styles.value,
                row.tone === "profit" && styles.profit,
                row.tone === "loss" && styles.loss,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
