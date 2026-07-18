import { describe, expect, it } from 'vitest';
import { weightedAveragePrice } from './weighted-average-price.js';

describe('weightedAveragePrice', () => {
  it('liczy średnią ważoną cenę dla wielu nóg wejścia', () => {
    const result = weightedAveragePrice([
      { price: '100', volume: '1' },
      { price: '110', volume: '1' },
    ]);

    expect(result.reliable).toBe(true);
    if (result.reliable) {
      expect(result.averagePrice.toString()).toBe('105');
      expect(result.totalVolume.toString()).toBe('2');
    }
  });

  it('waży cenę wolumenem, a nie liczy zwykłej średniej arytmetycznej', () => {
    const result = weightedAveragePrice([
      { price: '100', volume: '3' },
      { price: '110', volume: '1' },
    ]);

    expect(result.reliable).toBe(true);
    if (result.reliable) {
      // (100*3 + 110*1) / 4 = 102.5, a nie (100+110)/2 = 105
      expect(result.averagePrice.toString()).toBe('102.5');
    }
  });

  it('nie zmyśla wyniku przy braku nóg - zwraca jawną informację o niewiarygodności', () => {
    const result = weightedAveragePrice([]);

    expect(result.reliable).toBe(false);
  });

  it('nie zmyśla wyniku przy nieprawidłowym (zerowym) wolumenie', () => {
    const result = weightedAveragePrice([{ price: '100', volume: '0' }]);

    expect(result.reliable).toBe(false);
  });

  it('nie zmyśla wyniku przy ujemnej cenie', () => {
    const result = weightedAveragePrice([{ price: '-10', volume: '1' }]);

    expect(result.reliable).toBe(false);
  });
});
