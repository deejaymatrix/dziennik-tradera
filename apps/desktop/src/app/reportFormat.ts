/** Formatowanie wskaźników raportów do wyświetlenia - wartości same są już policzone w Rust
 * (Decimal jako string), tu tylko prezentacja. Współdzielone przez Dashboard i zakładkę Raporty. */

export function formatNumber(value: string | null, digits = 2): string {
  if (value === null) {
    return "—";
  }
  const num = Number(value);
  return Number.isNaN(num) ? value : num.toFixed(digits);
}

export function formatPercent(value: string | null): string {
  return value === null ? "—" : `${formatNumber(value)}%`;
}

export function formatR(value: string | null): string {
  return value === null ? "—" : `${formatNumber(value)}R`;
}

export function formatMinutes(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value < 60) {
    return `${value} min`;
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} godz.` : `${hours} godz. ${minutes} min`;
}
