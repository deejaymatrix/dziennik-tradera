export type CashOperationKind = "deposit" | "withdrawal" | "adjustment";

export interface CashOperation {
  id: string;
  account_id: string;
  kind: CashOperationKind;
  amount: string;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

export interface NewCashOperationInput {
  account_id: string;
  kind: CashOperationKind;
  amount: string;
  occurred_at: string;
  note: string | null;
}

export const CASH_OPERATION_KIND_LABELS: Record<CashOperationKind, string> = {
  deposit: "Wpłata",
  withdrawal: "Wypłata",
  adjustment: "Korekta",
};
