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

**Zweryfikowane przez użytkownika (2026-07-18):** natywne okno `desktop.exe` uruchamia się
poprawnie na maszynie użytkownika przez `start-dev.bat` — konsola sprawdza zależności, instaluje
brakujące (pnpm) i otwiera działające okno "Dziennik Tradera". Po drodze naprawione dwa realne
błędy skryptu (brak BOM UTF-8 psuł parsowanie polskich znaków; `corepack enable` wymagał
uprawnień administratora, zastąpione przez `npm install -g pnpm` które instaluje się w
katalogu użytkownika) — szczegóły w historii commitów.

**Następny krok:** Cel 1.2 — schemat SQLite, migracje wersjonowane, repozytoria Rust, WAL,
kopia przed migracją, testy integracyjne CRUD.

## Cel 1.2 — Baza danych, migracje i bezpieczeństwo zapisu — ✅ ukończony

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
  prawdziwy stan (otwarta + integralność OK, albo przyczynę awarii) — **rzeczywiście
  wpięte w `SafeStartScreen`** przez wspólny hook `useTauriQuery`, nie tylko istniejące
  w backendzie.
- Port serwera deweloperskiego zmieniony na **1430** (nie domyślny 1420 Tauri) — na maszynie
  deweloperskiej 1420 jest zajęty przez niepowiązany serwer Vite z innego katalogu
  (`docs/adr/0004-port-dev-1430.md`).

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
Celów (instrumenty i operacje finansowe w Celu 1.4, strategie i transakcje w Celu 1.5).

## Cel 1.3 — Nowy system wizualny i nawigacja — ✅ ukończony

**Co działa:**

- Tokeny projektowe (`design/tokens.css`): paleta z sekcji 11.1 (tło/powierzchnie/obramowanie/
  tekst/akcent złoty/zysk/strata/info/warning), motyw ciemny domyślny, jasny jako pełnoprawna
  opcja (`[data-theme="light"]`), system odstępów 8px, ograniczony zestaw promieni, typografia
  (Inter, lokalnie przez `@fontsource/inter` — bez CDN), `prefers-reduced-motion` globalnie.
- Biblioteka komponentów (`ui/components/`): Button, IconButton, TextField, Select, Checkbox,
  Switch, Tag, Badge, Tooltip, Modal (natywny `<dialog>` — przechwytywanie focusu i Esc "za
  darmo" z przeglądarki), Toast/ToastProvider (powiadomienia, auto-dismiss, zamykalne),
  EmptyState, Skeleton, ErrorState. Każdy z realną obsługą stanów focus/hover/disabled/error
  i etykietami dostępności (nie tylko wizualnie).
- `AppShell`: zwijana lewa nawigacja pogrupowana wg sekcji 11.3 (Główne/Konfiguracja/Analiza/
  Dane/System), nagłówek z tytułem bieżącej strony, przełącznik motywu, skip-link "Przejdź do
  treści głównej". Celowo pominięte "Zasady" i "Psychologia" (Etap 2) — nie pokazujemy
  niedziałających pozycji "wkrótce".
- Routing (`react-router`) z realnymi stronami dla każdej pozycji nawigacji. Strony bez
  jeszcze zaimplementowanej funkcji (Transakcje, Kalendarz, Konta, Strategie, Instrumenty,
  Raporty, Eksport i kopie) pokazują uczciwy `EmptyState` z nazwą Celu, w którym się pojawią —
  to nawigacja do prawdziwej strony, nie martwy przycisk. Dashboard ma działającą, zamykalną
  listę startową (sekcja 10.1) linkującą do Kont/Instrumentów/Transakcji.
- `SafeStartScreen` (z Celu 1.1) wycofany — diagnostyka (status backendu/bazy) przeniesiona
  do Ustawień ("Informacje i diagnostyka"), zgodnie z sekcją 10.6. Ustawienia mają też sekcję
  "Wygląd" (rzeczywisty przełącznik motywu) oraz zapowiedzi "Dane i kopie"/"Aktualizacje".

**Przetestowane:**

- `pnpm typecheck`/`lint`/`format:check`/`test` — zielone (13 testów: Button, TextField, Modal,
  ToastProvider, ErrorBoundary).
- Naprawiony brak czyszczenia DOM między testami (brak `afterEach(cleanup)`, bo projekt celowo
  nie używa globalnych API Vitest) — bez tego kolejne testy w tym samym pliku widziały
  duplikaty poprzednich renderów.
- Zweryfikowane wizualnie w przeglądarce (sam Vite, bez Tauri): 1366×768, 1920×1080, oraz
  symulacja powiększenia ekranu Windows 125%/150% (efektywny viewport 1093×614 i 911×512) —
  bez przewijania poziomego (potwierdzone też programowo:
  `scrollWidth === clientWidth` na każdej szerokości). Lista startowa poprawnie zawija się do
  wielu wierszy przy węższym viewporcie zamiast przepełniać się w bok.
- Kolejność Tab potwierdzona przez inspekcję `document.activeElement` krok po kroku: skip-link
  → zwijanie nawigacji → 9 pozycji menu → przełącznik motywu → treść strony. Aktywacja klawiszem
  Enter/Space nie zadziałała w tym konkretnym narzędziu do zdalnego sterowania przeglądarką
  (potwierdzone jako ograniczenie tego narzędzia, nie aplikacji: to samo zdarzenie w
  `Button.test.tsx` przez `@testing-library/user-event` działa poprawnie, a komponenty używają
  wyłącznie natywnych `<button>`/`<a>` bez żadnej własnej obsługi klawiszy, która mogłaby to
  zepsuć w prawdziwej przeglądarce/WebView2).
- Brak błędów w konsoli na żadnej z odwiedzonych stron (Dashboard, Strategie, Raporty, 404).

**Zweryfikowane przez użytkownika:** natywne okno Tauri uruchamia się i działa poprawnie na
maszynie użytkownika (patrz Cel 1.1). **Nadal nie zweryfikowane:** realne skalowanie Windows
125%/150% (symulowane tylko przez zmianę rozmiaru viewportu, nie przez faktyczne ustawienie DPI
systemu).

**Następny krok:** Cel 1.4 — CRUD kont z archiwizacją (UI na już istniejącym, przetestowanym
backendzie), wpłaty/wypłaty/korekty, biblioteka instrumentów.

## Pozostałe cele Etapu 1

Patrz [ROADMAP.md](ROADMAP.md) — jeszcze nierozpoczęte.
