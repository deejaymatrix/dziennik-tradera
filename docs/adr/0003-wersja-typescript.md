# ADR 0003: TypeScript przypięty do 6.0.3 (nie najnowszy 7.x)

Status: przyjęte

## Kontekst

Najnowsza opublikowana wersja `typescript` w momencie startu projektu to 7.0.2. Jednak
`typescript-eslint@8.64.0` (wymagany do lintowania ze świadomością typów) deklaruje
`peerDependencies.typescript: ">=4.8.4 <6.1.0"`. Próba użycia TypeScript 7.0.2 kończyła się
twardym crashem `@typescript-eslint/typescript-estree` (`TypeError: Cannot read properties of
undefined (reading 'Cjs')`) — zmierzony, powtarzalny błąd, nie domysł.

## Decyzja

Używamy TypeScript **6.0.3** — najnowszej stabilnej wersji mieszczącej się w zakresie
wspieranym przez `typescript-eslint`.

## Konsekwencje

- Przy podnoszeniu wersji `typescript-eslint` w przyszłości należy sprawdzić, czy zakres
  `peerDependencies.typescript` już obejmuje 7.x, i dopiero wtedy zaktualizować oba pakiety
  razem.
- Nie należy "naprawiać" tego przez ręczne podbicie samego `typescript` bez sprawdzenia
  kompatybilności — spowoduje to powrót crasha lintera.
