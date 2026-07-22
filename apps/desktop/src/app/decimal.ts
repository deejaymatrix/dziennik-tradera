/**
 * Pomocnicze funkcje dla pól dziesiętnych (kwoty, specyfikacje instrumentów).
 * Backend przechowuje je jako Decimal (string w JSON) - tu tylko WALIDUJEMY
 * i FORMATUJEMY do wyświetlenia. Nigdy nie liczymy na tych wartościach po
 * stronie frontendu (parseFloat/Number tylko do prezentacji, nie do zapisu).
 */

/** Postać już znormalizowana: opcjonalny znak, kropka jako JEDYNY separator dziesiętny. */
const CANONICAL_DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Sprowadza to, co użytkownik wpisał, do jednej kanonicznej reprezentacji dziesiętnej
 * wysyłanej do backendu (`rust_decimal` parsuje WYŁĄCZNIE kropkę). Polska klawiatura numeryczna
 * daje przecinek, więc `1,23` i `1.23` muszą znaczyć to samo - inaczej pole lota po cichu
 * lądowało jako `null` i nic się nie przeliczało. Spacje (także twarde) są ignorowane, bo w
 * liczbie pełnią rolę separatora tysięcy (`1 000,50`), nigdy części znaczącej.
 * Zwraca `null`, gdy wartość nie jest poprawną liczbą.
 */
export function normalizeDecimalInput(value: string): string | null {
  const compact = value.replace(/\s/g, "").replace(",", ".");
  if (!compact || !CANONICAL_DECIMAL_PATTERN.test(compact)) {
    return null;
  }

  let normalized = compact.startsWith("+") ? compact.slice(1) : compact;
  if (normalized.startsWith(".")) {
    normalized = `0${normalized}`;
  } else if (normalized.startsWith("-.")) {
    normalized = `-0${normalized.slice(1)}`;
  }
  if (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function isValidDecimalString(value: string): boolean {
  return normalizeDecimalInput(value) !== null;
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
