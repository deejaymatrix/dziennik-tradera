# ADR 0001: Stos technologiczny

Status: przyjęte

## Kontekst

Aplikacja "Dziennik Tradera" ma być lokalną, instalowalną aplikacją desktopową dla Windows,
bez logowania, kont, chmury ani telemetrii. Wymaga trwałej lokalnej bazy danych, obliczeń
finansowych na typie dziesiętnym oraz w przyszłości podpisanego mechanizmu aktualizacji
i instalatora `.exe`.

## Decyzja

- **Tauri 2** jako warstwa aplikacji desktopowej i pakowania.
- **Rust** jako backend: baza danych, pliki, obliczenia krytyczne, kopie zapasowe, aktualizacje.
- **React 19 + TypeScript** dla interfejsu, budowane przez **Vite**.
- **SQLite** jako lokalna baza danych, dostępna wyłącznie z warstwy Rust (frontend nigdy nie
  wykonuje surowych zapytań SQL — komunikacja przez typowane komendy `tauri::command`).
- **pnpm workspaces** do organizacji monorepo (`apps/*`, `packages/*`).

## Konsekwencje

- Wszystkie obliczenia finansowe (P&L, R, drawdown itd.) mają jedno autorytatywne miejsce:
  Rust. UI może pokazywać podgląd "na oko" (np. natychmiastowy podgląd ryzyka w formularzu),
  ale wynik zapisywany i raportowany zawsze pochodzi z backendu.
- Warstwa domenowa (reguły, obliczenia) nie może zależeć od Reacta ani bezpośrednio od SQLite.
- Brak kont/logowania/chmury/telemetrii nie jest tymczasowym uproszczeniem — jest trwałym
  wymaganiem produktu i nie będzie dodawane w kolejnych aktualizacjach bez osobnej decyzji.
