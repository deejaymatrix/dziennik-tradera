# Postęp prac

Ostatnia aktualizacja: 2026-07-20 (Faza 9 v2: przebudowa wszystkich raportów i dashboardu na wzór
arkusza referencyjnego użytkownika - wykonana przed Fazą 5-8, patrz Faza 9 v2 poniżej)

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

## Cel 1.4 — Konta, operacje finansowe i instrumenty — ✅ ukończony

**Co działa:**

- Backend (patrz commit "Cel 1.4 (backend)"): biblioteka 11 startowych instrumentów
  CFD/Forex (edytowalna), pełny CRUD instrumentów z aktywacją/dezaktywacją, operacje
  finansowe (wpłaty/wypłaty/korekty) z saldem liczonym w jednym miejscu w Rust.
- `AccountsPage`: tabela kont z saldem (`AccountWithBalance` z backendu, nigdy liczone we
  frontendzie), przełącznik "Pokaż zarchiwizowane", modal dodawania/edycji konta, modal
  operacji finansowych (historia + formularz dodawania wpłaty/wypłaty/korekty), akcje
  archiwizuj/przywróć. Pusta lista pokazuje `EmptyState` z CTA "Utwórz konto" — brak
  obowiązkowego kreatora, zgodnie z kryterium Celu 1.4.
- `InstrumentsPage`: tabela instrumentów, przełącznik "Pokaż nieaktywne", modal
  dodawania/edycji z pełną specyfikacją (tick size, tick value, wielkość kontraktu, pip
  size, waluty, min lot, krok lota), akcje aktywuj/dezaktywuj.
- Wspólny `Table` (nowy komponent), `invokeCommand`/`extractErrorMessage` (normalizacja
  błędów z `AppError` backendu do czytelnego komunikatu, także w `useTauriQuery`, które
  wcześniej gubiło prawdziwy komunikat błędu poza przypadkiem "brak Tauri").
- Formularze (`AccountFormModal`, `InstrumentFormModal`, `CashOperationsModal`) resetują
  się przez `key` na rodzicu (remount) zamiast efektu resetującego pola - prostsze i unika
  konfliktu z regułą `react-hooks/set-state-in-effect`.

**Przetestowane:**

- `cargo test`: 40 testów, wszystkie ✅ (patrz commit backendu).
- `pnpm typecheck`/`lint`/`format:check`/`test` (13 testów JS) — zielone.
- Zweryfikowane wizualnie w przeglądarce (Konta i Instrumenty): listy, puste stany, oba
  modale formularzy renderują się poprawnie ze wszystkimi polami, walidacja i komunikat
  błędu (poza kontekstem Tauri: "Cannot read properties of undefined (reading 'invoke')")
  wyświetlają się bez utraty wprowadzonych danych w formularzu.
- **Znaleziony i naprawiony błąd:** dwa modale w `AccountsPage` używały tego samego
  literału `key="closed"` w stanie domyślnym - React zgłaszał kolizję kluczy między
  rodzeństwem. Naprawione przez prefiksowanie kluczy (`form-...`/`ops-...`).
- **Napotkany i naprawiony problem narzędziowy (nie błąd aplikacji):** długo działający
  serwer Vite (sesja testowa użytkownika) miał w cache pusty/przerwany transform pliku
  `AccountFormModal.tsx` z chwili w trakcie zapisu - klasyczny wyścig watchera plików przy
  bardzo szybkich, kolejnych nadpisaniach tego samego pliku. Zdiagnozowane przez
  bezpośrednie `fetch()` modułu i porównanie z zawartością na dysku (sourcemap ujawniał
  pustą `sourcesContent`), naprawione przez `touch` plików, by wymusić ponowny transform
  - bez restartu całego procesu `tauri dev` (żeby nie zerwać żywej sesji użytkownika).

**Następny krok:** Cel 1.5 — strategie użytkownika (start pusty) i pełny formularz
transakcji z podglądem ryzyka/RR na żywo.

## Cel 1.5 — Strategie i formularz transakcji — ✅ ukończony

**Co działa:**

- **Domena strategii** (`domain/strategy.rs`): encja `Strategy` (nazwa, opis, kolor, zasady
  wejścia/zarządzania/wyjścia, tagi, kolejność), `StrategySnapshot` (migawka zamrażana w
  transakcji), walidacja (nazwa niepusta). `SqliteStrategyRepository`: CRUD + `duplicate`
  (kopia z sufiksem "(kopia)", zawsze aktywna) + archiwizacja/przywracanie, kolejność
  (`sort_order`) auto-przydzielana. `StrategiesService` + komendy Tauri
  (`create/get/list/update/duplicate/archive/restore_strategy`).
