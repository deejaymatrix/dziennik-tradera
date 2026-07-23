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

/** Liczba rozłożona na cyfry bez kropki + liczbę miejsc po przecinku, np. `0.30` -> `30`, skala 2. */
interface ScaledDecimal {
  digits: bigint;
  scale: number;
}

function toScaled(value: string): ScaledDecimal | null {
  const normalized = normalizeDecimalInput(value);
  if (normalized === null) {
    return null;
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const digits = BigInt(`${integerPart}${fractionPart}` || "0");
  return { digits: negative ? -digits : digits, scale: fractionPart.length };
}

function fromScaled({ digits, scale }: ScaledDecimal): string {
  if (scale === 0) {
    return digits.toString();
  }
  const negative = digits < 0n;
  const absolute = (negative ? -digits : digits).toString().padStart(scale + 1, "0");
  const integerPart = absolute.slice(0, absolute.length - scale);
  const fractionPart = absolute.slice(absolute.length - scale).replace(/0+$/, "");
  const body = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
  return negative && body !== "0" ? `-${body}` : body;
}

function align(a: ScaledDecimal, b: ScaledDecimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  const lift = (value: ScaledDecimal) => value.digits * 10n ** BigInt(scale - value.scale);
  return [lift(a), lift(b), scale];
}

/**
 * Suma liczb dziesiętnych liczona DOKŁADNIE (na BigInt-ach), nie przez `Number`.
 * `0.1 + 0.2` w liczbach zmiennoprzecinkowych daje `0.30000000000000004`, a licznik lotów
 * pokazujący taką wartość wyglądałby jak błąd aplikacji. Zwraca `null`, jeśli którakolwiek
 * wartość nie jest poprawną liczbą.
 *
 * To wyłącznie arytmetyka DO WYŚWIETLENIA - źródłem prawdy dla zapisanych wartości pozostaje
 * `rust_decimal` po stronie backendu.
 */
export function sumDecimalStrings(values: string[]): string | null {
  let total: ScaledDecimal = { digits: 0n, scale: 0 };
  for (const value of values) {
    const parsed = toScaled(value);
    if (parsed === null) {
      return null;
    }
    const [left, right, scale] = align(total, parsed);
    total = { digits: left + right, scale };
  }
  return fromScaled(total);
}

/** Różnica dwóch liczb dziesiętnych, liczona dokładnie - patrz [`sumDecimalStrings`]. */
export function subtractDecimalStrings(a: string, b: string): string | null {
  const left = toScaled(a);
  const right = toScaled(b);
  if (left === null || right === null) {
    return null;
  }
  const [x, y, scale] = align(left, right);
  return fromScaled({ digits: x - y, scale });
}

/** Znak liczby dziesiętnej bez konwersji na `Number`: -1, 0 albo 1. */
export function decimalSign(value: string): number | null {
  const parsed = toScaled(value);
  if (parsed === null) {
    return null;
  }
  return parsed.digits === 0n ? 0 : parsed.digits < 0n ? -1 : 1;
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

/**
 * Kwota WYNIKU z jawnym znakiem: zysk dostaje „+", strata „-", zero zostaje bez znaku.
 *
 * Używana wszędzie tam, gdzie wartość jest dodatkowo KOLOROWANA na zielono/czerwono. Sam kolor
 * nie może być jedynym nośnikiem informacji (WCAG, sekcja 18 promptu): przy daltonizmie
 * czerwono-zielonym „1 234,56" na zielono i „-1 234,56" na czerwono różnią się wtedy tylko
 * minusem, który łatwo przeoczyć obok cyfr. Jawny plus robi z tego różnicę widoczną od razu.
 *
 * Nie zmieniamy `formatMoney`, bo salda, ceny i prowizje NIE są wynikami - plus przy saldzie
 * konta nic nie znaczy i tylko dodawałby szumu.
 */
export function formatSignedMoney(value: string, currency?: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return value;
  }
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(num);
  return currency ? `${formatted} ${currency}` : formatted;
}
