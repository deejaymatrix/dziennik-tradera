export type TrashEntityType = "account" | "trade" | "strategy" | "interval" | "trading_rule";

export const TRASH_ENTITY_LABELS: Record<TrashEntityType, string> = {
  account: "Konto",
  trade: "Transakcja",
  strategy: "Strategia",
  interval: "Interwał",
  trading_rule: "Pytanie (Zasady handlu)",
};

export interface TrashItem {
  entity_type: TrashEntityType;
  id: string;
  label: string;
  deleted_at: string;
  dependency_note: string | null;
}

export interface EmptyTrashFailure {
  label: string;
  message: string;
}

export interface EmptyTrashResult {
  purged: number;
  failed: EmptyTrashFailure[];
}
