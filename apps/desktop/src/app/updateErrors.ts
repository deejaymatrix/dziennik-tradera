/**
 * Tłumaczenie błędów aktualizacji na język, w którym da się coś zrobić.
 *
 * Sam przepływ aktualizacji (sprawdzanie, harmonogram, pobieranie, restart) mieszka
 * w `UpdateMonitorProvider` - jednym centralnym serwisie. Ten plik został przy jednej
 * funkcji, bo jest ona potrzebna w kilku miejscach i nie ma nic wspólnego z Reactem.
 */

/**
 * Tłumaczy surowy błąd wtyczki aktualizacji na zdanie, z którym użytkownik może coś zrobić.
 *
 * Wtyczka zwraca komunikaty po angielsku, w rodzaju „Could not fetch a valid release JSON from
 * the remote" - dla osoby nietechnicznej to nic nie znaczy, a co gorsza brzmi jak awaria
 * aplikacji, podczas gdy w praktyce oznacza po prostu brak sieci albo brak opublikowanego
 * jeszcze wydania. Surowa treść zostaje dołączona na końcu, żeby nie utracić informacji
 * przydatnej przy zgłaszaniu problemu.
 */
export function describeUpdateError(error: unknown): string {
  const surowy = error instanceof Error ? error.message : String(error);
  const n = surowy.toLowerCase();

  // Brak internetu / zablokowane połączenie.
  if (
    n.includes("network") ||
    n.includes("dns") ||
    n.includes("timed out") ||
    n.includes("timeout") ||
    n.includes("connection") ||
    n.includes("unreachable") ||
    n.includes("failed to lookup")
  ) {
    return "Brak połączenia z internetem - nie udało się sprawdzić aktualizacji. Aplikacja działa normalnie bez sieci; spróbuj później.";
  }

  // Wydanie jeszcze nieopublikowane albo endpoint nie zwraca manifestu.
  if (
    n.includes("404") ||
    n.includes("not found") ||
    n.includes("release json") ||
    n.includes("could not fetch")
  ) {
    return "Serwer aktualizacji nie ma jeszcze żadnego opublikowanego wydania. To normalne przed pierwszym wydaniem - nie jest to błąd aplikacji.";
  }

  // Podpis się nie zgadza - jedyny przypadek, w którym trzeba użytkownika zatrzymać.
  if (n.includes("signature") || n.includes("verif") || n.includes("pubkey")) {
    return "Podpis pobranej aktualizacji się nie zgadza - instalacja została przerwana dla bezpieczeństwa. NIE instaluj tej wersji ręcznie i zgłoś problem.";
  }

  return `Nie udało się sprawdzić aktualizacji: ${surowy}`;
}
