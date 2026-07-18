# Postęp prac

Ostatnia aktualizacja: 2026-07-18

## Cel 1.1 — Repozytorium, standardy i uruchomiony podgląd — 🚧 w trakcie

**Co działa:**

- Monorepo pnpm (`apps/desktop`), TypeScript ściśle typowany (`tsconfig.base.json`, strict +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` itd.), ESLint (flat config,
  reguły ze świadomością typów) i Prettier skonfigurowane i przechodzą bez błędów.
- Aplikacja Tauri 2 + React 19 + TypeScript + Vite 8 wygenerowana i oczyszczona z domyślnej
  zawartości demo (brak przycisku "Greet", brak logo-linków).
- Rust backend (`apps/desktop/src-tauri`) z pierwszą realną komendą `get_app_status`
  (wersja + środowisko), `cargo check`/`cargo clippy -D warnings`/`cargo fmt --check`/
  `cargo test` przechodzą czysto.
- Globalny `ErrorBoundary` (przechwytuje błędy renderowania, pokazuje ekran odzyskania
  zamiast pustej strony) + globalne nasłuchy `error`/`unhandledrejection`.
- Ekran bezpiecznego startu (`SafeStartScreen`) pokazujący uczciwy status: wersję i
  środowisko z backendu Rust, albo jawny komunikat gdy okno działa poza kontekstem Tauri.
- Skrypty `start-dev.ps1` / `start-dev.bat` (instalują zależności tylko gdy trzeba, potem
  uruchamiają podgląd).
- `docs/adr/0001–0003` (stos technologiczny, struktura workspace, przypięcie TypeScript 6.0.3
  z powodu niekompatybilności `typescript-eslint` z TypeScript 7).

**Przetestowane:**

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` — zielone.
- `pnpm test` (Vitest): `ErrorBoundary` renderuje dzieci normalnie i ekran odzyskania po
  rzuconym błędzie.
- `cargo test`: `get_app_status` zwraca poprawną wersję i znaną etykietę środowiska.
- `pnpm dev` uruchomiony: Vite gotowy w ~444ms na `http://localhost:1420`, `cargo` zbudował
  i uruchomił `desktop.exe` bez błędów/paniki w logu.
- Podgląd w przeglądarce (sam Vite, bez IPC Tauri) zweryfikowany wizualnie: tytuł, treść
  ekranu startowego i poprawny, nie awaryjny komunikat "Backend Rust: niedostępny" —
  brak błędów w konsoli poza standardowymi logami debug/info Vite/React.

**Nie zweryfikowane wizualnie:** natywne okno `desktop.exe` (agent nie ma dostępu do zrzutu
ekranu okien natywnych Windows, tylko do treści w przeglądarce) — proces wystartował i
zakończył się bez błędu w logu, ale samo okno na ekranie powinien potwierdzić użytkownik.

**Następny krok:** Cel 1.2 — schemat SQLite, migracje wersjonowane, repozytoria Rust, WAL,
kopia przed migracją, testy integracyjne CRUD.

## Pozostałe cele Etapu 1

Patrz [ROADMAP.md](ROADMAP.md) — jeszcze nierozpoczęte.
