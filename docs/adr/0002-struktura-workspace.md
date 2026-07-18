# ADR 0002: Struktura repozytorium (pnpm workspaces)

Status: przyjęte

## Kontekst

Docelowa architektura wymaga rozdziału `domain`, `application`, `infrastructure`, `ui`, ale
Cel 1.1 dostarcza wyłącznie fundament: uruchomiony podgląd, lint, testy, error boundary.
Tworzenie pustych pakietów bez realnej zawartości utrudniałoby utrzymanie i wprowadzałoby
martwy kod.

## Decyzja

- Monorepo pnpm z katalogami `apps/*` i `packages/*` (patrz `pnpm-workspace.yaml`).
- `apps/desktop` to jedyny na razie pakiet: aplikacja Tauri (`src-tauri/`, Rust) + interfejs
  React/TS (`src/`).
- Wspólne narzędzia (TypeScript, ESLint, Prettier) skonfigurowane w katalogu głównym
  (`tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`) i dziedziczone przez pakiety.
- `packages/domain`, `packages/ui` itd. powstaną w kolejnych celach (1.2 — warstwa danych,
  1.3 — system wizualny), gdy będzie w nich realny, przetestowany kod — nie wcześniej.
- Backend Rust (`src-tauri/src`) będzie rozbity na moduły `domain`/`application`/
  `infrastructure` wraz z Celem 1.2, gdy pojawi się warstwa bazy danych do zorganizowania.

## Konsekwencje

Struktura repo rośnie przyrostowo wraz z realnymi funkcjami, zamiast z góry narzucać puste
szkielety modułów.
