/**
 * Polska odmiana liczebnikowa: 1 → pierwsza forma, 2-4 (poza 12-14) → druga, reszta → trzecia.
 * Np. `pluralPl(2, ["transakcja", "transakcje", "transakcji"])` -> "transakcje".
 */
export function pluralPl(count: number, [one, few, many]: [string, string, string]): string {
  if (count === 1) {
    return one;
  }
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) {
    return few;
  }
  return many;
}