- **Silnik przeliczeń transakcji** (`domain/trade_calculations.rs`) — czysta funkcja bez
  zależności od bazy: różnica ceny na korzyść pozycji (`price_diff`, zależna od BUY/SELL),
  wynik brutto/netto (`(różnica / tick_size) * tick_value_per_lot * wolumen`, minus
  prowizja/swap/opłaty), ryzyko w pieniądzu i % konta (na podstawie SL), **przewidywany zysk
  w pieniądzu na podstawie TP** (symetryczne do ryzyka — razem dają podgląd "ile stracę / ile
  zyskam" przed otwarciem pozycji), RR planowane, R zrealizowane (wynik netto / ryzyko),
  punkty. Każde pole wyniku jest opcjonalne — niepełne dane w formularzu (np. brak SL) nie
  wywalają całego podglądu, tylko zostawiają puste te pola, które faktycznie tego wymagają.
- **Domena transakcji** (`domain/trade.rs`): `Trade`/`TradeInput` z pełnym zestawem pól ze
  schematu (instrument, strategia, status draft/open/closed/cancelled, kierunek, daty,
  ceny, koszty, notatki, tagi, ocena zgodności z planem), walidacja: SL/TP muszą być po
  właściwej stronie ceny wejścia względem kierunku BUY/SELL, otwarcie pozycji wymaga
  instrumentu/ceny wejścia/wolumenu/daty, zamknięcie wymaga też ceny wyjścia i daty
  zamknięcia nie wcześniejszej niż otwarcie, **ręczna korekta wyniku (`pnl_override`) wymaga
  podania uzasadnienia** — nigdy nie jest domyślnym trybem liczenia.
- `SqliteTradeRepository`: numer wyświetlany (`display_number`) auto-przydzielany i
  monotoniczny per konto (nigdy nie ponownie użyty, nawet po usunięciu), migawki
  instrumentu/strategii zapisywane jako JSON w momencie zapisu (edycja instrumentu/strategii
  później nie zmienia retroaktywnie historycznych wyliczeń), soft-delete (`deleted_at`) +
  przywracanie zamiast trwałego kasowania.
- `TradesService` (warstwa aplikacyjna) — jedyne miejsce, gdzie `TradeInput` z formularza
  spotyka się z migawką instrumentu/strategii, saldem konta (z `AccountsService`) i silnikiem
  przeliczeń, zanim trafi do repozytorium; osobna metoda `preview()` dla podglądu na żywo bez
  zapisu do bazy. Komendy: `preview_trade`, `create/get/list/update/soft_delete/restore_trade`.
- `StrategiesPage` + `StrategyFormModal`: lista startuje pusta, CRUD + duplikuj +
  archiwizuj/przywróć, ten sam wzorzec co Konta/Instrumenty.
- `TransactionsPage`: wybór konta, przełącznik "Pokaż kosz", tabela transakcji (numer,
  instrument, strategia, kierunek, status, daty, wolumen, wynik netto kolorowany
  zysk/strata), akcje edytuj/zamknij pozycję (tylko dla otwartych)/usuń do kosza/przywróć.
- `TradeFormModal` — pełny formularz: instrument/strategia/kierunek/status, daty, ceny
  (wejście/wyjście/SL/TP), koszty, kontekst (interwał/sesja/tagi), notatki (plan/zarządzanie/
  podsumowanie/wnioski/ocena), ręczna korekta wyniku (checkbox odsłaniający kwotę +
  wymagane uzasadnienie), **podgląd na żywo** (`TradePreviewCard`, debounce 300ms na
  `preview_trade`), **autosave szkicu formularza do localStorage** (osobny klucz per
  konto+transakcja, czyszczony dopiero po udanym zapisie) i **ostrzeżenie przed zamknięciem
  formularza z niezapisanymi zmianami** (`window.confirm`, szkic zostaje zachowany).
- `CloseTradeModal` — osobna, skupiona akcja "zamknij pozycję" (cena wyjścia, data, korekta
  kosztów) zamiast przeciążania pełnego formularza edycji przy najczęstszej operacji.
- Nowy komponent `Textarea` w bibliotece UI (ten sam wzorzec co `TextField`).

**Przetestowane:**

- `cargo test`: **70 testów**, wszystkie ✅ — domena strategii/transakcji (walidacja,
  w tym kierunek SL/TP względem BUY/SELL, wymagania otwarcia/zamknięcia, uzasadnienie
  korekty ręcznej), silnik przeliczeń (BUY i SELL z zyskiem/stratą, brak SL/TP nie wywala
  reszty podglądu, R ujemne przy stracie), repozytoria SQLite (numeracja per konto,
  niezależna numeracja między kontami, `duplicate`/archiwizacja/przywracanie strategii,
  soft-delete/restore transakcji, aktualizacja odrzuca usuniętą transakcję, korekta ręczna
  nadpisuje wynik wyliczony automatycznie, odrzucenie nieprawidłowych danych przed
  dotknięciem bazy). `cargo clippy -D warnings` i `cargo fmt --check` — czyste.
- `pnpm typecheck`/`lint --max-warnings=0`/`test` (13 testów JS, bez regresji) — zielone.
- Zweryfikowane wizualnie w przeglądarce: nawigacja do Strategii/Transakcji nie wywala
  aplikacji, stany błędu (poza kontekstem Tauri — ten sam, już wcześniej zaakceptowany
  komunikat "Cannot read properties of undefined (reading 'invoke')" co na już działających
  stronach Kont/Instrumentów) renderują się poprawnie z przyciskiem "Spróbuj ponownie", bez
  pustego ekranu czy nieobsłużonego wyjątku.
- **Nadal nie zweryfikowane przeze mnie:** pełny przepływ zapisu w prawdziwym oknie Tauri
  (utworzenie strategii, dodanie transakcji z podglądem na żywo, zamknięcie pozycji,
  usunięcie do kosza i przywrócenie) — wymaga to prawdziwego mostu IPC Tauri, niedostępnego
  z mojego środowiska narzędziowego (patrz `feedback_dziennik_tradera_gui_sandbox.md`).
  Wszystko, co dało się zweryfikować automatycznie (kompilacja, typy, testy jednostkowe/
  integracyjne na SQLite, lint, renderowanie stron i stanów błędu), zostało zweryfikowane.

**Następny krok:** Cel 1.6 — historia transakcji z filtrowaniem, dashboard z prawdziwymi
metrykami (P&L, win rate, profit factor, expectancy), kalendarz, podstawowe raporty.

## Cel 1.6 — Historia, dashboard, kalendarz i raporty — ✅ ukończony

**Co działa:**

- **Silnik statystyk** (`domain/trade_stats.rs`) — czyste funkcje Rust liczące na transakcjach
  zamkniętych i nieusuniętych: `compute_stats` (win rate, profit factor, expectancy, średnie
  R, najlepsza/najgorsza transakcja, liczby wg statusu), `compute_equity_curve` (skumulowany
  wynik netto w kolejności zamykania), `compute_calendar` (dzienna agregacja P&L do
  kalendarza), `compute_strategy_breakdown`/`compute_instrument_breakdown` (rozbicie wyniku
  wg strategii/instrumentu, grupowane po migawce, więc przetrwa późniejszą edycję
  strategii/instrumentu). Draft/open/cancelled i transakcje bez `net_pnl` celowo nie wchodzą
  do żadnej z tych analiz.
- `ReportsService` (warstwa aplikacyjna) — pobiera transakcje konta **raz** i liczy z nich
  wszystkie widoki naraz (`AccountReport { stats, equity_curve, calendar, by_strategy,
by_instrument }`), komenda `get_account_report`.
- **Filtrowanie historii transakcji** (Status/Kierunek/wyszukiwanie po instrumencie,
  strategii, tagach) świadomie zrobione po stronie frontendu na już pobranej liście — to
  wybór danych, nie matematyka finansowa, więc nie łamie zasady "liczby pieniężne tylko w
  Rust"; filtrowanie SQL po stronie repozytorium okazało się niepotrzebną komplikacją dla
  lokalnej bazy z realistycznie małą liczbą transakcji.
- `DashboardPage`: wybór konta, karty statystyk (wynik netto, win rate, profit factor,
  expectancy, średnie R, liczby transakcji, najlepsza/najgorsza transakcja) i własny,
  prosty wykres SVG krzywej kapitału (`EquityCurveChart`) — bez zewnętrznej biblioteki
  wykresów.
- `CalendarPage`: siatka miesiąca z nawigacją poprzedni/następny, dni kolorowane wg wyniku
  (zielony/czerwony), liczba transakcji na dzień.
- `ReportsPage`: tabele rozbicia wyniku wg strategii i wg instrumentu (transakcje, win rate,
  wynik netto).
- `TransactionsPage`: dodane filtry Status/Kierunek/wyszukiwanie tekstowe nad istniejącą
  tabelą transakcji.
- Wspólny hak `useAccountReport` (wybór konta + pobranie raportu) używany przez
  Dashboard/Kalendarz/Raporty — jedno miejsce na ten powtarzający się przepływ.

**Przetestowane:**

- `cargo test`: **78 testów**, wszystkie ✅ (8 nowych dla silnika statystyk: liczenie wg
  statusu, win rate/profit factor z wygranych i przegranych, brak zrealizowanych transakcji
  zostawia opcjonalne statystyki puste, usunięte transakcje wykluczone, krzywa kapitału
  chronologicznie skumulowana, agregacja dzienna łączy transakcje z tego samego dnia,
  rozbicia wg strategii/instrumentu grupują poprawnie i etykietują brakujące jako "Bez
  strategii"/"Bez instrumentu"). `cargo clippy -D warnings` i `cargo fmt --check` — czyste.
- `pnpm typecheck`/`lint --max-warnings=0`/`format:check`/`test` (13 testów JS, bez regresji)
  — zielone.
- Zweryfikowane wizualnie: podstawiłem fałszywy most Tauri (`window.__TAURI_INTERNALS__`) z
  realistycznymi danymi (5 transakcji, 2 strategie, 2 instrumenty, rozłożone na różne dni) i
  przeszedłem przez wszystkie cztery ekrany w przeglądarce — Dashboard (karty statystyk +
  wykres krzywej kapitału), Kalendarz (siatka miesiąca, kolorowanie, nawigacja
  miesiąc-wstecz pokazująca poprawnie starszą transakcję), Raporty (tabele rozbicia),
  Transakcje (filtry Status/Kierunek/wyszukiwanie zawężają listę poprawnie). Wszystko
  wyrenderowało się poprawnie, bez ucinania, bez pustych ekranów, z poprawnym kolorowaniem
  zysk/strata.
- **Nadal nie zweryfikowane przeze mnie:** rzeczywisty zapis/odczyt w prawdziwym oknie Tauri
  (mój sandbox nie ma mostu IPC — to samo ograniczenie co w Celu 1.4/1.5). Podstawiony most
  pozwolił sprawdzić renderowanie i logikę frontendu z realistycznymi danymi, ale nie
  zastępuje odpalenia prawdziwej aplikacji.

**Następny krok:** Cel 1.7 — eksport CSV/XLSX/PDF, pełny backup `.dtjbackup` z weryfikacją
i przywracaniem.

## Cel 1.7 — Eksport i kopie zapasowe — ✅ ukończony

**Co działa:**

- **Eksport CSV/XLSX** (`application/export.rs`) — pełne dane transakcji wybranego konta (20
  kolumn: numer, instrument, strategia, kierunek, status, daty, ceny, koszty, wyniki, R,
  tagi) do dalszej analizy poza aplikacją. XLSX przez `rust_xlsxwriter` (nagłówek pogrubiony,
  kolumny z ustawioną szerokością, wartości liczbowe jako prawdziwe liczby Excela).
- **Eksport PDF** — zwięzły raport konta (`infrastructure/pdf_report.rs`): tytuł, data
  wygenerowania, podsumowanie (wynik netto, win rate, profit factor, liczba transakcji —
  ponownie użyty silnik z Celu 1.6, nie liczony od nowa) i kompaktowa tabela transakcji.
  Zbudowany na `lopdf` z użyciem wyłącznie standardowych 14 fontów PDF (Helvetica/
  Helvetica-Bold) — bez osadzania plików fontów. Automatyczna paginacja, gdy transakcji jest
  więcej niż mieści się na jednej stronie A4.
- **Kopia zapasowa `.dtjbackup`** (`infrastructure/backup_archive.rs`) — archiwum ZIP z
  manifestem (`manifest.json`: wersja formatu, data, wersja aplikacji, suma kontrolna
  SHA-256 bazy) i spójną migawką SQLite (SQLite Backup API, nie zwykłe kopiowanie pliku).
- **Przywracanie z pełną weryfikacją PRZED jakąkolwiek destrukcyjną operacją**: format
  archiwum, obecność wpisów, zgodność sumy kontrolnej z manifestem i `PRAGMA
integrity_check` na wypakowanej bazie — dopiero gdy wszystko się zgadza, dane trafiają do
  pliku "przywrócenie oczekujące". Samo podstawienie pliku bazy dzieje się dopiero przy
  **następnym starcie aplikacji** (nigdy w trakcie działania z otwartym połączeniem):
  automatyczna kopia bezpieczeństwa aktualnej bazy, usunięcie nieaktualnych plików WAL/SHM,
  podmiana pliku. Użytkownik jest jawnie informowany, że zmiana wymaga ponownego uruchomienia.
- Komendy: `export_trades_csv/xlsx/pdf`, `create_backup`, `prepare_backup_restore`.
- Wtyczka `tauri-plugin-dialog` (natywne okna "Zapisz jako"/"Otwórz plik") — jedyny sposób na
  wybór lokalizacji pliku eksportu/kopii zgodny z modelem uprawnień Tauri 2; uprawnienia
  dodane do `capabilities/default.json`.
- `DataPage`: sekcje Eksport transakcji / Kopia zapasowa / Przywracanie, z natywnymi oknami
  zapisu/otwarcia pliku, jawnym ostrzeżeniem przed przywróceniem (native `confirm`) i banerem
  informującym o konieczności ponownego uruchomienia po przygotowaniu przywrócenia.

**Przetestowane:**

- `cargo test`: **86 testów**, wszystkie ✅ (5 nowych dla archiwum kopii zapasowej: tworzenie
  i weryfikacja w obie strony, odrzucenie zmodyfikowanego pliku po niezgodności sumy
  kontrolnej, odrzucenie pliku niebędącego archiwum ZIP, pełny cykl przygotuj-przywróć-
  zastosuj z potwierdzeniem że kopia bezpieczeństwa sprzed przywrócenia rzeczywiście powstaje
  i zawiera dane sprzed przywrócenia; 3 nowe dla eksportu: CSV ma poprawną liczbę wierszy,
  XLSX zaczyna się od sygnatury ZIP "PK", PDF zaczyna się od sygnatury "%PDF"). `cargo clippy
-D warnings` i `cargo fmt --check` — czyste.
- `pnpm typecheck`/`lint --max-warnings=0`/`format:check`/`test` (13 testów JS, bez regresji)
  — zielone.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri): potwierdzone, że kliknięcie
  "Eksportuj CSV" poprawnie wywołuje najpierw natywne okno zapisu (`plugin:dialog|save`), a
  dopiero potem komendę eksportu z wybraną ścieżką - to samo dla tworzenia kopii zapasowej
  (`create_backup`). Przepływ przywracania (który dodatkowo pokazuje natywne okno
  `window.confirm`) zweryfikowany przeglądem kodu, nie kliknięciem - ryzyko zawieszenia
  zdalnie sterowanej przeglądarki na nieobsłużonym natywnym oknie dialogowym uznałem za
  nieuzasadnione, skoro wzorzec (okno pliku → walidacja → wywołanie komendy) jest identyczny
  do już zweryfikowanych przepływów eksportu/tworzenia kopii.
- **Napotkany i rozwiązany problem narzędziowy (nie błąd aplikacji):** `cargo test` zaczęło
  odrzucać uruchomienie skompilowanego binarium testowego w trakcie sesji ("Zasady kontroli
  aplikacji zablokowały ten plik") mimo że `cargo check`/`clippy` przechodziły czysto na tym
  samym kodzie - najpewniej polityka kontroli aplikacji w moim środowisku narzędziowym.
  Naprawione usunięciem nieaktualnych plików binarnych i wymuszeniem świeżej kompilacji.
- **Nadal nie zweryfikowane przeze mnie:** rzeczywisty zapis pliku na dysku i pełny cykl
  restart-aplikacji-po-przywróceniu w prawdziwym oknie Tauri (mój sandbox nie ma dostępu do
  prawdziwego systemu plików użytkownika ani nie może zrestartować rzeczywistej aplikacji) -
  to samo ograniczenie, co przy poprzednich Celach.

**Następny krok:** Cel 1.8 — produkcyjna autoaktualizacja (Tauri updater, podpis Ed25519,
GitHub Releases).

## Cel 1.8 — Produkcyjna autoaktualizacja — ✅ ukończony (⚠️ wymaga konfiguracji przed wydaniem)

**Co działa:**

- `tauri-plugin-updater` + `tauri-plugin-process` (restart po instalacji) zarejestrowane w
  backendzie, `@tauri-apps/plugin-updater`/`@tauri-apps/plugin-process` po stronie frontendu.
- Wygenerowana para kluczy Ed25519 do podpisywania aktualizacji (`tauri signer generate`) —
  klucz prywatny leży **poza repozytorium** (`C:\Users\matri\.tauri\dziennik-tradera.key`,
  dodatkowo zabezpieczony regułą `*.key`/`*.key.pub` w `.gitignore`), klucz publiczny wpisany
  w `tauri.conf.json` → `plugins.updater.pubkey`.
- Endpoint sprawdzania aktualizacji skonfigurowany pod GitHub Releases
  (`.../releases/latest/download/latest.json`) — **na razie z placeholderem zamiast
  prawdziwej nazwy repozytorium**, patrz sekcja "Wymaga uwagi" poniżej.
- `.github/workflows/release.yml` — buduje, podpisuje i publikuje wydanie robocze (draft) na
  GitHub po wypchnięciu tagu `v*`, przez `tauri-apps/tauri-action`.
- `docs/adr/0005-autoaktualizacja.md` — pełna dokumentacja decyzji i instrukcja krok po kroku,
  co trzeba zrobić przed pierwszym prawdziwym wydaniem (podpięcie repo, sekrety GitHub Actions,
  wypchnięcie tagu).
- UX: cichy check przy starcie aplikacji (`AppShell`) pokazuje tylko powiadomienie (toast) o
  dostępnej wersji - nigdy nic nie pobiera/instaluje automatycznie. Pełny przepływ (sprawdź /
  pobierz z paskiem postępu / zainstaluj / uruchom ponownie) jest w Ustawienia → Aktualizacje,
  zawsze z wyraźną akcją użytkownika przed pobraniem i przed restartem. Przy okazji
  poprawiony nieaktualny komunikat "Dane i kopie" w Ustawieniach (odsyłał do "Celu 1.7" mimo
  że ten Cel jest już ukończony) - teraz linkuje do prawdziwej strony Eksport i kopie.

**Przetestowane:**

- `cargo test`: 86 testów (bez zmian w tym Celu - autoaktualizacja to głównie konfiguracja i
  wiring wtyczek, nie nowa logika domenowa do przetestowania jednostkowo), `cargo clippy
-D warnings` i `cargo fmt --check` — czyste po dodaniu wtyczek.
- `pnpm typecheck`/`lint --max-warnings=0`/`format:check`/`test` (13 testów JS, bez regresji)
  — zielone.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri, tym razem z dodatkowym stubem
  `transformCallback` żeby obsłużyć `Channel` używany przez `downloadAndInstall`): pełny
  przepływ Ustawienia → "Sprawdź aktualizacje" → karta z dostępną wersją i notatkami wydania →
  "Pobierz i zainstaluj" → stan "gotowe do ponownego uruchomienia" z przyciskiem restartu -
  wszystkie przejścia stanu zadziałały poprawnie. Ścieżka błędu też sprawdzona (zanim dodałem
  stub `transformCallback`, próba pobrania poprawnie pokazała czytelny komunikat błędu zamiast
  wywalić całą stronę).
- **Nadal nie zweryfikowane przeze mnie:** rzeczywiste pobranie/instalacja/restart w prawdziwym
  oknie Tauri względem prawdziwego GitHub Release (niemożliwe bez opublikowanego wydania - patrz
  "Wymaga uwagi" poniżej) oraz cały pipeline GitHub Actions (nie mam dostępu do GitHuba z tego
  środowiska, żeby faktycznie wypchnąć tag i obejrzeć wynik).

**⚠️ Wymaga uwagi użytkownika przed pierwszym wydaniem** (szczegóły w
`docs/adr/0005-autoaktualizacja.md`): `tauri.conf.json` ma placeholder
`TWOJA-NAZWA-UZYTKOWNIKA/dziennik-tradera` zamiast prawdziwego adresu repozytorium GitHub -
trzeba go podmienić i dodać dwa sekrety (`TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) w ustawieniach repozytorium, zanim autoaktualizacja
zadziała naprawdę. Do tego czasu przycisk "Sprawdź aktualizacje" będzie zwracał błąd - to
oczekiwane.

**Następny krok:** Cel 1.9 — instalator NSIS `.exe` i wydanie 1.0 fundamentu (smoke test na
czystym Windows 10/11).

## Modyfikacja przed instalatorem (dokument `Prompt_modyfikacja_Dziennika_Tradera.docx`)

Obszerna, wiążąca modyfikacja ukończonego fundamentu (Cel 1.1–1.8), wymagana PRZED Celem 1.9
(instalatorem) — patrz `C:\Users\matri\.claude\plans\cozy-puzzling-mitten.md` za pełny plan 12
faz (Faza 0–11). Realizowana sekwencyjnie, fazami porównywalnymi rozmiarem do dotychczasowych
Celów.

### Faza 0 — Usuń panel "Dane i kopie" z Ustawień, ogranicz walutę do USD/EUR/GBP — ✅ ukończona

**Co działa:**

- `SettingsPage.tsx`: usunięta sekcja "Dane i kopie" (odsyłacz do `/dane`) — strona `/dane`
  (`DataPage`, Eksport i kopie) zostaje bez zmian, to już prawdziwe działające miejsce, nie
  zapowiedź. Ustawienia idą teraz bezpośrednio Wygląd → Aktualizacje → Informacje i diagnostyka.
- Waluta konta ograniczona do enuma `USD | EUR | GBP` (domyślnie USD):
  `domain::account::SUPPORTED_CURRENCIES` w Rust, `validate_currency` odrzuca każdą inną
  wartość z czytelnym komunikatem. `AccountFormModal.tsx` ma teraz `Select` z dokładnie tymi
  trzema opcjami zamiast dowolnego pola tekstowego.
- **Brak cichej migracji istniejących kont**: `UpdateAccount::validate_with_existing_currency`
  pozwala zachować walutę już zapisaną na koncie (np. sprzed tego ograniczenia), nawet jeśli
  jest spoza listy — blokuje tylko zmianę NA inną nieobsługiwaną walutę. `SqliteAccountRepository::
update` pobiera aktualną walutę konta przed zapisem właśnie po to, żeby to rozróżnić. Frontend
  pokazuje taką walutę jako dodatkową opcję "PLN (nieobsługiwana — wybierz nową walutę)" z
  wyjaśniającą podpowiedzią, więc edycja innych pól starszego konta nie wymusza migracji waluty.
- `Select` (biblioteka UI) dostał opcjonalny `hint` (ten sam wzorzec co `TextField`) — potrzebny
  do podpowiedzi przy nieobsługiwanej walucie, teraz dostępny dla każdego przyszłego `Select`.

**Przetestowane:**

- `cargo test`: **90 testów**, wszystkie ✅ (4 nowe: odrzucenie nieobsługiwanej waluty przy
  tworzeniu konta, akceptacja każdej z trzech obsługiwanych, zachowanie niezmienionej waluty
  legacy bez wymuszania migracji, odrzucenie zmiany waluty legacy na inną nieobsługiwaną).
  `cargo clippy -D warnings` i `cargo fmt --check` — czyste.
- `pnpm typecheck`/`lint --max-warnings=0`/`format`/`test` (13 testów JS, bez regresji) — zielone.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri): Ustawienia pokazują poprawną
  kolejność sekcji bez "Dane i kopie"; formularz "Dodaj konto" pokazuje czyste USD (domyślne)/
  EUR/GBP; edycja istniejącego konta z walutą "PLN" (spoza enuma) poprawnie pokazuje tę walutę
  jako zaznaczoną dodatkową opcję z podpowiedzią, bez wymuszania zmiany.

**Następny krok:** Faza 1 — katalog dokładnie 350 instrumentów (nowy schemat wersjonowany,
deterministyczny seed wygenerowany programowo z `extracted.txt`, przepisany silnik obliczeń,
ekran "Zarządzaj instrumentami").

### Faza 1 — Katalog 350 instrumentów, silnik obliczeń, ekran zarządzania — ✅ ukończona

**Co działa:**

- **Fabryczny katalog dokładnie 350 instrumentów**, wygenerowany programowo (nigdy ręcznie
  przepisywany) skryptem Node z jawnego CSV osadzonego w dokumencie modyfikacji
  (`scratchpad/generate_instrument_catalog.js` → `db/migrations/0003_instrument_catalog.sql`,
  1224 linie). Migracja jest w pełni bezpieczna dla istniejącej bazy: zamiast `DROP TABLE`
  (co przy włączonych kluczach obcych wywaliłoby się na każdym ocalałym odwołaniu z `trades`)
  używa wyłącznie `ALTER TABLE ... ADD/DROP COLUMN` w miejscu, więc żadne id nigdy nie ginie.
  Starą prowizoryczną listę 11 instrumentów z Celu 1.4 usuwa TYLKO tam, gdzie żadna transakcja
  się już do niej nie odwołuje — ocalałe (hipotetycznie użyte) wiersze migrują się do nowego
  kształtu z dopiskiem "(starsza wersja)" przy kolizji nazwy z nowym katalogiem, zamiast cichego
  nadpisania.
- **Nowy model danych**: `instruments` (tożsamość — symbol wyświetlany/techniczny, opis,
  kategoria, indeks fabryczny), `instrument_versions` (pełne 47 pól parametrów obliczeniowych
  1:1 z katalogu — Digits/Point/TradeTickSize/TickValueProfit/TickValueLoss/ContractSize,
  wolumeny, tryby kalkulacji/handlu/egzekucji/swapu, depozyty, mnożniki swapu per dzień
  tygodnia, sesje — dokładnie jedna aktywna wersja per instrument wymuszona częściowym unikalnym
  indeksem), `instrument_preferences` (widoczność/kolejność/ulubione). Edycja **zawsze** tworzy
  nową wersję (poprzednia `is_active = 0`) — nigdy nie nadpisuje historycznej.
- **Przepisany silnik obliczeń** (`domain/trade_calculations.rs`): liczba ticków zawsze z
  `TradeTickSize` (nie z `Point`, który służy wyłącznie prezentacji `pnl_points` — mogą się
  różnić), osobna wartość ticka dla zysku i straty, wykrywanie niezgodności waluty wyniku
  instrumentu z walutą rachunku (`requires_conversion_rate` w wyniku, żadnego cichego
  przybliżenia — transakcja przechowuje edytowalny `conversion_rate`). 13 testów referencyjnych:
  forex 5 miejsc, para JPY, XAUUSD, indeks standard, indeks -MINI, krypto z ułamkowym
  wolumenem, akcja z prowizją, niestandardowy krok wolumenu, instrument gdzie Point≠TradeTickSize,
  niezgodność waluty z/bez kursu, potwierdzenie że silnik jest czystą funkcją bez pamięci
  (zmiana "aktualnych" parametrów nie zmienia wyniku odtworzonego ze starej migawki).
- **Ekran "Zarządzaj instrumentami"** (`InstrumentsPage.tsx`, zastąpił starą prostą listę):
  wyszukiwarka (symbol/opis/kategoria/symbol techniczny), filtr 10 kategorii, filtr
  Widoczne/Ukryte/Wszystkie, zaznaczanie pojedyncze i zbiorcze + akcje "Pokaż/Ukryj zaznaczone",
  stronicowanie po 25 (zamiast wirtualizacji — dokument dopuszcza obie metody), przycisk
  "Domyślna widoczność" (przywraca dokładnie sześć: EURUSD/XAUUSD/DJI30/NAS100/D40EUR/BTCUSD),
  osobna sekcja "Kolejność widocznych instrumentów" z przyciskami góra/dół (reorder działa na
  widocznym zestawie, nie na całych 350 — zgodnie z zamiarem dokumentu). Ukrycie nigdy nie
  usuwa danych. Etykieta MINI przy symbolach `-MINI`.
- **Formularz instrumentu** (`InstrumentFormModal.tsx`): tryb tylko-do-odczytu domyślnie ze
  zwięzłym podsumowaniem (opis, kategoria, digits/point, tick size/value, kontrakt, wolumeny,
  waluty), przycisk Edytuj odsłania wszystkie 47 pól w dwóch sekcjach (podstawowe + "Parametry
  zaawansowane"), zapis zawsze tworzy nową wersję, "Przywróć wartości fabryczne" (tylko dla
  instrumentów z katalogu, z potwierdzeniem) kopiuje z powrotem wersję nr 1 jako nową wersję.
  Ten sam modal obsługuje też dodawanie własnego instrumentu spoza katalogu 350.
- Rozszerzona walidacja (`domain/instrument.rs`): spójność Digits/Point/TradeTickSize, brak zer/
  wartości ujemnych, VolumeMin≤Max, podzielność zakresu wolumenu przez krok, kody walut,
  luźna walidacja prefiksu dla trybów enum/flag (CalcMode/TradeMode/ExecutionMode/SwapMode) —
  nie blokuje przyszłych wariantów katalogu.
- Zaktualizowane obszary zależne: migawka instrumentu w transakcji (`InstrumentSnapshot`) niesie
  teraz pełny zestaw parametrów potrzebny do przeliczeń zamiast czterech pól, `TradeFormModal`
  pokazuje tylko widoczne instrumenty w polu wyboru (ukryty instrument użyty w edytowanej
  historycznej transakcji nadal się pokazuje, oznaczony "(ukryty)"), pole "Kurs przeliczeniowy"
  pojawia się w formularzu transakcji, gdy silnik zgłosi niezgodność waluty, eksport/raporty/
  historia transakcji czytają nowe nazwy pól migawki (`display_symbol` zamiast `symbol`).
- **Dodatkowo (na wyraźną prośbę użytkownika):** trwałe usuwanie instrumentu jest możliwe
  wyłącznie dla instrumentów własnych (`factory_index IS NULL`) — instrumenty z fabrycznego
  katalogu 350 można wyłącznie ukryć, nigdy usunąć (backend odrzuca taką próbę jawnym błędem
  walidacji). Usunięcie jest też odrzucane, jeśli instrument jest już użyty w choćby jednej
  transakcji. Przycisk "Usuń" pojawia się w tabeli i w szczegółach instrumentu tylko dla
  instrumentów własnych.

**Przetestowane:**

- `cargo test`: **114 testów** (24 nowe), wszystkie ✅ — migracja (dokładnie 350 instrumentów,
  dokładnie 6 widocznych domyślnie, bezpieczny upgrade istniejącej bazy z realnymi kontami/
  transakcjami sprzed Fazy 1 — patrz niżej), repozytorium instrumentów (wersjonowanie, reset
  fabryczny, widoczność nigdy nie usuwa danych, wyszukiwanie/filtr/kategoria, usuwanie odrzucone
  dla instrumentów fabrycznych i dla instrumentów użytych w transakcji, usuwanie własnego
  nieużywanego instrumentu kasuje też jego wersje), silnik obliczeń (13 testów referencyjnych
  opisanych wyżej), walidacja domeny. `cargo clippy -D warnings` i `cargo fmt --check` — czyste.
- `pnpm typecheck`/`lint --max-warnings=0`/`format`/`test` (13 testów JS, bez regresji) — zielone.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri z realistycznym podzbiorem
  katalogu): ekran "Zarządzaj instrumentami" poprawnie pokazuje 8 instrumentów (6 widocznych/2
  ukryte), etykietę MINI, symbol techniczny, stronicowanie, sekcję kolejności widocznych;
  formularz edycji poprawnie startuje w trybie tylko-do-odczytu z podsumowaniem, "Edytuj"
  odsłania wszystkie pola (podstawowe + zaawansowane), zapis tworzy nową wersję (potwierdzone:
  wersja nr 1 → nr 2 z nową wartością, widoczne po ponownym otwarciu), formularz dodawania
  nowego instrumentu renderuje się poprawnie z polami tożsamości. Po drodze znaleziony i
  naprawiony realny błąd: ręcznie liczone placeholdery SQL (`?N`) w zapytaniu wstawiającym
  47-polową wersję instrumentu rozjechały się z listą kolumn ("49 values for 52 columns") —
  naprawione przez programowe generowanie listy placeholderów zamiast liczenia ręcznego.
- Zweryfikowane wizualnie także usuwanie instrumentów: instrument fabryczny nie pokazuje
  przycisku "Usuń" (ani w tabeli, ani w szczegółach) — wyłącznie "Przywróć wartości fabryczne";
  instrument własny pokazuje "Usuń", kliknięcie (z podstawionym `window.confirm` zwracającym
  `true`, żeby nie zawiesić zdalnie sterowanej przeglądarki na natywnym oknie) poprawnie usuwa
  instrument i znika on też z sekcji kolejności widocznych.
- **Nadal nie zweryfikowane przeze mnie w przeglądarce (niższe ryzyko, ten sam ustalony wzorzec
  co już zweryfikowane akcje)**: przyciski zbiorczego pokaż/ukryj zaznaczone, pole "Kurs
  przeliczeniowy" w formularzu transakcji przy realnej niezgodności walut, realne kliknięcie
  "Przywróć wartości fabryczne" (logika tożsama z już zweryfikowanym usuwaniem). Drag-and-drop
  dla kolejności widocznych instrumentów nie został dodany — tylko klawiaturowo dostępne
  przyciski góra/dół (dokument wymaga obu metod; to świadome, jeszcze nie domknięte uproszczenie
  zakresu tej fazy).
- **Napotkany i rozwiązany incydent podczas realnego testowania (nie błąd w kodzie aplikacji):**
  użytkownik zobaczył "NIEDOSTĘPNA — migracja bazy danych nie powiodła się: wykryto niezgodność
  sumy kontrolnej" na prawdziwej maszynie. Przyczyna: podczas tej sesji kilkukrotnie poprawiałem
  plik `0003_instrument_catalog.sql` (kolejne poprawki błędów), a działająca w tle aplikacja
  użytkownika zdążyła w międzyczasie zastosować jedną z wcześniejszych wersji tego pliku do
  swojej prawdziwej bazy - zabezpieczenie z Celu 1.2 ("czy plik migracji zmienił się po
  zastosowaniu?") słusznie odmówiło kontynuowania. To nie dotyczy finalnego produktu (prawdziwy
  użytkownik po instalacji dostaje jeden, zamrożony plik migracji), tylko iteracyjnej pracy nad
  tym samym plikiem w trakcie, gdy aplikacja działa. Naprawione poleceniem użytkownikowi
  skasowania lokalnego pliku bazy deweloperskiej (dane testowe, nie ma jeszcze instalatora).
  Dodane w tej sesji dwa nowe testy regresyjne w `db::migrations::tests`
  (`upgrading_a_real_pre_faza1_database_with_existing_trades_succeeds`,
  `upgrading_a_real_database_with_all_legacy_instruments_referenced_and_a_custom_one`)
  potwierdzają, że sama migracja 3 jest bezpieczna nawet na w pełni zapełnionej, realistycznej
  bazie sprzed Fazy 1.

**Następny krok:** Faza 2 — status transakcji wyliczany automatycznie, precyzja sekund,
usunięcie tagów z UI, wspólne źródło salda przed/po/aktualne, tryb odczytu + Edytuj na karcie
transakcji, emocje w 3 momentach.

### Faza 2 — Status automatyczny, sekundy, saldo, tryb odczytu + Edytuj, emocje — ✅ ukończona

**Co działa:**

- Status transakcji (`Szkic`/`Otwarta`/`Zamknięta`) nie jest już polem wybieranym przez
  użytkownika — wylicza go wyłącznie `domain::trade::compute_status` z obecności danych,
  identycznie przy zapisie i odczycie (migracja `0004_automatic_trade_status` porządkuje też
  historyczne wiersze, w tym stary stan `cancelled`, którego nowy model już nie zna).
- Precyzja czasu do sekund w polach otwarcia/zamknięcia (`step={1}` na `datetime-local`,
  `toDatetimeLocalValue` dopisuje sekundy).
- Tagi usunięte z formularza/filtrów/wyszukiwania — historyczne tagi zapisane przed tą zmianą
  zostają nietknięte na starych transakcjach (nigdy nie są kasowane przy edycji przez nowy
  formularz bez tego pola).
- **Wspólne źródło salda** (`domain::balance`): saldo konta = początkowe + wpłaty/wypłaty/
  korekty + suma netto zamkniętych transakcji nie w koszu (`compute_current_balance`,
  używane przez `AccountsService` dla każdego konta). Osobna funkcja
  (`balance_before_after_trade`) liczy chronologiczne saldo przed/po dla konkretnej transakcji,
  łącząc operacje gotówkowe i zamknięcia transakcji na jednej osi czasu (remis identycznych
  znaczników czasu rozstrzygany deterministycznie po id). Karta "Aktualne saldo" na
  Dashboardzie (zawsze widoczna, nie tylko gdy są zamknięte transakcje) i karta salda
  przed/po/aktualne na karcie transakcji (`TradeBalanceCard`) — dla nowej transakcji pokazuje
  tylko aktualne saldo, dla edytowanej migawkę sprzed rozpoczęcia edycji.
- **Tryb odczytu i przycisk Edytuj na karcie transakcji**: istniejąca transakcja otwiera się
  domyślnie w trybie tylko-do-odczytu (prawdziwe zapisane dane, nigdy zapomniany szkic z
  poprzedniej sesji — szkic jest proponowany do wczytania dopiero po kliknięciu "Edytuj", z
  potwierdzeniem jeśli różni się od zapisanych danych). "Edytuj" odblokowuje pola, "Anuluj"
  cofa do trybu odczytu bez zapisu, "Zapisz zmiany" zapisuje.
- **Wykrywanie konfliktu wersji**: zapis (`update_trade`) przyjmuje opcjonalną oczekiwaną
  `updated_at` wczytanej transakcji — jeśli w międzyczasie ktoś inny (np. inne okno albo
  szybkie zamknięcie pozycji) zmienił tę samą transakcję, zapis jest odrzucany jako
  `AppError::Conflict` z czytelnym komunikatem zamiast po cichu nadpisać cudzą zmianę.
- **Lokalny dziennik zmian** (`domain::trade_audit`): każda zapisana edycja z realnie
  zmienionymi polami (edycje bez zmian nie tworzą wpisu) trafia do współdzielonej tabeli
  `audit_log` (ta sama, która już istniała dla kont od Celu 1.2 — `entity_type='trade'`,
  `detail` niesie tu listę {pole, stara wartość, nowa wartość}). Widoczny na karcie transakcji
  jako zwijana sekcja "Historia zmian".
- Nowe komendy: `get_trade_balance_context`, `list_trade_audit_log`; `update_trade` przyjmuje
  dodatkowy parametr `expectedUpdatedAt`.
- **Emocje w 3 momentach** (przed/w trakcie/po transakcji): dla każdego momentu wielokrotny
  wybór stanu emocjonalnego + natężenie 1–5 + notatka + jawna flaga "Nie uzupełniono"
  odróżniająca świadomy brak danych od zwykłego pustego formularza (`domain::trade_emotions`,
  zapisywane jako JSON na wierszu `trades` - ten sam wzorzec co migawki instrumentu/strategii).
  Zaznaczenie "Nie uzupełniono" czyści resztę pól tego momentu po stronie frontendu.
- **Zarządzana lista stanów emocjonalnych** (`domain::emotional_state`, migracja
  `0005_trade_emotions` z 12 wbudowanymi stanami startowymi jak Spokój/Strach/Chciwość/FOMO):
  wbudowane stany można tylko ukryć, własne stany użytkownika można też usunąć w całości;
  odrzuca duplikaty nazw. Ekran zarządzania w Ustawieniach → "Stany emocjonalne" (lista z
  ukryj/pokaż/usuń + dodawanie nowych).
- Zmiany w emocjach też trafiają do lokalnego dziennika zmian (jako zwięzłe podsumowanie
  "uzupełnione: przed, po" zamiast pełnego zrzutu JSON).

**Przetestowane:**

- Rust: 144 testy przechodzą (`cargo test`), `cargo clippy -D warnings`/`cargo fmt --check`
  czyste. Nowe testy: chronologiczne saldo (sortowanie, remis po id, transakcje
  otwarte/usunięte nie wpływają na saldo), integracyjne saldo konta przez pełny
  `TradesService`, kontekst salda przed/po/aktualne, konflikt wersji (na poziomie repozytorium
  i przez `TradesService`), dziennik zmian (diff pól, zero wpisów przy braku zmian), walidacja
  natężenia emocji (1-5), repozytorium stanów emocjonalnych (seed startowy, duplikaty nazw,
  ukrywanie wbudowanych bez usuwania, usuwanie tylko własnych).
- Frontend: `pnpm typecheck`/`lint`/`format:check`/`test` (Vitest 13/13) czyste.
- Zweryfikowane w przeglądarce (fałszywy most Tauri): karta "Aktualne saldo" na Dashboardzie,
  saldo przed/po/aktualne na karcie transakcji, tryb odczytu (pola wyszarzone, przyciski
  Zamknij/Edytuj) → tryb edycji (pola odblokowane, Anuluj/Zapisz zmiany) → zapis z
  `expectedUpdatedAt` i poprawnym payloadem, historia zmian rozwijana z konkretnym polem i
  wartościami przed/po, ekran "Stany emocjonalne" (wbudowane/własne, ukryj/pokaż/usuń, dodanie
  nowego), 3-momentowy edytor emocji na karcie transakcji z poprawnym stanem checkboxów i
  "Nie uzupełniono".
- **Znaleziony i naprawiony błąd przy tej weryfikacji:** `loadTradeDraft` ślepo ufało kształtowi
  szkicu z `localStorage` - szkic zapisany przed dodaniem pola `emotions` do `TradeFormFields`
  nie miał go w JSON-ie, co wywalało `TradeFormModal` przy pierwszym otwarciu (`Cannot read
properties of undefined (reading 'before')`). Naprawione scalaniem wczytanego szkicu z pustym
  szablonem (`{...blankTradeFormFields(), ...parsed}`) - odporne też na każde przyszłe dodanie
  pola.

**Następny krok:** Faza 3 — przebudowa zasad strategii (zasady wejścia + nowa sekcja zasad
zarządzania pozycją, usunięcie zasad wyjścia z aktywnego modelu, checklist w transakcji jako
migawka zasad z momentu wyboru strategii).

### Faza 3 — Przebudowa zasad strategii, checklist w transakcji — ✅ ukończona

**Co działa:**

- Zasady wejścia i zarządzania pozycją to teraz zarządzane listy zamiast wolnego tekstu
  (`domain::strategy::EntryRule`/`ManagementRule`: nazwa, opis opcjonalny, `required` - tylko
  zasady wejścia, `archived`, stabilne id, kolejność). Ekran edycji strategii ma osobny edytor
  list (`RuleListEditor`) dla obu sekcji: dodawanie, reorder przyciskami góra/dół, archiwizacja
  bez usuwania, trwałe usunięcie. Walidacja odrzuca puste nazwy i zduplikowane nazwy (po
  normalizacji wielkości liter) wśród aktywnych zasad tej samej listy.
- Sekcja "Zasady wyjścia" usunięta z aktywnego modelu i formularza strategii - stary wolny
  tekst (razem z zawartością zasad wejścia/zarządzania sprzed strukturalizacji) zachowany
  wyłącznie do wglądu (`legacy_entry_rules_text`/`legacy_management_rules_text`/
  `legacy_exit_rules_text`), nowe kolumny `entry_rules_json`/`management_rules_json` niosą
  strukturalne dane (migracja `0006_strategy_rules`).
- **Checklist zasad strategii na karcie transakcji** (`domain::strategy_checklist`): migawka
  budowana świeżo (wszystkie pozycje "Nie dotyczy") przy wyborze innej strategii, zachowana bez
  zmian dopóki strategia się nie zmienia - nawet jeśli w międzyczasie zmieniono jej definicję
  (checklist niesie nazwę/`required` wprost, nie tylko odniesienie po id). Zasady wejścia:
  Spełniona/Niespełniona/Nie dotyczy (wymagane oznaczone gwiazdką); zarządzania: Wykonana/
  Niewykonana/Nie dotyczy. Niespełniona wymagana zasada NIE blokuje zapisu - oznacza tylko
  naruszenie planu.
- Zmiany w checkliście trafiają też do lokalnego dziennika zmian (zwięzłe podsumowanie, nie
  pełny zrzut JSON).

**Przetestowane:**

- Rust: 149 testów przechodzi (`cargo test`), `cargo clippy -D warnings`/`cargo fmt --check`
  czyste. Nowe testy: walidacja zasad strategii (pusta nazwa, duplikaty aktywnych nazw
  case-insensitive, zezwolenie na duplikat gdy jedna kopia archiwalna), repozytorium strategii
  (round-trip zasad wejścia/zarządzania, zachowanie starego wolnego tekstu przy aktualizacji
  nowych kolumn JSON).
- Frontend: `pnpm typecheck`/`lint`/`format:check`/`test` (Vitest 13/13) czyste.
- Zweryfikowane w przeglądarce (fałszywy most Tauri): edycja strategii z dwiema zasadami
  wejścia (jedna wymagana, jedna opcjonalna) i jedną zasadą zarządzania - poprawne wartości
  pól/checkboxów po otwarciu, poprawny payload zapisu (bez `exit_rules`); na nowej transakcji
  wybór strategii generuje checklistę z poprawnymi etykietami statusu per sekcja i gwiazdką
  przy wymaganej zasadzie, zmiana statusu i zapis niosą poprawny payload.

**Następny krok:** Faza 4 — zarządzanie interwałami (lista wbudowanych M1/M5/M15/M30/H1/H4 +
własne interwały użytkownika, zamiast wolnego pola tekstowego na transakcji).

**Dodatkowo w tej turze (poza planem faz):** naprawiony zgłoszony przez użytkownika błąd
produkcyjny — przycisk "Edytuj" na karcie transakcji przy szybkim podwójnym kliknięciu zapisywał
transakcję bez żadnej zmiany, zamiast wejść w tryb edycji. Przyczyna: "Edytuj" i "Zapisz zmiany"
zajmują to samo miejsce w stopce (prawy, główny przycisk) w zależności od trybu — drugie
kliknięcie szybkiego podwójnego kliknięcia trafiało już w nowo podstawiony przycisk zapisu.
Naprawione krótką blokadą zapisu (`submitLocked`, 500ms) uzbrajaną przy wejściu w tryb edycji,
sprawdzaną też w `disabled` przycisku i na starcie `handleSubmit`. Zweryfikowane realnym
`computer{action:"double_click"}` na prawdziwych współrzędnych ekranu (nie zdarzeniem `.click()`,
które nie odtwarza tego błędu) — potwierdzone zero zapisów po podwójnym kliknięciu i jeden zapis
po kolejnym, prawdziwym kliknięciu "Zapisz zmiany".

### Faza 4 — Zarządzanie interwałami — ✅ ukończona

**Co działa:**

- **Zarządzana lista interwałów** (`domain::interval::Interval`, migracja `0007_intervals`) —
  ten sam wzorzec co `EmotionalState`, rozszerzony o niezależną flagę `archived_at`: `hidden` to
  szybki przełącznik widoczności dostępny też dla wbudowanych, `archived_at` to docelowe miejsce
  dla własnych interwałów w przyszłym uniwersalnym Koszu (Faza 5). Sześć wbudowanych wpisów
  (M1/M5/M15/M30/H1/H4) nie do przemianowania/archiwizacji — tylko ukrycia i reorder; własne
  interwały użytkownika można dodać, przemianować, ukryć, zarchiwizować/przywrócić.
  `SqliteIntervalRepository`: CRUD + `update_label`/`archive`/`restore` (odrzucają wbudowane) +
  `reorder`. Nowe komendy: `create/get/list/update_interval_label/set_interval_hidden/
archive/restore/reorder_intervals`.
- **Transakcja przechowuje ID + zamrożoną migawkę etykiety**: `Trade.interval_id` (odniesienie) +
  `Trade.interval` (etykieta z momentu zapisu, np. "M15") — ten sam wzorzec co migawka
  instrumentu/strategii. `TradesService::build_write` resolwuje `interval_id` → `Interval` →
  zamrożoną etykietę (`TradeWrite.interval_snapshot`); `TradeInput` ma tylko `interval_id`, nigdy
  wolnego tekstu. Późniejsze przemianowanie/archiwizacja interwału w zarządzanej liście nie
  zmienia już zapisanej historycznej etykiety (potwierdzone testem integracyjnym).
- `TradeFormModal`: pole "Interwał (opcjonalnie)" zamienione z wolnego tekstu na `Select`
  wypełniany zarządzaną listą (tylko widoczne/aktywne); jeśli edytowana transakcja używa
  interwału ukrytego/zarchiwizowanego od tego czasu, nadal pokazuje go jako wybraną wartość z
  oznaczeniem — ten sam wzorzec co ukryty instrument.
- Nowy `IntervalsSection` w Ustawieniach (lista z reorder góra/dół, ukryj/pokaż dla wszystkich,
  przemianuj/archiwizuj/przywróć tylko dla własnych, dodawanie nowych) — obok istniejącej sekcji
  "Stany emocjonalne".

**Przetestowane:**

- Rust: **161 testów** przechodzi (`cargo test`), `cargo clippy -D warnings`/`cargo fmt --check`
  czyste. Nowe testy: domena interwału (walidacja etykiety), repozytorium (seed 6 wbudowanych
  widocznych/aktywnych, tworzenie własnego po wbudowanych, odrzucenie duplikatu etykiety,
  ukrywanie wbudowanego nigdy nie usuwa, odrzucenie archiwizacji/przemianowania wbudowanego,
  cykl archiwizuj-przywróć własnego, przemianowanie własnego, reorder), migracja (rejestracja
  wersji 7, upgrade istniejącej bazy), integracyjny test `TradesService` potwierdzający, że
  transakcja zamraża etykietę interwału i późniejsze przemianowanie w zarządzanej liście nie
  zmienia już zapisanej historycznej wartości.
- Frontend: `pnpm typecheck`/`eslint`/`prettier --check`/`test` (Vitest 13/13) czyste.
- Zweryfikowane w przeglądarce (fałszywy most Tauri): ekran "Interwały" w Ustawieniach — 6
  wbudowanych + 1 własny, przemianowanie własnego inline (edycja → zapisz), reorder przyciskami
  góra/dół (potwierdzony nowy porządek), archiwizacja własnego (badge "zarchiwizowany",
  przycisk zmienia się na "Przywróć") i przywrócenie. Formularz nowej transakcji: pole
  "Interwał (opcjonalnie)" pokazuje `Select` z 6 wbudowanymi + własnym, wybór "M15" i zapis
  transakcji poprawnie wysyła `interval_id: "i3"` w payloadzie `create_trade` (przechwycone i
  zweryfikowane bezpośrednio) — bez żadnego pola `interval` (wolny tekst) w `TradeInput`.

**Następny krok:** Faza 5 — uniwersalny Kosz (soft-delete dla kont, transakcji, strategii,
własnych instrumentów/wersji, własnych interwałów, elementów zasad). **Zmiana kolejności na
wyraźną prośbę użytkownika:** zamiast Fazy 5 jako następnej, wykonana została najpierw Faza 9
(Raporty) — patrz poniżej. Fazy 5-8 pozostają nierozpoczęte i czekają w pierwotnej kolejności.

### Faza 9 — Raporty: jedna zakładka, 5 podraportów, prawdziwe wykresy — ✅ ukończona

**Uwaga o kolejności:** ta faza została wykonana PRZED Fazą 5-8 na wyraźną prośbę użytkownika
("chyba mi bardziej zależy żebyś najpierw z raportami zaczął się bawić"). Fazy 5-8 nie zostały
usunięte z planu 12 faz — czekają w oryginalnej kolejności.

**Co działa:**

- **Recharts** (React, MIT, bez CDN) zamiast dotychczasowego ręcznego SVG z Celu 1.6 -
  `EquityCurveChart` przepisany na `AreaChart` (gradient wypełnienia, tooltip z datą i wynikiem,
  używany teraz też na Dashboardzie, nie tylko w Raportach), nowy `GroupBarChart` (słupkowy,
  kolorowanie zysk/strata przez własny `shape` na `<Bar>` - `<Cell>` jest przestarzałe w
  Recharts 3, więc słupki poniżej zera renderowane przez normalizację ujemnej wysokości
  `<rect>`, bo SVG odmawia narysowania elementu z ujemną wysokością).
- **Rozbudowany silnik metryk** (`domain::trade_stats`): `average_trade_duration_minutes`
  (średni czas między otwarciem i zamknięciem), `max_drawdown` (największe obsunięcie
  peak-to-trough na krzywej skumulowanego wyniku), `compute_monthly_breakdown`/
  `compute_yearly_breakdown` (grupowanie po dacie zamknięcia, sortowane chronologicznie -
  inaczej niż istniejące rozbicia wg strategii/instrumentu, które sortują po wyniku),
  `compute_day_of_week_breakdown` (zawsze wszystkie 7 dni Poniedziałek-Niedziela, nawet bez
  transakcji danego dnia). Wszystkie zwracają istniejący typ `GroupBreakdown` (bez nowych
  struktur) - jeden kształt danych dla każdego rozbicia w całej aplikacji.
- **`ReportFilter`/`get_filtered_report`** (`application::reports`) - wspólny, jeden silnik
  filtrowania (konto/instrument/strategia/interwał/kierunek/rok/miesiąc) używany przez wszystkie
  podraporty na raz, żeby liczby nigdy się nie rozjechały między KPI/wykresami/tabelami. Rok/
  miesiąc filtrują po dacie zamknięcia - transakcje bez `closed_at` (szkice/otwarte) są
  wykluczone tylko, gdy filtr okresu jest aktywny. Osobna komenda `compare_accounts_report`
  (statystyki całościowe per konto, bez filtrów wymiarów - konta mogą mieć różne waluty).
- **Jedna zakładka "Raporty" z 5 podzakładkami**: Miesięczny, Roczny, Porównanie kont,
  Instrument, Strategia - wspólny, lepki pasek filtrów (`ReportFilterBar`: konto/instrument/
  strategia/interwał/rok/miesiąc/kierunek/"Wyczyść") nad zakładkami. Lista lat do wyboru liczona
  niezależnie od aktywnego filtru roku (osobna "sonda" `get_filtered_report` tylko z `account_id`
  przy zmianie konta), żeby wybranie roku nie zwężało też opcji samej listy lat.
  - **Miesięczny/Roczny**: KPI + `GroupBarChart` + tabela (`BreakdownTable`, nowy wspólny
    komponent) rozbicia po okresie - respektują też pozostałe wymiary filtru (instrument/
    strategia/interwał/kierunek), więc "wynik miesięczny dla EURUSD" działa bez dodatkowego kodu.
  - **Instrument/Strategia** (`ReportDimensionTab`, jeden wspólny szablon dla obu): bez wybranej
    wartości pokazuje ranking (wykres + klikalna tabela), po kliknięciu wiersza pokazuje
    szczegółowy widok (KPI, krzywa kapitału, rozbicie wg dnia tygodnia) scopowany do tej jednej
    wartości - `report` jest już przefiltrowany przez backend, front nic nie przelicza. Przycisk
    "Wróć do rankingu" czyści filtr.
  - **Porównanie kont**: tabela (nie wykres - różne konta mogą mieć różne waluty, jeden wspólny
    wykres słupkowy mieszający kwoty w różnych walutach byłby wprowadzający w błąd), sortowana
    po wyniku netto malejąco, każdy wiersz z walutą właściwą dla danego konta.
  - Wspólne komponenty: `ChartCard` (wrapper karty wykresu/tabeli), `StatCard` (już istniejący,
    pełni rolę "KpiCard" z dokumentu), `GroupBarChart`, `BreakdownTable` - reużyte we wszystkich
    5 podraportach zamiast duplikowania.

**Przetestowane:**

- Rust: **172 testy** przechodzi (`cargo test`), `cargo clippy -D warnings`/`cargo fmt --check`
  czyste. Nowe testy: silnik metryk (średni czas trwania z/bez `opened_at`, maksymalne
  obsunięcie na krzywej z kilkoma szczytami, rozbicie miesięczne/roczne sortowane chronologicznie
  nie po wyniku, rozbicie wg dnia tygodnia zawsze 7 dni w ustalonej kolejności), filtrowany
  raport (brak filtrów = identyczny wynik jak stary `get_account_report`, zawężanie po kierunku,
  zawężanie po roku+miesiącu), porównanie kont (jeden wiersz per konto).
- Frontend: `pnpm typecheck`/`eslint --max-warnings=0`/`prettier --check`/`test` (Vitest 13/13)
  czyste.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri, realistyczne dane 2 kont w
  różnych walutach, 2 instrumentów, 2 strategii, 3 miesięcy): wszystkie 5 zakładek renderują się
  poprawnie z prawdziwymi wykresami Recharts, filtr wspólny działa (wybór instrumentu w karcie
  "Instrument" ustawia filtr widoczny też w pasku), drill-down → "Wróć do rankingu" poprawnie
  czyści wybór, Porównanie kont pokazuje oba konta z właściwymi walutami.
- **Znaleziony i naprawiony błąd przy tej weryfikacji:** własny `shape` renderujący słupki
  wykresu jako `<rect>` nie obsługiwał wartości ujemnych - Recharts przekazuje im ujemną
  `height`, a SVG z definicji odmawia narysowania elementu z ujemną wysokością/szerokością
  (słupek po prostu nie był widoczny, bez błędu w konsoli). Naprawione normalizacją: `Math.abs`
  na wysokości + przesunięcie `y` o różnicę, gdy wysokość była ujemna.
- **Znaleziony i naprawiony błąd gramatyczny:** podpowiedź pod rankingiem Instrument/Strategia
  składała "dla jednego {dopełniacz}u" przez konkatenację, co dla "instrumentu" dawało
  "instrumentuu". Naprawione przez przekazanie całej, poprawnie odmienionej podpowiedzi z miejsca
  wywołania (`pickHint`) zamiast składania jej ze słowa w dopełniaczu.

**Następny krok:** powrót do pierwotnej kolejności - Faza 5 (uniwersalny Kosz).

### Faza 9 v2 — Przebudowa wszystkich raportów i dashboardu na wzór arkusza referencyjnego — ✅ ukończona

**Uwaga o kolejności/zakresie:** użytkownik przesłał 9 zrzutów ekranu własnego arkusza Google Sheets
"Dziennik Tradingowy" (Raport Symbolu, Raport Strategii, Raport Kont, Raport Roczny, Raport
Miesięczny, Dashboard) z prośbą o przebudowę wszystkich 5 podraportów i dashboardu na podobną
zawartość informacyjną - z jawnym pozostawieniem swobody co do warstwy wizualnej ("sformatuj tak
jak uważasz że będzie najlepiej pasować"). Zdecydowano: zachować ciemny motyw i komponenty
aplikacji (StatCard/Table/GroupBarChart), nie kopiować wyglądu arkusza kalkulacyjnego (biały tło,
siatka komórek).

**Co działa:**

- **Nowe metryki w `domain::trade_stats`**: `total_commission` w `TradeStats`; `win_count`/
  `loss_count` per dzień w `DailyPnl`; `compute_four_hour_breakdown` (6 przedziałów 00-03..20-23
  wg godziny UTC zamknięcia), `compute_side_breakdown` (BUY/SELL), `compute_quarterly_breakdown`
  (Q1-Q4), `compute_calendar_month_breakdown` (12 miesięcy Sty-Gru, zawsze wszystkie, nawet bez
  transakcji), `compute_interval_breakdown` (grupowanie po zamrożonej migawce interwału);
  `compute_month_calendar` (każdy dzień KONKRETNEGO miesiąca, w odróżnieniu od `compute_calendar`
  które zwraca tylko dni z transakcjami); `compute_top_trades` (TOP-N najlepszych/najgorszych
  transakcji); `compute_pnl_distribution` (histogram 6 przedziałów wyniku netto, czysta arytmetyka
  Decimal, bez konwersji na float).
- **`compute_period_balance`** (`domain::balance`) - saldo początkowe/końcowe, wpłaty/wypłaty netto,
  zwrot % i maksymalne obsunięcie (względem salda początkowego OKRESU, nie szczytu życia konta) dla
  dowolnego okresu (miesiąc/rok/cały czas) - reużywa istniejącej chronologicznej linii czasu salda,
  rozszerzonej o flagę `is_cash_operation` do rozdzielenia przepływów gotówkowych od wyniku transakcji.
- **`ReportsService` zależny teraz też od `AccountsService`** (obliczenia salda okresowego per konto)
  - `FilteredReport` wzbogacony o wszystkie powyższe rozbicia + `period_balance`, `month_calendar`
    (liczony tylko gdy rok+miesiąc oba ustawione); `AccountComparisonRow` dostał też `period_balance`.
- **Przebudowane wszystkie 5 podraportów + Dashboard** (ten sam silnik `FilteredReport`, żadnych
  nowych komend poza jednym reużyciem `compare_accounts_report` w Raporcie Strategii do wykresu
  "Wynik wg konta"):
  - **Raport Symbolu/Strategii** (`ReportSymbolTab`/`ReportStrategyTab`, zastąpiły wspólny
    `ReportDimensionTab`) - dedykowane, bo różne wymiary porównania (Symbol: strategia/kierunek/
    dzień tygodnia/interwał; Strategia: instrument/konto/interwał/miesiąc).
  - **Raport Roczny** - 18 KPI (w tym saldo początkowe/końcowe roku, zwrot roczny, max drawdown
    roku), 5 wykresów (miesięczny, skumulowany, win rate/miesiąc, kwartalny, kołowy dodatnie/
    ujemne miesiące), "Liderzy roku" (najlepsza/najgorsza strategia/instrument, najaktywniejszy/
    najspokojniejszy miesiąc), tabele miesięcy i kwartałów z wierszem "Łącznie".
  - **Raport Miesięczny** - 18 KPI, 5 wykresów (dzienny, skumulowany w miesiącu, wg strategii,
    kołowy zysk/strata, wg instrumentu), kalendarz dnia po dniu (`MonthCalendarTable`),
    "Podsumowanie jakościowe" (najlepszy/najgorszy dzień/strategia/instrument), dwie tabele TOP-5
    transakcji (`TopTradesTable`).
  - **Porównanie kont** - leaderboard (najlepsze konto wg P&L/win rate/prowizji/drawdownu/
    aktywności/oczekiwanej wartości), pełna tabela porównawcza z wierszem "Łącznie", 4 wykresy
    (P&L/win rate/zwrot/max DD per konto) - ostrzeżenie w karcie P&L gdy konta mają różne waluty.
  - **Dashboard** - pełny pasek filtrów (`useReportFilter`, wspólny hook wydzielony z logiki
    Raportów), 8 KPI, 5 wykresów, rankingi TOP-5 (instrument/strategia/konto), dwie mapy
    cieplne (`HeatmapTable` - dzień tygodnia × wynik, godzina × wynik) i tabela rozkładu wyniku.
  - Nowe komponenty wykresów: `SimplePieChart`, `CumulativeLineChart`, `MonthCalendarTable`,
    `TopTradesTable`, `HeatmapTable`.

**Przetestowane:**

- Rust: **189 testów** przechodzi (`cargo test --lib`), `cargo fmt --check` i
  `cargo clippy --all-targets -- -D warnings` czyste poza jednym, wcześniej istniejącym
  ostrzeżeniem `large_enum_variant` na `DbState::Ready` (narastające od Fazy 4, nie wprowadzone
  przez tę pracę - zgłoszone jako osobne zadanie w tle, nie naprawiane teraz, bo wymagałoby
  dotknięcia każdej komendy).
- Frontend: `pnpm typecheck`/`eslint` (0 błędów, tylko 4 wcześniej istniejące ostrzeżenia
  `react-refresh/only-export-components`)/`prettier --check`/`test` (Vitest 13/13) czyste.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri, realistyczne dane: 2 konta w różnych
  walutach, 2 instrumenty, 2 strategie, 2 interwały, pełny miesiąc marzec 2026, 12 miesięcy,
  4 kwartały, 7 dni tygodnia, 6 przedziałów 4-godzinnych, histogram wyniku) - Dashboard i wszystkie
  5 podraportów (Miesięczny, Roczny, Porównanie kont, Instrument, Strategia) renderują się
  poprawnie: KPI, wykresy (słupkowe, kołowe, liniowe, obszarowe) z prawidłowymi kolorami i legendą,
  mapy cieplne, tabele z wierszami "Łącznie", leaderboardy, kalendarz miesiąca z prawidłowym
  wyliczeniem dni tygodnia.
- **Znaleziony i naprawiony błąd:** karty "Najlepszy dzień"/"Najgorszy dzień" w Raporcie Miesięcznym
  pokazywały surową datę ISO ("2026-03-05") zamiast czytelnego formatu - naprawione funkcją
  `formatDayLabel` (formatowanie `pl-PL`, strefa UTC, żeby nie przesuwało dnia).

**Następny krok:** powrót do pierwotnej kolejności - Faza 5 (uniwersalny Kosz).

## Pozostałe cele Etapu 1

Patrz [ROADMAP.md](ROADMAP.md) — jeszcze nierozpoczęte.
