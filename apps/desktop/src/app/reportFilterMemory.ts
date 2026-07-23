import type { ReportFilterBarValue } from "../pages/ReportFilterBar";

/**
 * Zapamiętane filtry raportów - OSOBNO dla każdej zakładki (Ustawienia → Domyślne wartości →
 * Raporty → „Zapamiętuj filtry osobno dla każdego raportu").
 *
 * To STAN interfejsu, nie ustawienie, więc mieszka w localStorage. Ustawieniem jest sam
 * przełącznik, który leży w preferencjach użytkownika.
 */
const STORAGE_PREFIX = "dziennik-tradera.report-filter:";

export function loadRememberedFilter(reportId: string): ReportFilterBarValue | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${reportId}`);
    return raw ? (JSON.parse(raw) as ReportFilterBarValue) : null;
  } catch {
    // Uszkodzony zapis nie może wywrócić raportów - wracamy do filtru domyślnego.
    return null;
  }
}

export function saveRememberedFilter(reportId: string, filter: ReportFilterBarValue): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${reportId}`, JSON.stringify(filter));
  } catch {
    // Brak miejsca w localStorage to nie powód, żeby przerwać pracę z raportem.
  }
}

/** Czyści zapamiętane filtry wszystkich raportów - używane po wyłączeniu ustawienia, żeby
 * następne włączenie nie przywróciło filtrów sprzed miesięcy. */
export function clearRememberedFilters(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}
