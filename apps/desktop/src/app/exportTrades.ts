import { invokeCommand } from "./invokeCommand";
import type { ReportFilterBarValue } from "../pages/ReportFilterBar";

export type ExportFormat = "csv" | "xlsx" | "pdf";

/** Kształt zawężenia oczekiwany przez `ExportFilter` po stronie Rusta (snake_case). */
export interface ExportFilterPayload {
  instrument_id: string | null;
  strategy_id: string | null;
  interval_id: string | null;
  side: "buy" | "sell" | null;
  year: number | null;
  month: number | null;
}

const COMMANDS: Record<ExportFormat, string> = {
  csv: "export_trades_csv",
  xlsx: "export_trades_xlsx",
  pdf: "export_trades_pdf",
};

export function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "konto";
}

/**
 * Zamienia filtr paska Raportów na zawężenie eksportu. `null` oznacza „nie zawężaj tego wymiaru",
 * więc puste pole filtru NIE może trafić do backendu jako pusty napis - tam pusty napis byłby
 * prawdziwym identyfikatorem i wycinałby wszystko.
 */
export function toExportFilter(
  value: ReportFilterBarValue,
  reportKind?: string,
): ExportFilterPayload {
  // Raport roczny ignoruje miesiąc na ekranie, więc eksport też musi go zignorować - inaczej
  // plik byłby węższy niż to, co użytkownik przed chwilą oglądał.
  const month = reportKind === "yearly" ? null : value.month ? Number(value.month) : null;
  return {
    instrument_id: value.instrumentId || null,
    strategy_id: value.strategyId || null,
    interval_id: value.intervalId || null,
    side: value.side || null,
    year: value.year ? Number(value.year) : null,
    month,
  };
}

/** Człon nazwy pliku opisujący zawężenie, żeby kilka eksportów nie nadpisywało się nawzajem. */
export function exportFileNameSuffix(filter: ExportFilterPayload): string {
  const czesci: string[] = [];
  if (filter.year !== null) {
    czesci.push(
      filter.month !== null
        ? `${filter.year}-${String(filter.month).padStart(2, "0")}`
        : String(filter.year),
    );
  }
  if (filter.side !== null) {
    czesci.push(filter.side);
  }
  return czesci.join("-");
}

export interface ExportTradesOptions {
  accountId: string;
  accountName: string;
  format: ExportFormat;
  /** Brak filtru = pełny zrzut konta (ekran „Dane"). */
  filter?: ExportFilterPayload | undefined;
}

/**
 * Wspólny przepływ eksportu: okno zapisu pliku + wywołanie komendy. Zwraca `false`, gdy
 * użytkownik anulował wybór pliku - wtedy nie ma o czym informować, bo nic się nie stało.
 */
export async function exportTrades(options: ExportTradesOptions): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const suffix = options.filter ? exportFileNameSuffix(options.filter) : "";
  const defaultPath = [sanitizeFileNamePart(options.accountName), "transakcje", suffix]
    .filter(Boolean)
    .join("-");
  const destination = await save({
    defaultPath: `${defaultPath}.${options.format}`,
    filters: [{ name: options.format.toUpperCase(), extensions: [options.format] }],
  });
  if (!destination) {
    return false;
  }
  await invokeCommand(COMMANDS[options.format], {
    accountId: options.accountId,
    destinationPath: destination,
    filter: options.filter ?? null,
  });
  return true;
}
