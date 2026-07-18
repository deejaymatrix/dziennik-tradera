import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, Money, sumMoney } from './money.js';

describe('Money', () => {
  it('dodaje wartości w tej samej walucie z pełną precyzją dziesiętną', () => {
    // Klasyczny przypadek, w którym float JS (0.1 + 0.2) daje 0.30000000000000004.
    const a = Money.of('0.1', 'USD');
    const b = Money.of('0.2', 'USD');

    expect(a.add(b).toString()).toBe('0.3');
  });

  it('odrzuca dodawanie różnych walut zamiast cicho je zsumować', () => {
    const eur = Money.of('100', 'EUR');
    const usd = Money.of('100', 'USD');

    expect(() => eur.add(usd)).toThrow(CurrencyMismatchError);
  });

  it('sumMoney sumuje listę wartości w jednej walucie', () => {
    const values = [Money.of('10.50', 'PLN'), Money.of('2.25', 'PLN'), Money.of('-1.75', 'PLN')];

    expect(sumMoney(values, 'PLN').toString()).toBe('11');
  });

  it('rozróżnia wartość dodatnią, ujemną i zero', () => {
    expect(Money.of('-5', 'EUR').isNegative()).toBe(true);
    expect(Money.zero('EUR').isZero()).toBe(true);
    expect(Money.of('5', 'EUR').isNegative()).toBe(false);
  });
});
