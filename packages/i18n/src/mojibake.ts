/**
 * Wykrywanie typowego mojibake (tekst UTF-8 błędnie zdekodowany jako
 * Windows-1252/Latin-1), zgodnie z docs/specyfikacja-produktu.md §10:
 * "test automatyczny wykrywający typowe mojibake: Ä, Å, â€“, â€™".
 *
 * Żaden z poniższych znaków/sekwencji nie występuje w poprawnie zakodowanym
 * polskim tekście UI, więc ich obecność jest jednoznacznym sygnałem błędu.
 */
const MOJIBAKE_MARKERS = ['Ä', 'Å', 'â€“', 'â€™', 'â€œ', 'â€', 'Ã', 'Â'] as const;

export interface MojibakeMatch {
  readonly marker: string;
  readonly index: number;
}

export function findMojibake(text: string): MojibakeMatch[] {
  const matches: MojibakeMatch[] = [];
  for (const marker of MOJIBAKE_MARKERS) {
    let fromIndex = 0;
    let index = text.indexOf(marker, fromIndex);
    while (index !== -1) {
      matches.push({ marker, index });
      fromIndex = index + marker.length;
      index = text.indexOf(marker, fromIndex);
    }
  }
  return matches;
}

export interface CatalogMojibakeIssue {
  readonly path: string;
  readonly value: string;
  readonly matches: MojibakeMatch[];
}

/**
 * Rekurencyjnie skanuje zagnieżdżony katalog komunikatów (np. `pl` z pl.ts)
 * i zwraca listę problemów - używane w testach każdego pakietu zawierającego
 * teksty widoczne dla użytkownika.
 */
export function scanCatalogForMojibake(
  catalog: Record<string, unknown>,
  pathPrefix = '',
): CatalogMojibakeIssue[] {
  const issues: CatalogMojibakeIssue[] = [];

  for (const [key, value] of Object.entries(catalog)) {
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (typeof value === 'string') {
      const matches = findMojibake(value);
      if (matches.length > 0) {
        issues.push({ path, value, matches });
      }
    } else if (value !== null && typeof value === 'object') {
      issues.push(...scanCatalogForMojibake(value as Record<string, unknown>, path));
    }
  }

  return issues;
}
