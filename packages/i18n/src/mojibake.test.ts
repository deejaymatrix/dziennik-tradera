import { describe, expect, it } from 'vitest';
import { findMojibake, scanCatalogForMojibake } from './mojibake.js';
import { pl } from './pl.js';

describe('findMojibake', () => {
  it('nie znajduje niczego w poprawnie zakodowanym polskim tekście', () => {
    expect(findMojibake('Nie można zapisać transakcji — spróbuj ponownie.')).toEqual([]);
  });

  it('wykrywa mojibake typu "Å¼" (błędnie zdekodowane "ż")', () => {
    // "Nie można" błędnie zdekodowane jako Windows-1252 daje m.in. sekwencję "Å¼"
    const broken = 'Nie moÅ¼na zapisać transakcji.';
    expect(findMojibake(broken).length).toBeGreaterThan(0);
  });

  it('wykrywa mojibake pauzy półpauzy "â€“"', () => {
    expect(findMojibake('Zakres dat: 1 â€“ 5 stycznia').length).toBeGreaterThan(0);
  });

  it('wykrywa mojibake apostrofu "â€™"', () => {
    expect(findMojibake("trader's dziennik â€™").length).toBeGreaterThan(0);
  });
});

describe('scanCatalogForMojibake', () => {
  it('cały bieżący katalog komunikatów pl jest wolny od mojibake', () => {
    const issues = scanCatalogForMojibake(pl);
    expect(issues).toEqual([]);
  });

  it('wykrywa problem w zagnieżdżonym katalogu testowym', () => {
    const issues = scanCatalogForMojibake({
      common: { save: 'ZapiszÄ…' },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('common.save');
  });
});
