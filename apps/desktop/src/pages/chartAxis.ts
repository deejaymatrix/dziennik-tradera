/**
 * Szacuje wystarczającą szerokość osi Y wykresu Recharts na podstawie najdłuższej sformatowanej
 * etykiety w danych. Recharts NIE mierzy tego sam - domyślna szerokość osi Y jest stałą liczbą
 * pikseli niezależną od treści (60px), więc przy sztywnej wartości duże kwoty (miliony) po
 * prostu obcinały się poza lewy kraniec SVG (tekst rośnie w lewo od punktu zakotwiczenia, a SVG
 * nie ma czegoś w rodzaju "auto-width") - widoczne jako np. "000 000,00" zamiast całej liczby.
 */
export function estimateYAxisWidth(
  values: number[],
  formatValue: (value: number) => string,
): number {
  if (values.length === 0) {
    return 60;
  }
  const longest = Math.max(...values.map((v) => formatValue(v).length));
  // +2 znaki zapasu na wypadek, gdyby Recharts wygenerował "okrągły" tyk o jedną cyfrę dłuższy
  // niż realne dane (np. maksimum 999 000 -> zaokrąglony tyk 1 000 000).
  return Math.max(60, (longest + 2) * 7 + 16);
}
