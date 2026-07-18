import Decimal from 'decimal.js';

/**
 * Waluta jako kod ISO 4217 (np. "USD", "EUR", "PLN").
 * Walidacja formatu (3 wielkie litery) odbywa się w packages/data-contracts (Zod),
 * ten typ jest wyłącznie oznaczeniem semantycznym w warstwie domenowej.
 */
export type CurrencyCode = string;

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly left: CurrencyCode,
    public readonly right: CurrencyCode,
  ) {
    super(
      `Nie można wykonać operacji na różnych walutach bez jawnego przeliczenia: ${left} i ${right}.`,
    );
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * Wartość pieniężna oparta na typie dziesiętnym (decimal.js), nigdy na `number`.
 * Zgodnie z docs/decyzje-architektoniczne.md (ADR-0004) i specyfikacją §4 decyzja 38.
 */
export class Money {
  private constructor(
    private readonly amount: Decimal,
    public readonly currency: CurrencyCode,
  ) {}

  static of(amount: Decimal.Value, currency: CurrencyCode): Money {
    return new Money(new Decimal(amount), currency);
  }

  static zero(currency: CurrencyCode): Money {
    return Money.of(0, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  multiply(factor: Decimal.Value): Money {
    return new Money(this.amount.times(factor), this.currency);
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  toDecimal(): Decimal {
    return this.amount;
  }

  /** Reprezentacja tekstowa z pełną precyzją dziesiętną, do przechowywania/transferu. */
  toString(): string {
    return this.amount.toString();
  }

  /** Zaokrąglenie wyłącznie do prezentacji - nie używać w dalszych obliczeniach. */
  toFixed(decimalPlaces: number): string {
    return this.amount.toFixed(decimalPlaces);
  }
}

export function sumMoney(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce((total, value) => total.add(value), Money.zero(currency));
}
