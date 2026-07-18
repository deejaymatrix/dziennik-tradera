/**
 * Pomocnicze funkcje dla pól dziesiętnych (kwoty, specyfikacje instrumentów).
 * Backend przechowuje je jako Decimal (string w JSON) - tu tylko WALIDUJEMY
 * i FORMATUJEMY do wyświetlenia. Nigdy nie liczymy na tych wartościach po
 * stronie frontendu (parseFloat/Number tylko do prezentacji, nie do zapisu).
 */

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function isValidDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value.trim());
}

export function formatMoney(value: string, currency?: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return value;
  }
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return currency ? `${formatted} ${currency}` : formatted;
}
