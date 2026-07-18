# Postęp prac

Ostatnia aktualizacja: 2026-07-18

## Cel 1.1 — Repozytorium, standardy i uruchomiony podgląd — ✅ ukończony

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

## Cel 1.2 — Baza danych, migracje i bezpieczeństwo zapisu — 🚧 w trakcie

**Co działa:**

- Pełny schemat SQLite w `db/migrations/0001_init.sql`: `app_settings`, `accounts`,
  `cash_operations`, `instruments`, `strategies`, `trades`, `trade_executions`,
  `daily_notes`, `attachments`, `audit_log` — zaprojektowany pod przyszłe wiele
  wejść/częściowe zamknięcia (osobna encja `trade_executions`) i snapshoty
  instrumentu/strategii w transakcji (bez niszczących migracji później).
- Silnik migracji (`db/migrations.rs`): tabela `schema_migrations` z sumami kontrolnymi
  (wykrywa zmianę pliku migracji po zastosowaniu), każda migracja w osobnej transakcji,
  automatyczna kopia bazy (SQLite Backup API, nie zwykłe kopiowanie pliku) przed pierwszą
  oczekującą migracją przy aktualizacji istniejącej bazy, kontrola integralności
  (`PRAGMA integrity_check` + `pragma_foreign_key_check`) po migracjach.
- Połączenie SQLite z WAL, wymuszonymi kluczami obcymi i `busy_timeout` (`db/connection.rs`).
- Pierwszy pionowy przekrój warstw domain/application/infrastructure: `AccountRepository`
  (trait w domenie) → `SqliteAccountRepository` (infrastruktura, transakcyjny zapis +
  wpis w `audit_log` w tej samej transakcji) → `AccountsService` (aplikacja) → komendy Tauri
  `create_account`/`list_accounts`/`update_account`/`archive_account`/`restore_account`.
- Kwoty finansowe jako `rust_decimal::Decimal` (nigdy float), zapisywane jako TEXT;
  zweryfikowano testem, że JSON do frontendu serializuje je jako string, nie liczbę.
- `AppError` z czytelnym komunikatem dla użytkownika i osobnym logiem diagnostycznym
  (`logging.rs`, plik lokalny, bez telemetrii) na surowe błędy SQL.
- `DbState::Failed` — jeśli baza nie otworzy się/nie zmigruje przy starcie, komendy zwracają
  jawny błąd zamiast udawać sukces; `get_database_status` na ekranie startowym pokazuje
  prawdziwy stan (otwarta + integralność OK, albo przyczynę awarii).

**Przetestowane:**

- `cargo test`: 20 testów, wszystkie ✅ — migracje (świeża baza, idempotencja, kopia przed
  aktualizacją, wykrycie dryfu sumy kontrolnej, brak częściowego stanu po nieudanej migracji),
  repozytorium kont (CRUD, archiwizacja/przywracanie, odrzucenie nieprawidłowych danych przed
  dotknięciem bazy, atomowość zapisu — wymuszony błąd w tej samej transakcji nie zostawia
  częściowego wiersza konta), połączenie (WAL + foreign_keys włączone).
- `cargo clippy --all-targets -- -D warnings` i `cargo fmt --check` — czyste.
- **Znaleziony i naprawiony błąd:** `SqliteAccountRepository::create` trzymał blokadę mutexa
  połączenia i wywoływał `self.get()`, który próbował zablokować ten sam (niereentrantny)
  mutex ponownie na tym samym wątku — realny zakleszczenie, wykryte przez to, że `cargo test`
  wisiał bez postępu CPU (potwierdzone przez monitorowanie procesu, nie zgadywanie). Naprawione
  przez `drop(conn)` przed wywołaniem `self.get()`, tak jak już było zrobione w
  `update`/`archive`/`restore`. Wniosek na przyszłość: przy każdej metodzie repozytorium, która
  łączy blokadę mutexa z rekurencyjnym wywołaniem innej metody `&self`, jawnie zwolnić blokadę
  przed tym wywołaniem.

**Następny krok:** rozszerzenie repozytoriów o pozostałe encje w miarę potrzeb kolejnych
Celów (instrumenty i operacje finansowe w Celu 1.4, strategie i transakcje w Celu 1.5), albo
przejście od razu do Celu 1.3 (system wizualny i nawigacja) zgodnie z kolejnością w ROADMAP.

## Pozostałe cele Etapu 1

Patrz [ROADMAP.md](ROADMAP.md) — jeszcze nierozpoczęte.
