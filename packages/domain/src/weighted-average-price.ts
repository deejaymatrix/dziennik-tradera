import Decimal from 'decimal.js';

export interface PriceLeg {
  readonly price: Decimal.Value;
  readonly volume: Decimal.Value;
}

/**
 * Wynik obliczenia nigdy nie jest zmyślony przy niepełnych/błędnych danych wejściowych
 * (zgodnie z docs/specyfikacja-produktu.md §4 decyzja 23) - w takim przypadku zwracamy
 * jawną informację o niewiarygodności zamiast liczby.
 */
export type WeightedAveragePriceResult =
  | { readonly reliable: true; readonly averagePrice: Decimal; readonly totalVolume: Decimal }
  | { readonly reliable: false; readonly reason: string };

/**
 * Średnia ważona cena wejścia/wyjścia na podstawie osobnych nóg (wiele wejść/wyjść),
 * zgodnie z docs/specyfikacja-produktu.md §7.5.
 */
export function weightedAveragePrice(legs: readonly PriceLeg[]): WeightedAveragePriceResult {
  if (legs.length === 0) {
    return { reliable: false, reason: 'Brak nóg wejścia/wyjścia do obliczenia średniej ceny.' };
  }

  let totalVolume = new Decimal(0);
  let weightedSum = new Decimal(0);

  for (const leg of legs) {
    const volume = new Decimal(leg.volume);
    const price = new Decimal(leg.price);

    if (volume.lessThanOrEqualTo(0)) {
      return { reliable: false, reason: `Nieprawidłowy wolumen nogi: ${volume.toString()}.` };
    }
    if (price.lessThanOrEqualTo(0)) {
      return { reliable: false, reason: `Nieprawidłowa cena nogi: ${price.toString()}.` };
    }

    totalVolume = totalVolume.plus(volume);
    weightedSum = weightedSum.plus(price.times(volume));
  }

  return {
    reliable: true,
    averagePrice: weightedSum.dividedBy(totalVolume),
    totalVolume,
  };
}
