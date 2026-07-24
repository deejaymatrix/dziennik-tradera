# Postęp prac

Ostatnia aktualizacja: 2026-07-21 (Faza 10: wspólne komponenty + audyt - ukończona, patrz Faza 10
poniżej)

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

## Cel 1.8 — Publiczny mechanizm autoaktualizacji i powiadomień — 🔒 **NIEGOTOWY** (kod kompletny, cztery blokady poza kodem)

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

### Resprawdzenie po audycie (2026-07-23)

Sprawdzone na żywo, nie z pamięci:

- Repozytorium `deejaymatrix/dziennik-tradera` jest **PUBLICZNE** (`gh repo view`), więc endpoint
  `releases/latest/download/latest.json` będzie pobieralny bez logowania. To był realny warunek —
  w prywatnym repozytorium zasoby wydania wymagają uwierzytelnienia i aktualizacje by nie działały.
- Placeholder nazwy repozytorium w `tauri.conf.json` jest już podmieniony na prawdziwy adres.
- `.github/workflows/release.yml` używa `tauri-apps/tauri-action@v1`; sprawdzone przez API
  GitHuba — `v1.0.0` jest najnowszym wydaniem akcji, a `v1` to ruchomy tag głównej wersji.
- **`gh secret list` nie zwraca nic, `gh release list` nie zwraca nic.** Czyli: sekrety podpisu
  nie są ustawione i nie ma żadnego wydania. Dopóki to się nie zmieni, każde sprawdzenie
  aktualizacji kończy się błędem — oczekiwanym, ale do tej pory pokazywanym użytkownikowi jako
  surowy angielski komunikat wtyczki.

Dodane (bez zmiany MECHANIZMU aktualizacji, czego zabrania sekcja 3 promptu redesignu):

- `describeUpdateError` w `app/useUpdater.ts` — tłumaczy błąd na zdanie, z którym da się coś
  zrobić: brak sieci („aplikacja działa normalnie bez sieci"), brak wydania („to normalne przed
  pierwszym wydaniem"), niezgodny podpis (ostrzeżenie i zakaz ręcznej instalacji). 5 testów.
- `src-tauri/src/wersja.rs` — test zgodności numeru wersji w `Cargo.toml`, `tauri.conf.json`
  i `package.json`. Rozjazd psuje aktualizacje niewidocznie: gdy `tauri.conf.json` zostaje
  w tyle, aktualizacja jest proponowana w kółko po zainstalowaniu; gdy wyprzedza — nigdy się
  nie pokaże. Diagnostyka czyta wersję z tej samej stałej, więc nie ma drugiego źródła.

**⚠️ Wymaga uwagi użytkownika przed pierwszym wydaniem** (szczegóły w
`docs/adr/0005-autoaktualizacja.md`): `tauri.conf.json` ma placeholder
`TWOJA-NAZWA-UZYTKOWNIKA/dziennik-tradera` zamiast prawdziwego adresu repozytorium GitHub -
trzeba go podmienić i dodać dwa sekrety (`TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) w ustawieniach repozytorium, zanim autoaktualizacja
zadziała naprawdę. Do tego czasu przycisk "Sprawdź aktualizacje" będzie zwracał błąd - to
oczekiwane.

### Rozszerzenie zakresu (2026-07-23/24): dokument uzupełniający z obowiązkowym audytem

Użytkownik przysłał zaktualizowany, znacznie szerszy Cel 1.8 („Publiczny mechanizm
autoaktualizacji i powiadomień"), a potem osobny dokument „Uzupełnienie... obowiązkowy audyt
autoaktualizacji" zabraniający rozpoczęcia Celu 1.9 dopóki cała macierz audytowa nie ma statusu
PASS. Poniższe zostało zbudowane w ośmiu krokach (commity „Cel 1.8 (1/n)"–„(8/n)"):

1. **Logika harmonogramu** (`app/updateMonitor.ts`, 25 testów) — interwał 10 minut, jitter ±10%,
   narastający backoff do 60 minut, próg 5 minut dla powrotu na pierwszy plan, porównywanie
   wersji liczbowe (nie tekstowe), `last_notified_version` w `localStorage`.
2. **Lekkie sprawdzanie manifestu** (`src-tauri/src/infrastructure/update_manifest.rs`, 13 testów,
   6 na realnym HTTP przez własny serwer TCP w `std` — zero nowych zależności w buildzie) —
   żądanie warunkowe z `If-None-Match`/`ETag`, świadomie BEZ weryfikacji podpisu (to zostaje
   wyłącznie po stronie `tauri-plugin-updater`).
3. **`tauri-plugin-notification`** dodana (Rust + frontend + uprawnienie).
4. **Jeden centralny serwis** (`app/UpdateMonitorProvider.tsx`, 17 testów) — zastąpił
   jednorazowe sprawdzenie w `AppShell`; dokładnie jeden timer, przeżywa zmiany widoku,
   nie duplikuje się przy przerysowaniu (zweryfikowane licznikiem wywołań, nie przeglądem kodu).
5. Karta w Ustawieniach i TRWAŁY znacznik w górnym pasku podpięte pod centralny serwis
   (usunięty zdublowany, niezależny `useUpdater`).
6. Testy realnych odpowiedzi HTTP (404/500/304/uszkodzony JSON/ETag/DNS) + dwie poprawki
   we WŁASNYCH testach (brakujący dostawca kryptografii rustls, złe założenie o treści błędu).
7. Natywne powiadomienie systemowe respektuje przełącznik `update_available` i ciche godziny
   (wcześniej to zgubione po przejściu na centralny serwis) — trwały znacznik i karta w
   Ustawieniach zostają widoczne ZAWSZE, tylko popup jest wyciszany.
8. Kliknięcie natywnego powiadomienia nawiguje do Ustawień → Aktualizacje
   (`zadanieOtwarciaUstawien` + `AppShell`, bo centralny serwis stoi nad routerem i nie ma
   własnego dostępu do nawigacji).

Po drodze naprawiony też realny dług: 21 nieujawnionych błędów lintu w pliku testowym
z kroku 4 (`require-await` na wzorcu `act(async () => { vi.advanceTimersByTime(...) })`) —
wyłączone świadomie dla plików testowych w `eslint.config.js` z uzasadnieniem w komentarzu,
zamiast usuwać `async` i ryzykować cichą niestabilność testów z fałszywymi timerami.

**Pełna macierz audytowa wymagana przez dokument uzupełniający:**
[`MACIERZ_AUDYTU_CEL_1_8.md`](MACIERZ_AUDYTU_CEL_1_8.md).

**Werdykt: CEL 1.8 — NIEGOTOWY.** Cztery blokady, żadna nie jest luką w kodzie:

1. Certyfikat Authenticode — brak (decyzja i wydatek użytkownika).
2. Sekrety GitHub Actions (`TAURI_SIGNING_PRIVATE_KEY`, `..._PASSWORD`) — nie ustawione;
   celowo NIE zrobione przeze mnie, bo to klucz prywatny użytkownika (`docs/KLUCZE_I_WYDANIE.md`).
3. Żadne wydanie nigdy nie zostało opublikowane (`gh release list` puste).
4. Test na niezależnym komputerze Windows 10/11 x64 — fizycznie niemożliwy z tego środowiska.

Zgodnie z dokumentem uzupełniającym: **nie rozpoczynam Celu 1.9 i nie przygotowuję instalatora**,
dopóki użytkownik nie zamknie tych czterech punktów. Po ich zamknięciu pozostałe pozycje
macierzy są już PASS i pełny test z sekcji 3 macierzy powinien przejść bez dodatkowych zmian
w kodzie.

**Następny krok:** zablokowany do czasu decyzji użytkownika w sprawie certyfikatu Authenticode
i wykonania kroków z `docs/KLUCZE_I_WYDANIE.md`. Do tego czasu kontynuuję pracę nad pozostałymi
otwartymi pozycjami planu, które nie zależą od tej blokady.

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

**Poprawki wizualne tego samego dnia (na wyraźną prośbę użytkownika - pasek filtrów "zbyt
tłoczny", opisy osi X wykresów słupkowych nieczytelne przy wielu kategoriach):**

- Etykieta "TPowne" zmieniona na "Zyskowne" we wszystkich raportach (KPI, tabele, wykres kołowy).
- Pasek filtrów (`ReportFilterBar`) przebudowany na dwa skompaktowane, pogrupowane rzędy: "Zakres"
  (Konto/Rok/Miesiąc + "Wyczyść") i "Filtry" (Instrument/Strategia/Interwał/Kierunek) - nowy
  wariant `compact` na `Select` (mniejszy padding/font) zamiast dotychczasowego jednego,
  rozlanego rzędu 7 pól. Realny błąd znaleziony przy weryfikacji: dodanie `flex: 1 1 7.5rem` do
  klasy filtra wylądowało na samym `<select>` (className z `ReportFilterBar` trafia na element
  `<select>`, nie na jego wrapper), a ponieważ RODZIC tego `<select>` (wewnętrzny wrapper `Select`)
  jest kontenerem flex w układzie `column`, `flex-basis` zinterpretowany został jako WYSOKOŚĆ, nie
  szerokość - każdy select rozjeżdżał się do kwadratu 120×120px. Naprawione usunięciem `flex`,
  zostały tylko `min-width`/`max-width`/`width: 100%` (właściwości niezależne od osi flex).
- `GroupBarChart`/`CumulativeLineChart` (pierwsza wersja tej poprawki, **później skorygowana
  poniżej** na wyraźną prośbę użytkownika): dynamiczny interwał etykiet osi X (maks. ~12
  widocznych) zamiast wymuszania każdej etykiety. Nowy prop `fullWidth` na `ChartCard` dla
  wykresów z wieloma kategoriami (dzienny P&L w Raporcie Miesięcznym, miesięczne/kwartalne wykresy
  w Raporcie Rocznym i Strategii, liczba transakcji/miesiąc na Dashboardzie) - pełna szerokość
  siatki zamiast wąskiej połowy. To zostaje w mocy.
- `GroupBarChart` dostał nowy prop `unit="count"` (formatowanie liczb całkowitych bez waluty,
  `allowDecimals={false}` na osi Y) - naprawia dwa realne błędy na wykresie "Liczba transakcji per
  miesiąc" na Dashboardzie: wcześniej pokazywał "5,00" (format pieniężny) dla liczby transakcji, a
  automatyczne tyki osi Y potrafiły wygenerować wartości typu "2,25" (nie ma 2,25 transakcji).
- **Poza zakresem, ale naprawione po drodze:** `eslint.config.js` nie wykluczał `.claude/worktrees/**`
  (izolowane katalogi robocze zadań w tle, np. `spawn_task`) - `pnpm eslint` zaczął liczyć tysiące
  błędów typów z kopii kodu bez zainstalowanych zależności w takim katalogu. Dodano `"**/.claude/**"`
  do `ignores`.

**Druga runda poprawek tego samego dnia (użytkownik: "nie każda jedna rzecz będzie ponumerowana
żeby nie było wątpliwości czego dotyczy", "dopasuj dane filtry które będą pasować do danego
raportu żeby nie mieszać użytkownikowi"):**

- **Wycofane ograniczanie liczby etykiet osi X z poprzedniej rundy** - użytkownik chce WSZYSTKIE
  etykiety widoczne (np. wszystkie 31 dni miesiąca ponumerowane po kolei, bez pomijania), żeby nie
  było wątpliwości, którego dnia/miesiąca dotyczy słupek. `GroupBarChart`/`CumulativeLineChart`
  renderują teraz `interval={0}` (zawsze) i zamiast pomijać etykiety, dynamicznie zwiększają obrót
  (-25°/-35°/-60° w zależności od liczby kategorii) i zmniejszają czcionkę przy >20 kategoriach -
  w połączeniu z `fullWidth` z poprzedniej rundy daje to wszystkie etykiety bez nakładania.
  **Zweryfikowane pomiarem realnych `getBoundingClientRect()` elementów `<text>` na osi X** (nie
  tylko wizualnie) przy prawdziwej minimalnej szerokości okna aplikacji (`tauri.conf.json`:
  `minWidth: 1024`) - 0 nakładających się par etykiet dla 31-dniowego wykresu dziennego. Przy
  sztucznie węższym viewporcie testowym Browser pane (~800px z panelem bocznym, węższym niż
  realne minimalne okno aplikacji) etykiety faktycznie nieznacznie się nakładały (2-3px) - to nie
  jest realny scenariusz użycia, więc nie wymaga dalszej poprawki.
- **Pasek filtrów dopasowany do konkretnego podraportu** (`ReportFilterBar` dostał opcjonalny
  prop `reportKind`, nieużywany na Dashboardzie - tam widoczne są wszystkie pola, bo to jeden
  ogólny widok): pole "Miesiąc" ukryte w Raporcie Rocznym (zawężenie do jednego miesiąca byłoby
  sprzeczne z samą ideą podsumowania rocznego i mogłoby dawać mylące liczby), pole "Konto" ukryte
  w Porównaniu kont (ten raport z definicji zawsze porównuje WSZYSTKIE konta - zmiana konta w
  filtrze nic by tam nie zmieniła, tylko sugerowałaby błędnie, że coś robi). Przełączenie na
  zakładkę Roczny jawnie czyści `filter.month`, jeśli był ustawiony na innej zakładce - bez tego
  ukryte pole nadal zawężałoby raport w tle, niewidocznie dla użytkownika (sprawdzone: bez
  czyszczenia "P&L netto roku" pokazywałoby wynik samego marca, nie całego roku).

**Trzecia poprawka tego samego dnia** ("przy wyborze konta umożliw porównanie wszystkich kont"):
Dashboard (jedyne miejsce bez osobnej zakładki "Porównanie kont") dostał opcję "Wszystkie konta
(porównanie)" w polu "Konto" - nowy sentinel `ALL_ACCOUNTS_VALUE` w `ReportFilterBar`, prop
`allowAllAccounts` (na tym etapie używany tylko przez Dashboard - **później tego samego dnia
użytkownik poprosił o to samo w Raportach, patrz czwarta poprawka poniżej**, więc ten osąd o
zbędnej duplikacji się nie utrzymał). Wybranie tej opcji podstawia w miejsce
zwykłych KPI/wykresów jednego konta ten sam komponent `ReportAccountComparisonTab`, który już
zasila zakładkę Porównania kont w Raportach - zero duplikacji logiki/UI. `useReportFilter`
przestaje odpytywać `get_filtered_report` o nieistniejące "konto" `__all__` (zwracałoby błąd) -
lista dostępnych lat w tym trybie pochodzi z pierwszego prawdziwego konta jako reprezentanta (ten
sam kompromis, jaki już miała istniejąca zakładka Porównania kont). Zweryfikowane w przeglądarce:
przełączenie Konto → "Wszystkie konta" pokazuje leaderboard + tabelę + 4 wykresy porównawcze z
poprawnymi, różnymi danymi DEMO/LIVE; przełączenie z powrotem na konkretne konto poprawnie
wraca do zwykłego widoku Dashboardu z jego saldem.

**Czwarta poprawka tego samego dnia** - dwa niezależne zgłoszenia użytkownika:

1. **Realny błąd: krzywa kapitału obcinała etykiety osi Y przy dużych kwotach** (zrzut ekranu
   użytkownika pokazywał same "000 000,00" powtórzone na każdym poziomie osi, tylko jeden punkt
   bez linii). Przyczyna: Recharts NIE mierzy szerokości etykiet osi Y automatycznie - domyślna/
   dotychczasowa szerokość (`width={72}` albo domyślne 60px biblioteki) jest sztywną liczbą
   pikseli niezależną od treści, więc długa sformatowana liczba (miliony) po prostu wychodziła
   poza lewy kraniec SVG (tekst rośnie w lewo od punktu zakotwiczenia `text-anchor="end"`, a SVG
   nie ma czegoś w rodzaju "auto-width") - widoczne wyłącznie były ostatnie ~10 znaków. Naprawione
   nowym wspólnym helperem `pages/chartAxis.ts::estimateYAxisWidth(values, formatValue)` (szacuje
   potrzebną szerokość z najdłuższej sformatowanej etykiety + zapas na "zaokrąglone" tyki),
   użytym w `EquityCurveChart`, `GroupBarChart` i `CumulativeLineChart` (wszystkie trzy miejsca ze
   sztywną szerokością osi Y w całej aplikacji - sprawdzone `grep`em). Sam "jeden punkt bez linii"
   z zrzutu ekranu nie był osobnym błędem - to normalna konsekwencja posiadania tylko jednego
   punktu danych (linii/obszaru nie da się narysować przez jeden punkt) - po dodaniu kilku
   punktów z dramatycznym wzrostem (10 000 → 5 210 000) krzywa renderuje się poprawnie, ostro
   rosnąc i płaszcząc się, zgodnie z oczekiwaniem. Zweryfikowane pomiarem realnych
   `getBoundingClientRect()` wszystkich 22 etykiet osi Y widocznych na stronie - 0 z lewym
   krańcem poniżej x=0 (czyli 0 obciętych), nie tylko wizualnie na zrzucie ekranu.
2. **"Wszystkie konta (porównanie)" trafiło też do zakładki Raporty** (wcześniej tylko Dashboard) -
   ta sama opcja w polu "Konto", zsynchronizowana dwustronnie z zakładką "Porównanie kont".
   **Superseded - patrz piąta poprawka poniżej: użytkownik uznał to za błędny pomysł tego samego
   dnia i poprosił o wycofanie z Raportów** (zostało tylko na Dashboardzie).

**Piąta poprawka tego samego dnia** - dwa kolejne zgłoszenia użytkownika:

1. **Wycofano "Wszystkie konta (porównanie)" z zakładki Raporty** ("to był jednak zły pomysł") -
   `ReportsPage` wraca do stanu sprzed czwartej poprawki: `onChange={setFilter}` bez
   `handleFilterChange`, `selectTab` bez synchronizacji Konto↔zakładka, brak propa
   `allowAllAccounts` na `<ReportFilterBar>`. `ReportFilterBar` przywraca `showAccount =
reportKind !== "compare"` (pole "Konto" znowu ukryte na zakładce "Porównanie kont", bo tam
   nie miałoby żadnego efektu). Opcja **zostaje na Dashboardzie** - tam się sprawdziła, bo
   Dashboard nie ma zakładek, więc to jedyny sposób na porównanie kont w tym widoku.
2. **Lista startowa "Start pracy" na Dashboardzie chowa się teraz automatycznie**, gdy użytkownik
   zrobił realny postęp - nie tylko po ręcznym kliknięciu "×". Warunek: istnieje co najmniej
   jedna własna strategia ORAZ co najmniej jedna transakcja (`strategies.length > 0 && report !==
null && report.stats.total_trades > 0`). Konto i instrumenty NIE są częścią tego warunku -
   konto musi już istnieć, żeby Dashboard się w ogóle wyrenderował, a fabryczny katalog 350
   instrumentów istnieje zawsze od instalacji, więc nie ma tam żadnego "zrobiłem to" do wykrycia
   (samo sprawdzenie strony Instrumenty nie jest mierzalnym stanem danych). Zweryfikowane w
   przeglądarce w obie strony: z co najmniej jedną strategią i transakcją panel jest niewidoczny
   nawet po wyczyszczeniu flagi ręcznego zamknięcia w localStorage; z zerem obu - wraca.

**Następny krok:** powrót do pierwotnej kolejności - Faza 5 (uniwersalny Kosz).

### Faza 5 — Uniwersalny Kosz (soft-delete dla kont, transakcji, strategii, interwałów) — ✅ ukończona

**Co działa:**

- Nowa metoda `delete_permanently` na czterech repozytoriach domenowych, które już miały stan
  "zarchiwizowane/usunięte, ale nie zniknęło" i wcześniej NIE miały żadnego sposobu na trwałe
  usunięcie: `AccountRepository` (kaskadowo usuwa `attachments`/`trade_executions`/`trades`/
  `cash_operations` konta w jednej transakcji SQL), `TradeRepository` (kaskadowo usuwa
  `attachments`/`trade_executions` transakcji), `StrategyRepository` (blokuje trwałe usunięcie,
  jeśli JAKAKOLWIEK transakcja wciąż odwołuje się do strategii - ten sam wzorzec ochrony co
  istniejące już usuwanie instrumentów), `IntervalRepository` (bez blokady - `trades.interval_id`
  nigdy nie miało żywego klucza obcego, zamrożona migawka etykiety przetrwa bez zmian). Każda
  metoda wymaga, żeby element był JUŻ zarchiwizowany/usunięty - nie da się trwale usunąć czegoś
  wprost z aktywnego stanu, trzeba najpierw przejść przez istniejące archive/soft_delete.
- Nowa warstwa aplikacyjna `application::trash::TrashService` - agreguje wszystkie cztery typy w
  jedną listę (`TrashItem`: typ, id, etykieta, data usunięcia, opcjonalna notatka o zależnościach
  typu "Konto ma 3 transakcji" albo "Używana w 2 transakcjach - trwałe usunięcie zablokowane").
  `restore`/`delete_permanently` przyjmują `TrashEntityType` i dyspatchują do właściwej usługi.
  `empty()` (Opróżnij kosz): najpierw twarda automatyczna kopia zapasowa przez nową
  `BackupService::create_automatic_backup` (zapisywana bez okna wyboru pliku do
  `backups/pre-kosz-{timestamp}.dtjbackup`, ten sam katalog co bezpieczne kopie przed
  przywróceniem) - przerywa całą operację, jeśli kopia się nie uda; potem trwałe usunięcie każdego
  elementu, z kontami zawsze na końcu (ich usunięcie kaskadowo zabiera też transakcje - gdyby
  poszły pierwsze, próba osobnego usunięcia "ich" niezależnie usuniętych transakcji fałszywie
  wyglądałaby jak błąd "already gone"). Pojedyncze niepowodzenia (np. żywa transakcja wciąż
  odwołuje się do archiwizowanej strategii) nie przerywają reszty operacji - zbierane są do listy
  `failed`, którą widzi użytkownik.
- Cztery nowe komendy Tauri (`commands::trash`): `list_trash_items`, `restore_trash_item`,
  `purge_trash_item`, `empty_trash`. Nowa pozycja nawigacji "Kosz" w grupie "Dane" (obok "Eksport
  i kopie"), nowy ekran `KoszPage.tsx`: filtr typu, wyszukiwarka po nazwie, tabela z kolumnami
  Typ (kolorowy `Badge`)/Nazwa/Usunięto/Zależności, akcje Przywróć/Usuń trwale (pojedynczo przez
  ikony, zbiorczo przez zaznaczanie checkboxów), przycisk "Opróżnij kosz" (wariant `danger`,
  potwierdzenie z liczbą elementów). Błędy trwałego usunięcia (np. zablokowana strategia) i wynik
  zbiorczych operacji pokazywane przez istniejący system Toast.
- **Świadomie POZA zakresem tej fazy** (udokumentowane, nie przeoczone): własne instrumenty -
  mają już bezpieczne, natychmiastowe trwałe usuwanie (`delete_instrument`, blokowane dla
  fabrycznych i używanych) bez potrzeby pośredniego stanu "w koszu"; wprowadzenie takiego stanu
  wymagałoby nowej kolumny `archived_at` i zmiany istniejącego, już bezpiecznego przepływu usuwania
  na ekranie Instrumentów - uznane za nieproporcjonalne do korzyści. Pojedyncze elementy zasad
  strategii (`EntryRule`/`ManagementRule`) - to zagnieżdżone pola JSON wewnątrz wiersza strategii,
  bez własnej sygnatury czasowej ani niezależnego id-adresowalnego wiersza w bazie; mają już
  swój własny, nie-destrukcyjny przełącznik `archived: bool` zarządzany wprost na ekranie edycji
  strategii - nie pasują do jednorodnego modelu "wiersz z `deleted_at`/`archived_at` do Kosza" bez
  większej przebudowy schematu.

**Przetestowane:**

- Rust: **206 testów** przechodzi (`cargo test --lib`, +17 od ostatniej fazy), `cargo fmt --check`
  i `cargo clippy --all-targets -- -D warnings` czyste poza tym samym, wcześniej zgłoszonym
  ostrzeżeniem `large_enum_variant` na `DbState::Ready` (teraz 320 bajtów po dodaniu pola
  `trash: TrashService` - narastające od Fazy 4, nadal świadomie odłożone jako `task_938ffe80`).
  Nowe testy pokrywają: odrzucenie trwałego usunięcia nie-zarchiwizowanego/nie-usuniętego elementu,
  odrzucenie dla nieistniejącego id, kaskadowe usunięcie konta z jego transakcjami i wykonaniami,
  kaskadowe usunięcie transakcji z jej wykonaniami, blokadę trwałego usunięcia strategii używanej
  w transakcji, agregację listy Kosza z poprawnymi notatkami o zależnościach, `restore`/
  `delete_permanently` przez `TrashService` dyspatchujące do właściwej encji, `empty()` tworzące
  dokładnie jedną kopię zapasową i poprawnie porządkujące usuwanie (transakcje przed ich własnym
  kontem - zero fałszywych niepowodzeń), oraz `empty()` poprawnie raportujące pojedyncze
  niepowodzenie bez przerywania reszty operacji.
- Frontend: `pnpm typecheck`/`eslint` (0 błędów, te same 4 wcześniej istniejące ostrzeżenia)/
  `prettier --check`/`test` (Vitest 13/13) czyste.
- Zweryfikowane wizualnie w przeglądarce (fałszywy most Tauri, cztery przykładowe elementy - po
  jednym z każdego typu, w tym jeden z notatką o zablokowanej zależności): pozycja nawigacji
  "Kosz" widoczna i podświetlana poprawnie; filtr typu i wyszukiwarka poprawnie zawężają listę;
  pojedyncze Przywróć/Usuń trwale wysyłają poprawną komendę z poprawnymi argumentami
  (`entityType`/`id`) i poprawnie obsługują błąd (zablokowana strategia pokazuje komunikat, nie
  crashuje); zaznaczanie checkboxów pokazuje pasek zbiorczy z poprawną liczbą, "Przywróć
  zaznaczone" wysyła poprawną komendę; "Opróżnij kosz" wywołuje `empty_trash` i odświeża listę.
  **Napotkana i obojście**: kliknięcia przez `ref`/współrzędne ekranu w tym konkretnym
  środowisku testowym trafiały w złe miejsce (rozjazd skali między zrzutem ekranu 800px a
  realnym viewportem 1024px) - zweryfikowane zamiast tego przez bezpośrednie `element.click()`
  w JS (wciąż testuje prawdziwy kod aplikacji/React, tylko inny sposób wywołania kliknięcia).

**Następny krok:** Faza 6 — załączniki (zdjęcia i linki) na transakcji.

### Faza 6 — Załączniki (zdjęcia i linki) na transakcji — ✅ ukończona

**Co działa:**

- **Migracja `0008_attachments`**: tabela `attachments` (istniejąca od 0001_init, dotąd pusta)
  dostała w miejscu (`ALTER TABLE`) kolumny `label` (opis zdjęcia / nazwa linku) i `sort_order`
  - indeks `(trade_id, sort_order)`.
- **`domain::attachment`**: `Attachment`/`AttachmentWrite`/`AttachmentKind` (screenshot|link),
  trait `AttachmentRepository` (create/get/list_for_trade/update_label/reorder/delete) i walidator
  `is_valid_https_url` - linki wyłącznie `https://` (odrzuca `http:`, `javascript:`, `data:`,
  białe znaki), otwierane w zewnętrznej przeglądarce dopiero po potwierdzeniu przez użytkownika
  (`tauri-plugin-shell`, uprawnienie `shell:allow-open`).
- **`AttachmentsService`** (jedyne miejsce dotykające plików - repozytorium zna tylko wiersze bazy):
  - format obrazu rozpoznawany z **rzeczywistych bajtów pliku** (magic numbers PNG/JPEG/GIF/WEBP/
    BMP), nigdy z rozszerzenia nazwy - plik wykonywalny przemianowany na `.png` jest odrzucany;
  - limit rozmiaru 15 MB, źródłowe dowiązania symboliczne odrzucane;
  - zdjęcie kopiowane do zarządzanego katalogu `app_data_dir/attachments/` pod własną nazwą
    (UUID + rozszerzenie z rozpoznanego formatu) + SHA-256 w bazie - baza nigdy nie przechowuje
    ścieżki/nazwy od użytkownika, więc nie ma path traversal przy odczycie;
  - odczyt zdjęcia dla frontendu wyłącznie jako `data:` URI (frontend nigdy nie widzi ścieżek);
  - trzy drogi dodania zdjęcia: okno wyboru pliku, przeciągnij-i-upuść, wklejenie ze schowka.
- **Trwałe usuwanie czyści też pliki**: usunięcie pojedynczego załącznika, trwałe usunięcie
  transakcji i trwałe usunięcie konta (Kosz) usuwają fizyczne pliki zdjęć - zawsze dopiero PO
  potwierdzonym sukcesie operacji na bazie, nigdy przed.
- **Backup/restore obejmuje zdjęcia**: `.dtjbackup` zawiera teraz katalog `attachments/`;
  weryfikacja przywracania sprawdza obecność i sumę SHA-256 **każdego** zdjęcia wymienionego w
  bazie kopii zanim cokolwiek zostanie ruszone; przywrócenie podmienia katalog załączników na
  stan z kopii (staging `attachments-pending/` + podmiana przy starcie, przed bazą).
- **4+8 komend Tauri** (`commands/attachments.rs`): list/add-from-path/add-from-bytes(base64)/
  add-link/update-label/reorder/delete/read-image.
- **Frontend - sekcja "Wykres i załączniki" na karcie transakcji** (`TradeAttachments` +
  `useAttachments`): miniatury zdjęć (klik = pełny podgląd w modalu), karty linków (klik =
  potwierdzenie + otwarcie w przeglądarce), opis/nazwa edytowalne inline (zapis przy opuszczeniu
  pola), reorder strzałkami, usuwanie z potwierdzeniem, dropzone (drag&drop), "Wklej ze schowka"
  (Web Clipboard API), "Dodaj zdjęcie" (natywne okno wyboru pliku). Każda akcja to osobna,
  natychmiast zapisywana komenda - sekcja działa też w trybie tylko-do-odczytu karty.

**Przetestowane:**

- Rust: **233 testy** przechodzą (`cargo test --lib`, +27 od Fazy 5), `cargo fmt --check` czyste,
  `cargo clippy --all-targets -- -D warnings` czyste poza wcześniej istniejącym, śledzonym osobno
  ostrzeżeniem `large_enum_variant` na `DbState::Ready`. Nowe testy: walidacja URL (10),
  repozytorium SQLite (6), serwis (8 - w tym odrzucenie nie-obrazu, limitu rozmiaru, symlinka,
  round-trip data-URI, fizyczne usunięcie pliku), Kosz z plikami (2), backup z załącznikami (2 -
  w tym pełny round-trip przywracania z podmianą katalogu).
- Frontend: `pnpm typecheck`/`eslint` (0 błędów, 4 wcześniej istniejące ostrzeżenia)/`prettier`/
  `test` (Vitest 13/13) czyste.
- Zweryfikowane na żywo w przeglądarce (fałszywy most Tauri): sekcja renderuje się na karcie
  transakcji, miniatura + podgląd w modalu, dodanie linku (poprawne argumenty komendy), reorder
  (poprawna nowa kolejność), usunięcie z potwierdzeniem, lista odświeża się po każdej akcji.
- **Znaleziony i naprawiony realny błąd (dzięki weryfikacji w przeglądarce):** formularz "Dodaj
  link" był `<form>` zagnieżdżonym w `<form>` karty transakcji - HTML tego zabrania, React
  zgłaszał błąd w konsoli, a wysłanie formularza potrafiło przeładować całą stronę. Naprawione:
  edytor linku to teraz zwykły `<div>`, zatwierdzenie przyciskiem albo Enterem (z `preventDefault`,
  żeby Enter nie trafił do zewnętrznego formularza karty).

**Uzupełnienie (2026-07-21, na prośbę użytkownika):** załączniki działają też przy TWORZENIU
nowej transakcji, nie tylko na zapisanej. Nowa transakcja nie ma jeszcze id, więc sekcja działa
wtedy w trybie oczekującym: zdjęcia/linki zbierane są lokalnie w formularzu (podgląd z pamięci,
edycja opisu/kolejności/usuwanie bez żadnych komend) i wysyłane na serwer dopiero po udanym
`create_trade` - pojedyncze niepowodzenie wysyłki nie cofa zapisanej transakcji, tylko jest
zgłaszane. Nowa komenda `read_screenshot_candidate` (odczyt + pełna walidacja zdjęcia z dysku BEZ
zapisywania - dla podglądu przed utworzeniem transakcji; 235 testów Rust, +2). Zamknięcie
formularza z oczekującymi załącznikami pyta o potwierdzenie (nie trafiają do szkicu localStorage

- za duże). Zweryfikowane na żywo w przeglądarce: dodanie linku lokalnie nie woła żadnej komendy,
  po "Zapisz" leci `create_trade` + `add_link_attachment` z id nowej transakcji.

**Następny krok:** Faza 8 — nowa zakładka "Zasady handlu" (Faza 7 - lokalny asystent AI - jawnie
odroczona przez użytkownika na osobną aktualizację po instalatorze v1.0).

### Faza 8 — Nowa zakładka "Zasady handlu" — ✅ ukończona

**Co działa:**

- **Migracja `0009_trading_rules`**: tabele `trading_rule_categories` + `trading_rules`, seed
  6 wbudowanych kategorii i 40 pytań-szablonów WYGENEROWANY PROGRAMOWO ze specyfikacji
  (`scratchpad/generate_trading_rules_seed.js` - nigdy ręczne przepisywanie). Zgodnie ze
  specyfikacją zero fabrycznych odpowiedzi - pytania to edytowalne szablony, odpowiedzi puste;
  `template_question` przechowuje oryginał do "Przywróć szablon".
- **Backend**: `domain::trading_rules` (walidacja, `normalize_question` do duplikatów),
  `SqliteTradingRulesRepository` (transakcyjny zapis zbiorczy całej zakładki; autorytatywna
  blokada dwóch pytań o identycznej znormalizowanej treści w jednej kategorii; `restore_templates`
  odtwarza treść/obecność pytań wbudowanych NIGDY nie dotykając odpowiedzi ani pytań własnych),
  `TradingRulesService`, komendy `get_trading_rules`/`save_trading_rules`/
  `restore_trading_rule_templates`.
- **Kosz rozszerzony o pytania** (`TrashEntityType::TradingRule`): archiwizacja pytania w trybie
  edycji wysyła je do uniwersalnego Kosza (przywracanie + trwałe usunięcie tylko stamtąd; zapis
  zbiorczy NIGDY nie kasuje pytań zarchiwizowanych). Pytania z szablonu mają w Koszu notatkę, że
  "Przywróć szablon" też je odtworzy.
- **Frontend**: nowa pozycja nawigacji "Zasady handlu" (grupa Konfiguracja) + `ZasadyHandluPage`:
  zwijane karty kategorii (pytanie+odpowiedź), tryb odczytu do naciśnięcia "Edytuj" (wzorzec z
  karty transakcji), "Zapisz zmiany"/"Anuluj", ostrzeżenie przed opuszczeniem zakładki z
  niezapisanymi zmianami (react-router `useBlocker`), dodawanie własnych kategorii/pytań, zmiana
  kolejności (kategorie i pytania), ukrywanie pytań (+przełącznik "Pokaż ukryte"), archiwizacja
  do Kosza, wykrywanie duplikatów po normalizacji (identyczne: blokada z ostrzeżeniem; bardzo
  podobne: propozycja scalenia zamiast automatycznej blokady - odpowiedzi nigdy nie łączone bez
  potwierdzenia), "Przywróć szablon" z potwierdzeniem.
- Backup/restore obejmuje zasady automatycznie (SQLite); integracja z eksportem CSV/XLSX zostaje
  na przekrojową Fazę 11, zgodnie z planem.

**Przetestowane:** 248 testów Rust (+13: domain 4, repozytorium 8, Kosz 1), fmt/clippy czyste
(poza śledzonym `large_enum_variant`), frontend typecheck/eslint/prettier/vitest czyste,
weryfikacja na żywo w przeglądarce: odczyt (kategorie/odpowiedzi/podpowiedź pustej odpowiedzi),
edycja (uzupełnienie odpowiedzi, nowa kategoria z pytaniem, blokada duplikatu "w jakich GODZINACH
handluję?", archiwizacja pytania), zapis zbiorczy i powrót do trybu odczytu z poprawnym stanem.

**Następny krok:** Faza 10 — wspólne komponenty i pełny audyt wizualny (Faza 7 odroczona).

### Faza 10 — Wspólne komponenty i audyt wizualny — ✅ ukończona (część komponentowa + audyt)

**Podejście:** najpierw audyt dowodowy (co jest NAPRAWDĘ zduplikowane), żeby nie budować
abstrakcji na siłę. Ustalenia: PageHeader zbędny (tytuły już scentralizowane w `shell/Header`),
DataTable zbędny (wszystkie tabele używają wspólnego `Table`), KpiCard/ChartCard/FilterBar już
istnieją z Fazy 9 (StatCard/ChartCard/ReportFilterBar).

**Zbudowane i wdrożone:**

- `SectionCard` (wspólna otoczka karty - tło/ramka/zaokrąglenie powtarzane dotąd w wielu CSS).
- `ReadOnlyField` (siatka etykieta→wartość - `TradeBalanceCard` i `TradePreviewCard` miały
  bajt-w-bajt identyczne CSS; obie przepisane na nowe komponenty).
- `ConfirmDialog` (`ConfirmProvider`+`useConfirm`, wzorzec jak Toast) - **wszystkie 16 wywołań
  natywnego `window.confirm` w aplikacji zastąpione** stylizowanym, spójnym dialogiem z
  czerwonym przyciskiem dla akcji nieodwracalnych.
- `EditModeActions` (para "Edytuj"/"Anuluj"+"Zapisz zmiany" ze slotem na dodatkowy przycisk) -
  wdrożone na karcie transakcji i Zasadach handlu.
- `RouteErrorScreen` (**znalezisko audytu**: awaria komponentu strony pokazywała surowy,
  deweloperski zrzut stosu React Routera w `<pre>` wywołujący przewijanie poziome - teraz trasy
  mają `errorElement` z tym samym ekranem odzyskiwania co górny ErrorBoundary).

**Przetestowane:** typecheck/eslint (0 błędów; 5. ostrzeżenie react-refresh to ten sam
zaakceptowany wzorzec provider+hook co ToastProvider)/prettier/vitest czyste; na żywo w
przeglądarce: ConfirmDialog otwiera się, Potwierdź wykonuje akcję (purge w Koszu) i odświeża
listę, Anuluj zamyka; wymuszona awaria strony renderuje ekran odzyskiwania bez poziomego
przewijania. Pełny ręczny przegląd rozdzielczości/skalowania/motywów pozostaje do Fazy 11
(testy końcowe) - patrz plan.

**Następny krok:** Faza 11 — aktualizacja obszarów zależnych + testy końcowe + podsumowanie.

## Nowa specyfikacja: szablony brokerów, kalkulator, formularz transakcji (etapy B1–B9)

Źródło: `Prompt_implementacja_szablonow_brokerow_kalkulatora_i_formularza_transakcji (2).md`.
Ta specyfikacja wchłania dawną Fazę 11. Windows-only (użytkownik wycofał macOS).

### B1 — Schemat szablonów brokerów — ✅ ukończona

Migracja `0010_broker_templates.sql`: tabela `broker_instrument_templates` (1 konto = maks. 1
aktywny szablon, wymuszone indeksami częściowymi, nie tylko w UI), `instruments` rozszerzone
w miejscu przez `ALTER TABLE` o `template_id`/`canonical_symbol`/`variant`/`origin`.
Unikalność symboli przestała być globalna — działa per szablon, więc dwa szablony różnych
brokerów mają własny XAUUSD o różnych parametrach. Cały dotychczasowy katalog 350 instrumentów
stał się szablonem „QuoMarkets RAW" bez utraty parametrów, rewizji ani kolejności. Domena
`domain::broker_template`, `SqliteBrokerTemplateRepository`, `BrokerTemplatesService`, komendy
szablonów i integracja z Koszem.

### B2 — Ekran „Szablony instrumentów" + edycja per szablon — ✅ ukończona

`SzablonyInstrumentowPage`: lista szablonów (nazwa, broker, typ, liczba instrumentów,
przypisane konto), tworzenie/zmiana nazwy/duplikowanie/przypisanie do konta/archiwizacja do
Kosza, a także „Edytuj instrumenty" przechodzące na ekran instrumentów w kontekście danego
szablonu.

### B3 — Import instrumentów z pliku CSV brokera (MT5) — ✅ ukończona

`domain::instrument_import`: parser 52-kolumnowego eksportu MT5 (dopasowanie kolumn po nazwie,
kolumny wymagane vs. sensowne domyślne, wariant rozpoznawany z sufiksu `-MINI`, wykrywanie
kolizji symboli). Kolizja przerywa CAŁY import — nigdy nie zapisuje częściowego szablonu.
Atomowe `create_from_import` (szablon + instrumenty + rewizje v1 + preferencje). Kreator w UI:
plik → podgląd (liczba, ostrzeżenia, tabela) → nazwa/broker/typ → import. 269 testów Rust.

### Poprawka lota z przecinkiem + `Wolumen` → `Lot` — ✅ ukończona

**Zgłoszony błąd:** lot `1,23` nie był przeliczany. Przyczyną nie było środowisko Rust (backend
odpowiadał poprawnie) tylko `app/decimal.ts`: wzorzec walidacji akceptował wyłącznie kropkę,
więc `1,23` z polskiej klawiatury nie przechodziło, a `buildTradeInput` wysyłało do backendu
`volume: null` — transakcja zapisywała się bez lota i nie było czego liczyć.

Wspólna `normalizeDecimalInput` sprowadza wejście do jednej postaci kanonicznej wymaganej przez
`rust_decimal` (przecinek i kropka równoważne, spacje separatora tysięcy ignorowane, skróty
`,5`/`5,` uzupełniane) i jest stosowana we **wszystkich** miejscach wysyłki liczb — także saldo
początkowe konta, operacje kasowe i parametry instrumentu. Samo dopuszczenie przecinka w
walidacji przeniosłoby błąd do parsowania `Decimal` po stronie Rusta.

Zmiana nazwy użytkowej `Wolumen` → `Lot` (sekcja 2.3 specyfikacji): formularz transakcji, tabela
historii, podgląd, parametry instrumentu, nagłówek eksportu CSV, dziennik zmian transakcji.
Nazwy techniczne (`volume`) zostają wewnętrzne.

Dodatkowo: `invokeCommand` zwracało komunikat „Brak środowiska Tauri" jako domyślny dla KAŻDEGO
błędu o nieznanym kształcie (Tauri odrzuca zwykłym stringiem m.in. przy niezarejestrowanej
komendzie), więc realne błędy backendu były opisywane jako brak backendu i kierowały diagnozę na
manowce. Obecność powłoki Tauri jest teraz sprawdzana jawnie.

**Przetestowane:** 11 nowych testów frontendu pilnujących `1,23`/`0,01` (24 łącznie), 269 testów
Rust, eslint bez błędów.

**Następny krok (decyzja użytkownika z 2026-07-22):** kolejność została zmieniona — najpierw
działający instalator, a pozostałe etapy (B4 kalkulator pozycji, B5 kolor strategii/szczegóły
konta, B6 przebudowa formularza, B7 częściowe zamknięcia, B8 interwały do Kosza, B9 aktualizacje)
mają trafiać do aplikacji jako aktualizacje.

## Pozostałe cele Etapu 1

Patrz [ROADMAP.md](ROADMAP.md) — jeszcze nierozpoczęte.

---

# PLAN PRACY — skonsolidowany ze wszystkich dokumentów (2026-07-23)

Zestawienie tego, co zostało do zrobienia, złożone z trzech promptów wdrożeniowych, ROADMAP.md
i stanu kodu. Kolejność jest wiążąca. Pozycja jest „gotowa" dopiero wtedy, gdy ma działające
zachowanie (nie atrapę), testy i przechodzące lint/typecheck.

## Blok A — seria B ze specyfikacji formularza transakcji

| Poz.  | Zakres                                               | Status                                                                                |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| B1–B3 | Szablony brokerów, ekran szablonów, import CSV       | ✅                                                                                    |
| B4    | Kalkulator wielkości pozycji                         | ✅                                                                                    |
| B5    | Kolory strategii, szczegóły konta, emocje w Analizie | ✅                                                                                    |
| B6    | Przebudowa formularza transakcji (cz. 1–3)           | ✅                                                                                    |
| B7    | Częściowe zamknięcia (wchłonięte do B6 cz. 3)        | ✅                                                                                    |
| B8    | Interwały do kosza + konflikt nazw przy przywracaniu | ✅                                                                                    |
| B9    | Autoaktualizacja produkcyjna (Cel 1.8)               | 🔒 NIEGOTOWY — kod kompletny, 4 blokady poza kodem, patrz `MACIERZ_AUDYTU_CEL_1_8.md` |

## Blok B — bezpieczny panel ustawień

| Poz. | Zakres                                                                                        | Status |
| ---- | --------------------------------------------------------------------------------------------- | ------ |
| U1   | Wersjonowany model preferencji + walidacja per sekcja                                         | ✅     |
| U2   | Repozytorium, serwis z zapisem atomowym, komendy                                              | ✅     |
| U3   | Szkielet: menu, jedna sekcja naraz, zapis/anuluj/reset, pytanie o niezapisane                 | ✅     |
| U4   | Wygląd realnie nakładany na aplikację + podgląd na żywo                                       | ✅     |
| U5   | Nawigacja i widok startowy wpięte w powłokę                                                   | ✅     |
| U6   | Potwierdzenia, potwierdzenie zapisu, częstotliwość autozapisu szkicu                          | ✅     |
| U7   | Podpowiedzi przy polach, zapamiętywanie rozwiniętych paneli                                   | ✅     |
| U8   | Domyślne: konto/interwał/sesja, ryzyko i tryb SL kalkulatora, zapamiętywanie filtrów raportów | ✅     |
| U9   | Przełączniki powiadomień + ciche godziny (przypomnienia czekają na centrum powiadomień)       | ✅     |
| U10  | Sekcja „Dane": stan danych (liczniki, rozmiar, integralność) + `Sprawdź integralność`         | ✅     |
| U11  | Diagnostyka użytkownika: kopiowanie i eksport raportu bez danych wrażliwych                   | ✅     |

## Blok C — przebudowa designu „Institutional Adaptive Workspace"

Zastępuje wcześniejszy, węższy blok „redesign motywu". Nowy prompt
(`Prompt_nowy_redesign_Q_i_pelny_audyt.md`, 884 linie) wymaga przebudowy nie tylko palety,
ale KONSTRUKCJI każdego ekranu: układ dobierany do rodzaju pracy, a nie jedna siatka kart
wszędzie. Zrobione dotąd tokeny i paleta zostają jako fundament.

| Poz. | Zakres                                                                                                                                     | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| M1   | Tokeny: pełna paleta ciemna i jasna, semantyczne nazwy, wysokości kontrolek                                                                | ✅     |
| M2   | Komponenty wspólne: Button (4 warianty), pola, Modal, Toast, Badge, Table                                                                  | ✅     |
| M3   | Nawigacja i górny pasek — obecny stan                                                                                                      | ✅     |
| M5   | Tabele: przyklejony nagłówek, dyskretne separatory, liczby do prawej                                                                       | ✅     |
| Q1   | Powłoka: nowe grupy menu (Start/Handel/Analiza/Zarządzanie/System), zapamiętywanie wyboru, tooltipy po zwinięciu, pełna obsługa klawiatury | ✅     |
| Q2   | Górny pasek: nazwa widoku i skrót „Nowa transakcja" (centrum powiadomień osobno)                                                           | ✅     |
| Q3   | Paleta poleceń `Ctrl+K` (bez operacji niszczących)                                                                                         | ✅     |
| Q4   | Dashboard jako Executive Dashboard: 6 KPI w górnym rzędzie, wskaźniki uzupełniające ciszej, kafelki klikalne do źródła                     | ✅     |
| Q5   | Historia transakcji: Table-First + Split View z Inspectorem po prawej (tylko odczyt, jawny „Edytuj", przypinanie)                          | ✅     |
| Q6   | Nowa transakcja jako Guided Workflow: stały nagłówek z kontem i saldem, przyklejony pasek akcji, swobodne przechodzenie między sekcjami    | ✅     |
| Q7   | Raporty jako workspace: zwijane filtry, opis zakresu danych, eksport bieżącego podraportu z tym samym zawężeniem                           | ✅     |
| Q8   | Wykresy: tokeny palety serii, tooltip o wysokim kontraście, kolor tylko tam gdzie coś znaczy, PDF zostaje jasny                            | ✅     |
| Q9   | Dostępność i animacje: klawiatura listy zakładek, jawny znak wyniku, czasy z tokenów                                                       | ✅     |
| Q10  | Stany puste, ładowania, błędu i tylko-do-odczytu w każdym widoku - z jednych komponentów                                                   | ✅     |

## Blok D — pełny audyt (wymagany przed instalatorem)

| Poz. | Zakres                                                                                                                                                                                           | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| A1   | Audyt wizualny obu motywów: kontrast WCAG AA (5 naruszeń naprawionych, test blokujący), brak przepełnień w 1366×768 i 1920×1080                                                                  | ✅     |
|      | ↳ Widoki zależne od danych czekają na A2 - w przeglądarce bez backendu Tauri renderują tylko stan błędu.                                                                                         |        |
| A2   | Audyt jak końcowy użytkownik: 4 warianty bazy (pusta, z danymi, po restarcie, 300 transakcji) przechodzą przez pełny stos usług - saldo zgadza się z sumą wyników w każdym z nich                | ✅     |
| A3   | Wartości graniczne: puste/spacje, duplikaty, długie nazwy, polskie znaki, 0, ujemne, bardzo duże, loty 0,01-1,23, złe daty, zamknięcie ponad lot, wielokrotny zapis - 14 testów na pełnym stosie | ✅     |
| A4   | Obliczenia finansowe: 16 niezależnych rachunków referencyjnych (lot, tick, punkt, ryzyko, R:R, P&L BUY/SELL, koszty, waluty, częściowe zamknięcia) + test blokujący f64 w modułach pieniężnych   | ✅     |
| A5   | Audyt kodu: 206 plików sprawdzonych 17 klasami defektów, lista w [AUDYT_KODU.md](AUDYT_KODU.md). Znalezione i naprawione: panika statystyk, ciche pomijanie pozycji, 4x float na pieniądzach     | ✅     |
| A6   | Narzędzia: prettier ✓, ESLint 0 błędów (8 ostrzeżeń react-refresh o HMR), typecheck ✓, 149 testów frontu, cargo fmt --check ✓, clippy 0 błędów, 390 testów Rust                                  | ✅     |
| A7   | Raport końcowy z macierzą audytową: [RAPORT_AUDYTU.md](RAPORT_AUDYTU.md) - 12 znalezisk, wszystkie zamknięte, każde z testem blokującym powrót                                                   | ✅     |

## Blok O — redesign „TradingView Pro × Apple Fintech" (zastępuje Institutional Black & Gold)

Użytkownik przysłał `Prompt_finalny_redesign_O_TradingView_Apple_Fintech_i_pelny_audyt.md`
(2026-07-24). Dokument zastępuje WYŁĄCZNIE wygląd/UX z poprzedniego promptu (M1-M5, Institutional
Black & Gold) — funkcje, logika biznesowa i zabezpieczenia zostają. Nowa paleta świadomie
zabrania złota i "instytucjonalnego terminala", czyli dokładnie tego, co budował poprzedni
redesign — to pełna wymiana warstwy wizualnej, nie korekta.

| Poz. | Zakres                                                                                                                                                                                                                                          | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| O1   | Design tokens: nowa paleta jasna/ciemna (wartości z promptu, 8 skorygowanych o minimum pod WCAG AA - test blokujący), usunięcie złota (Rust+TS+preset), reaktywny tryb „zgodny z systemem" (nasłuch zmiany na żywo - już istniał)               | ✅     |
| O2   | BUY/SELL z jawnym tekstem/ikoną obok koloru - zweryfikowane, już poprawne wszędzie (TRADE_SIDE_LABELS jako tekst, nie sam kolor odznaki)                                                                                                        | ✅     |
| O3   | Wykresy: paleta serii na niebieskim jako głównym - zweryfikowane, wszystko czyta tokeny przez `var()`, zero hardkodowanych hexów w GroupBarChart/EquityCurveChart/SimplePieChart/chartTheme.ts                                                  | ✅     |
| O4   | Audyt hardkodowanych kolorów: 0 poza uzasadnionymi wyjątkami (tęcza ColorPicker); znaleziony i naprawiony resztkowy domyślny kolor nowej strategii (złoto → niebieski)                                                                          | ✅     |
| O5   | Przegląd pod kątem pozostałości starego motywu: 5 komentarzy „złoto”→„akcent” (Button/Sidebar/Table/TransactionsPage/chartTheme), naprawiony realny bug układu (`.main` bez `min-width:0` ucinał szeroką treść bez scrolla)                     | ✅     |
| O6   | Kontrast WCAG AA - zrobione w ramach O1 (8 wartości skorygowanych, test `design/tokens.test.ts` 24/24 PASS na obu motywach)                                                                                                                     | ✅     |
| O7   | Audyt końcowy + macierz audytowa (sekcje 23-32 promptu) - werdykt GOTOWE/NIEGOTOWE - macierz: [MACIERZ_AUDYTU_REDESIGN_O.md](MACIERZ_AUDYTU_REDESIGN_O.md), werdykt na razie NIEGOTOWE (brak zrzutów ekranu, brak pełnego testu jak użytkownik) | 🚧     |

**O7, postęp cząstkowy:** znaleziona i naprawiona realna luka względem sekcji 9 ("jedno źródło
prawdy dla... warstw i z-index; szerokości Inspectora") - `z-index` był rozrzucony jako 8
niezależnie wymyślonych liczb (1/1/1/20/20/100/100/200) w 8 plikach, a szerokość Inspectora
(`minmax(20rem, 26rem)`) była wpisana wprost w siatkę Split View. Dodana skala `--z-sticky/
--z-popover/--z-overlay/--z-skip-link` i tokeny `--inspector-width-min/-max`, wszystkie 8
miejsc przepięte z weryfikacją że dopasowanie trafiło dokładnie raz. Natywny `<dialog>` (Modal)
świadomie POZA tą skalą - przeglądarka renderuje go we własnej warstwie "top layer" zawsze nad
z-index, więc wpisanie go do skali byłoby mylące.

Ta sama klasa luki znaleziona w `font-weight`: `font-size` ma pełną skalę tokenów, ale wagi
czcionki (400/500/600/700) były wpisane jako gołe liczby w 69 miejscach w 42 plikach - zero
wspólnego źródła. Dodane `--font-weight-regular/-medium/-semibold/-bold`, wszystkie 69 miejsc
przepięte mechanicznie (regex + weryfikacja że po zamianie zostało zero surowych liczb).
Cztery wagi, nie więcej - zgodnie z sekcją 10 promptu.

Ta sama luka trzeci raz: `line-height` miał dwa tokeny (`--tight`, `--normal`), ale 6 miejsc
wpisywało surowe `1` (odznaki/ikony jednowierszowe) i `1.5` (duplikat `--normal`) wprost. Dodany
`--line-height-none: 1`, wszystkie 5 realnych duplikatów przepięte (jeden `1.1` w kalkulatorze
zostawiony bez zmian - to świadomy, jednorazowy dobór dla dużej liczby wynikowej, nie duplikat
żadnego tokenu).

**Znaleziony brakujący stan komponentu (sekcja 9: "każdy komponent ma posiadać komplet
stanów... loading").** `Button` w ogóle nie miał stanu `loading` - 8 stron ręcznie
duplikowało ten sam wzorzec (`{submitting ? "Zapisywanie..." : "Zapisz"}` + osobne
`disabled={submitting}`), a jeden współdzielony komponent (`EditModeActions`) robił to samo
z dodatkowym, teraz zbędnym propem `savingLabel`. Dodany właściwy prop `loading` na `Button`:
ustawia `aria-busy`, wymusza `disabled`, pokazuje spinner NAD tekstem (`visibility: hidden`,
nie `display: none` - przycisk nie zmienia szerokości w trakcie ładowania). Wszystkie 9 miejsc
(8 stron + `EditModeActions`) przepięte, `savingLabel` usunięty jako martwy kod (0 wywołań
z override). Przy okazji naprawiony fałszywie pozytywny lint (`disabled={disabled || loading}`
sugerował `??`, co realnie zmieniłoby zachowanie przy `disabled={false}` - naprawione uczciwie
przez `Boolean(disabled)`, nie tłumione komentarzem).

**Kolejny brakujący stan (sekcja 9: "...hover; active; focus...").** Zero komponentów
współdzielonych miało pseudo-klasę `:active` (chwila naciśnięcia) - `grep -rn ":active"` po
`ui/components` nie zwracał nic. Dodane delikatne skalowanie w dół (`transform: scale(0.97)`
na `Button`, `scale(0.94)` na `IconButton`, ta sama różnica co między głównym przyciskiem
a ikoną - mniejszy element potrzebuje wyraźniejszej zmiany, żeby feedback był w ogóle
zauważalny) zamiast zmiany koloru - subtelna, fizyczna informacja zwrotna, nie krzykliwy
efekt. `:not(:disabled)` samo wyklucza też stan `loading` na `Button` (loading zawsze
ustawia `disabled` na natywnym elemencie). Świadomie POZA testami jednostkowymi - `:active`
jako pseudo-klasa CSS nie da się sensownie zasymulować w jsdom (brak realnego silnika
renderującego stany `mousedown` bez `mouseup`); weryfikacja przez przegląd kodu i istniejące
globalne zerowanie `transition-duration` pod redukcją ruchu w `tokens.css`.

Ten sam brak dotyczył `Switch` (przełącznik jest w pełni własnym komponentem, nie natywną
kontrolką z samym tylko `accent-color` jak `Checkbox` - dla niego custom `transform` byłby
niespójny z tym, jak faktycznie renderuje go silnik przeglądarki, więc świadomie zostawiony
bez zmian). Skalowany jest TOR (`.track`), nie kciuk - kciuk już ma własny `transform`
(`translateX` przy przełączeniu), a doklejenie tam skalowania wymagałoby łączenia obu funkcji
warunkowo dla stanu zaznaczonego/niezaznaczonego bez możliwości podglądu wizualnego. Selektor
`:has()`, nie kombinator rodzeństwa `~` - w trakcie pisania omyłkowo użyty `~` (zakładający,
że `.track` jest rodzeństwem `.input`), złapane przy ponownym czytaniu `Switch.tsx`: `.track`
to w rzeczywistości RODZIC `.input` (input jest w środku spana `.track`), więc `~` nigdy by
nie trafił - naprawione na `:has()`, ten sam wzorzec, którego już używa istniejąca reguła
`.track:has(.input:checked)`.

Ta sama konwencja `:active` domknięta na dwóch dalszych, realnie klikanych elementach chrome
aplikacji (nie tylko formalnie „współdzielonych komponentach" z sekcji 9, ale wszędzie, gdzie
użytkownik faktycznie klika): zakładki `ReportsPage` (`.tab`) i pozycje menu bocznego
(`Sidebar.navLink`). Świadomie POMINIĘTE: pozycje `CommandPalette` - mają własny, udokumentowany
komentarzem wybór projektowy („wyróżnienie idzie za KLAWIATURĄ, nie za kursorem"), więc dopisanie
`:active` (reakcji na mysz) byłoby sprzeczne z tym zamysłem, nie naprawą braku.

Nowa wersja dokumentu dodaje macOS (Apple Silicon `arm64` + Intel `x86_64`) jako drugą
platformę docelową, obok Windows. **Użytkownik potwierdził: nie ma dostępu do żadnego Maca.**
Dokument sam przewiduje ten dokładny przypadek: _"Brak dostępu do rzeczywistego Maca lub
właściwego runnera macOS oznacza, że wydanie macOS pozostaje niezweryfikowane i nie wolno
przedstawiać go jako gotowego."_ Ustalony podział pracy:

- **Zrobię:** dopasowania kodu, które są tanie i weryfikowalne testem bez Maca - np. skrót
  `Cmd+K` obok `Ctrl+K` w palecie poleceń, wykrywanie platformy do wyświetlania właściwych
  etykiet skrótów, unikanie założeń specyficznych dla Windows w kodzie ścieżek/plików (Tauri
  już abstrahuje to w większości). Mogę też dodać budowanie `.dmg` na prawdziwym runnerze
  macOS w GitHub Actions (`macos-latest` - to realny sprzęt/VM Apple, nie cross-compiling
  z Windows) - to da REALNY artefakt, tylko nikt na nim nie klika jak użytkownik.
- **NIE zrobię (fizycznie niemożliwe stąd):** interaktywnego testu jako użytkownik końcowy
  (Gatekeeper, przeciągnięcie do Applications, uruchomienie, potwierdzenie zachowania danych)
  - to wymaga rąk na prawdziwym Macu. Ta część zostaje oznaczona `NIEZWERYFIKOWANY`, zgodnie
    z jawnym przyzwoleniem dokumentu, a nie ukrywana ani obchodzona.
- Werdykt Celu 1.9 (gdy do niego dojdzie) będzie więc co najwyżej
  `GOTOWY FUNKCJONALNIE, macOS NIEZWERYFIKOWANY` - nigdy pełne `GOTOWE` dla macOS, dopóki ktoś
  z dostępem do Maca nie przeprowadzi realnego testu.

**O7, seria kontroli bez potrzeby poprawek (sekcja 21: stany formularzy i dostępność).**
Sprawdzone i potwierdzone jako już poprawne - zapisane jako dowód audytowy, nie jako naprawa:

- Nieprzezroczystość stanu disabled: `TextField`/`Select`/`Textarea` mają spójne `0.6`
  (ten sam poziom co `Button`, uzasadniony czytelnością tekstu), odrębny od klastra `0.5`
  (`Checkbox`/`IconButton`/`Switch` - kontrolki ikonowe/przełącznikowe). Dwa spójne wewnętrznie
  klastry, nie przypadkowy rozjazd.
- `:focus-visible` na `TextField`, `Select`, `Textarea`: identyczna reguła
  (`outline: 2px solid var(--color-focus-ring); outline-offset: 1px; border-color:
var(--color-accent);`) bajt w bajt w każdym z trzech.
- `aria-invalid`/`aria-describedby`/`aria-required`/`role="alert"` na komunikacie błędu:
  potwierdzone w `TextField.tsx`, i przez grep - to samo w `Select.tsx`/`Textarea.tsx`.
- `Modal.tsx` (natywny `<dialog>`): Escape poprawny przez zamysł, nie przypadek -
  `onCancel={(event) => { event.preventDefault(); onClose(); }}` świadomie blokuje niekontrolowane
  zamknięcie przeglądarki, żeby stan React zostawał władny, zsynchronizowany przez `useEffect`
  na `open` (`dialog.close()`/`showModal()`).
- 13 plików z `grid-template-columns` bez `@media`: wszystkie oparte na `1fr`/`repeat(N, 1fr)`/
  `auto-fit`/`auto-fill` (proporcjonalne), nie na stałych pikselach - same z siebie nie mogą
  wymusić przepełnienia kontenera; ochrona przed przepełnieniem przez zawartość (pułapka
  `min-width: auto` CSS Grid) już istnieje na `TextField`/`Select`/`Textarea` z wcześniejszej
  pracy nad projektem.
- Pola dat (`CashOperationsModal`, `CloseTradeModal`, `settings/PreferenceSections`,
  `TradeFormModal`): natywny `type="datetime-local"` przez współdzielony `TextField` - dedykowany
  `DateTimePicker` z sekcji 9 promptu nie jest potrzebny, chrome już spójne.
- Wybór emocji transakcji: świadomy wcześniejszy wybór „dodawaj pojedynczo", nie brakujący
  `MultiSelect` - budowa generycznego komponentu zastąpiłaby przemyślany wzorzec, nie naprawiłaby
  luki.

Pełne wpisy z dowodami: [MACIERZ_AUDYTU_REDESIGN_O.md](MACIERZ_AUDYTU_REDESIGN_O.md), sekcja 1.1.

**O7, zamknięta trzecia blokada (pełny manifest plik-po-pliku, sekcja 27).** Poprzedni manifest
grupował 70 plików w 13 kategorii ze wspólnym statusem na grupę - dosłowne brzmienie promptu
chce osobnego statusu DLA KAŻDEGO pliku. Zbudowana tabela 70 wierszy programowo (skryptem
Python z tej samej, już zweryfikowanej tabeli grup - nie ręcznie przepisana, więc bez ryzyka
literówki/pominięcia przy takiej liczbie wierszy); plik zmieniony z więcej niż jednego powodu
(np. `Button.module.css`: komponent `loading` + komentarz „złoto" + `font-weight` + `:active`)
wymienia wszystkie powody, nie tylko pierwszy pasujący. Zweryfikowane: 70/70 dopasowanych,
0 pominiętych, 0 nadmiarowych.

Przy tej samej okazji złapany i naprawiony realny błąd w PROZIE manifestu (nie w samej
tabeli grup, ta była kompletna): poprzednia wersja podawała zakres `0c2eb41..f46c62d` jako
dowód na „68 plików" - błąd o jeden commit na granicy (dwukropkowy `git diff` liczy zmiany
MIĘDZY commitami, więc start `0c2eb41` - czyli sam commit O1 - wykluczał zmiany wprowadzone
PRZEZ ten commit). Poprawny zakres to `0c2eb41^..cde2220` (od rodzica O1 do najnowszego) -
70 plików, zgodne z tabelą.

Próba odblokowania pierwszej blokady (zrzuty ekranu) - uruchomiony serwer deweloperski
(port 1430 wolny, żaden proces użytkownika go nie trzymał), strona renderuje się poprawnie
(`read_page`/`get_page_text` działają), ale `computer{action:"screenshot"}` nadal zwraca
„Browser pane is not displayed, so the page is not compositing frames" - trzecie potwierdzenie
tej samej, stabilnej usterki środowiska, nie przypadkowej. Przy okazji cząstkowa weryfikacja
drugiej blokady (pełny test jak użytkownik): klik-nawigacja Dashboard→Raporty, zero błędów
w konsoli, brak backendu Tauri w tym podglądzie renderuje się jako czytelny komunikat
z przyciskiem ponowienia (nie awaria) - potwierdza już wcześniej opisany w pamięci przypadek
„Brak środowiska Tauri", nie nowe odkrycie.

**O7, rozszerzona weryfikacja nawigacji (sekcja 24, wciąż częściowa).** Klik-nawigacja przez
WSZYSTKIE 14 tras menu bocznego (nie tylko Dashboard/Raporty jak poprzednio) -
`/transakcje`, `/kalkulator-pozycji`, `/kalendarz`, `/stan-emocjonalny`, `/konta`,
`/strategie`, `/instrumenty`, `/interwaly`, `/zasady-handlu`, `/dane`, `/kosz`, `/ustawienia`.
Każda strona renderuje własny chrome (nagłówki, opisy, paski filtrów, formularze dodawania)
niezależnie od tego, że dane nie mogą się wczytać bez backendu Tauri w tym podglądzie -
błąd wszędzie jako `role="alert"` z czytelnym komunikatem PL i przyciskiem ponowienia, zero
wyjątków w konsoli na całej trasie. Nadal NIE zamyka blokady sekcji 24 w całości (brakuje
przejścia z prawdziwymi danymi i weryfikacji pikselowej) - ale znacząco zawęża to, co
zostało do sprawdzenia. Pełne wpisy: [MACIERZ_AUDYTU_REDESIGN_O.md](MACIERZ_AUDYTU_REDESIGN_O.md),
sekcja 4.

**O7, znaleziona i naprawiona realna luka w testach: brak pinu na literalną wartość
domyślnego akcentu.** Cały sens redesignu O1 to zmiana domyślnej marki ze złota (`#c9a85a`)
na niebieski (`#4c7dff`) - ale istniejący test (`brakujace_pojedyncze_pole_przyjmuje_wartosc_domyslna`)
porównuje `prefs.appearance.accent_color` z wynikiem wywołania `default_accent()`, czyli
tej samej funkcji - tautologia, która przeszłaby nawet po cichym powrocie do złota. Dodany
`domyslny_akcent_to_niebieski_nie_zloto`: porównanie z literałem `"#4c7dff"` wprost.
Frontend (`PreferencesProvider.tsx`, stała `DEFAULT_ACCENT`, nieeksportowana, używana tylko
kosmetycznie do podświetlenia presetu) świadomie NIE dostał analogicznego testu - dodanie
całego pliku testowego dla złożonego providera tylko dla jednej stałej byłoby nieproporcjonalne
do realnego ryzyka (rozjazd tam skutkowałby najwyżej złym podświetleniem presetu, nie utratą
danych); zsynchronizowanie pilnowane komentarzem w kodzie, jak dotychczas.

**O7, znaleziona i naprawiona realna luka WCAG AA: `color-mix()` na tle tekstu tego samego
koloru.** `design/tokens.test.ts` sprawdzał wyłącznie surowe tokeny - zamiast zostawić 15 miejsc
używających `color-mix()` jako niepotwierdzone ryzyko (jak w poprzednim wpisie), dopisana
matematyczna symulacja `color-mix(in srgb, ...)` (funkcja `mieszaj()`, interpolacja liniowa
kanałów w sRGB) i uruchomiona na każdym miejscu, gdzie tekst renderuje się na takim tle.
Wynik: **14 realnych naruszeń**, nie zero:

- `Badge` (wszystkie 5 wariantów) - tekst semantyczny na 18%-owym tle tego samego koloru: 3,9-4,07
  zamiast ≥4,5 w obu motywach.
- `HeatmapTable` - tekst wyniku w kolorze wyniku na tle o sile aż do 70% - przy silnym nasyceniu
  kontrast spadał do 1,7:1 (tekst praktycznie znikał).
- `SettingsPage .menuItemActive` - dziedziczony `--color-text-muted` (nie `--color-text`) na tle
  akcentu: 4,13-4,36.
- `SettingRow .restartTag` (4,18) i `CalendarPage .dayPnl` (4,43) w motywie jasnym.

Naprawione, nie tylko udokumentowane: `Badge`/`CalendarPage`/`SettingRow` dostały nowe tokeny
intensywności PER MOTYW (`--tint-badge`/`--tint-calendar-day`/`--tint-tag` w `tokens.css`) -
motyw jasny potrzebuje dużo niższego procentu, bo jego kolory semantyczne są już same w sobie
ciemniejsze (dobrane pod kontrast jako zwykły tekst), więc nawet niewielkie mieszanie z bliską
bieli powierzchnią szybko zbliża tło do koloru tekstu. `menuItemActive` dostał `color:
var(--color-text)` zamiast dziedziczonego wyciszonego koloru - aktywna pozycja i tak nie powinna
wyglądać na przygaszoną. `HeatmapTable` dostał `color: var(--color-text)` zamiast koloru wyniku
(intensywność tła nadal niesie magnitudę, tylko tekst już jej nie kopiuje) i obniżony pułap
`pnlOpacity()` z 0,70 do 0,55 (margines pod dokładną granicą 0,593 w motywie ciemnym, gdzie
nawet stały `--color-text` traci kontrast przy bardzo silnym tle).

Wszystkie 14 przypadków przeliczone w teście z realnych tokenów, nie hardkodowane oczekiwane
wartości - `pnpm test` 52/52 PASS po poprawce (261/261 w całym froncie). Pełne wpisy z dowodami:
[MACIERZ_AUDYTU_REDESIGN_O.md](MACIERZ_AUDYTU_REDESIGN_O.md), sekcja 1 (ostatni wiersz) i blokada
#1 w podsumowaniu.

**O7, dopisany pominięty plik do tej samej naprawy (`FormPanel`).** Ponowny
`grep -rl "color-mix"` po powyższej naprawie ujawnił plik pominięty w pierwszym przeglądzie:
`FormPanel.module.css` ma 3 statusy (`.statusComplete`/`.statusPartial`/`.statusError`) z tym
samym wzorcem co `Badge` (tekst semantyczny na tle tego samego koloru). Sprawdzone i naprawione
od razu: 4,04-4,19 zamiast ≥4,5 w motywie jasnym (dark już przechodził). Naprawa dzieli token
`--tint-badge` z `Badge` zamiast tworzyć nowy - to ten sam wzorzec wizualny (kolorowa "pigułka"
statusu), nie osobny przypadek. `pnpm test` 58/58 PASS w `tokens.test.ts` po dodaniu.

**O7, dopisany test dla kryterium WCAG 1.4.11 (pierścień fokusu), nigdy dotąd niesprawdzonego
wprost.** `--color-focus-ring` musi mieć ≥3:1 (nie 4,5:1 jak tekst) wobec KAŻDEJ powierzchni,
na której realnie się renderuje. Policzone na 5 powierzchniach w obu motywach - wszystkie PASS
bez zmian kodu, najciaśniej w motywie jasnym (3,32-3,69, wciąż z marginesem), w ciemnym
5,99-7,59. Zapisane jako trwały test regresyjny (nie jednorazowe sprawdzenie), żeby przyszła
zmiana koloru fokusu albo powierzchni nie przeszła cicho poniżej progu. `pnpm test` 60/60 PASS.

**O7, kolejna znaleziona luka „jedno źródło prawdy" (ta sama klasa co z-index/font-weight/
line-height): `border-radius: 999px` na sztywno w 3 plikach** (`SettingRow.module.css`,
`ColorPicker.module.css`, `FormPanel.module.css`), mimo że token `--radius-full: 999px` już
istniał w `tokens.css` - po prostu nie wszędzie użyty. Przepięte na `var(--radius-full)`
we wszystkich 3 - wizualnie identyczne (ta sama wartość), tylko jedno źródło zamiast trzech
niezależnie wpisanych liczb. `border-radius: 50%` na okrągłych próbkach koloru świadomie
pominięty - inny idiom („koło niezależnie od rozmiaru pudełka", nie skala promienia).

**O7, ta sama klasa luki po raz czwarty: `box-shadow` na sztywno w `ColorPicker.module.css`.**
`.popover` (rozwijany panel wyboru koloru) miał surowy, nieudokumentowany
`0 12px 32px rgb(0 0 0 / 45%)`, podczas gdy WSZYSTKIE inne pływające panele w aplikacji
(`Tooltip`, `CommandPalette`, `Modal`) już od dawna używają `var(--shadow-sm/-md)`. Przepięte
na `var(--shadow-md)` - ta sama ranga elewacji co `Modal`/`CommandPalette`. `.areaHandle`
(1px czarny pierścień na uchwycie w obszarze wyboru koloru) świadomie NIE dostał tokenu -
musi pozostać czytelny na DOWOLNYM kolorze tła pod spodem (gradient nasycenia/jasności), nie
na powierzchni motywu aplikacji, więc stały, niezależny od motywu kolor jest tu poprawnym
wyborem, nie przeoczeniem. Weryfikacja wizualna niemożliwa (ColorPicker wymaga załadowanych
preferencji/strategii, których backend Tauri nie dostarcza w tym podglądzie) - poprawność
oparta na mechanicznej identyczności z już działającym wzorcem `Modal`/`CommandPalette`.

**O7, odświeżony manifest plik-po-pliku (część 25) - był znowu nieaktualny.** 12 commitów
(część 11-24) dorzuciło 3 pliki, których poprzedni manifest (zatrzymany na 70, commit `cde2220`)
jeszcze nie znał: `design/tokens.test.ts` (nowy plik testowy), `pages/HeatmapTable.tsx`
(pierwsza zmiana logiki dopiero w części 19) i `CHANGELOG.md`. Reszta plików tych commitów
(`preferences.rs`, `Badge`/`CalendarPage`/`SettingsPage`/`SettingRow`/`FormPanel`/`ColorPicker`/
`HeatmapTable.module.css`) dostała WIĘCEJ zmian, ale była już policzona wcześniej z innych
powodów, więc nie zwiększa liczby plików. Zaktualizowany zakres do `0c2eb41^..6091ac4` -
**73 pliki**, zweryfikowane tym samym skryptem porównującym co poprzednio: 73/73 dopasowanych,
0 pominiętych, 0 nadmiarowych.

**O7, zamknięcie całego przeglądu „jedno źródło prawdy" (sekcja 9): sprawdzona ostatnia
kategoria, `font-size`.** 2 surowe wartości poza `var(--font-size-*)` (skala kończy się na
`--font-size-xl: 1,75rem`) - `KalkulatorPozycjiPage.module.css .lotValue` (2,25rem, duża
liczba wynikowa, sparowana z już wcześniej udokumentowanym wyjątkiem `line-height: 1.1` - ten
sam, jednorazowy dobór) i `EmptyState.module.css .icon` (2rem, rozmiar GLIFU ikony, element
graficzny, nie typografia). Oba uzasadnione, zero nowych luk. Cały przegląd tokenów (kolory,
z-index, font-weight, line-height, border-radius, box-shadow, font-size) uznany za zamknięty -
każda kategoria albo skonsolidowana do jednego źródła, albo ma udokumentowany, świadomy wyjątek.

## Blok E — instalator (Cel 1.9)

**Decyzja użytkownika (2026-07-24): wydajemy BEZ podpisu Authenticode, świadomie.** Certyfikat
kosztuje, na razie nie stać - to nie jest zapomniana blokada, tylko przemyślany wybór (patrz
`docs/KLUCZE_I_WYDANIE.md`). Instalator bez podpisu działa w 100%, jedyny skutek to ostrzeżenie
SmartScreen przy pierwszym uruchomieniu. Dodanie podpisu później to wyłącznie dopisanie kroku
w `release.yml` - nic w kodzie nie trzeba przez to zmieniać.

**Nadal NIE zaczynam budowy instalatora bez osobnego, wyraźnego "tak"** - decyzja o samym
certyfikacie i decyzja o starcie prac nad instalatorem to dwie różne rzeczy. Czekam na
wyraźne potwierdzenie, że mam zacząć Cel 1.9.

### Specyfikacja wyglądu instalatora (zapisana na później, z drugiej wersji promptu O)

Otrzymany dokument dodaje pełną specyfikację wizualną instalatora NSIS/MUI2 w stylu
„TradingView Pro × Apple Fintech" - zapisana tutaj, żeby nie zginęła do czasu startu Celu 1.9:

- **Ekrany:** powitalny (nazwa, logo, wersja, wydawca, opis, „Rozpocznij instalację"/„Anuluj") →
  opcje instalacji (ścieżka, skróty pulpit/Start, wymagane miejsce, bez zbędnych ustawień
  technicznych) → proces (prawdziwy pasek postępu, etapy: Przygotowanie/Kopiowanie
  plików/Tworzenie skrótów/Rejestrowanie aplikacji/Finalizacja) → zakończenie (potwierdzenie,
  wersja, „Uruchom Dziennik Tradera") → błąd (opis po polsku, szczegóły techniczne rozwijane,
  bez częściowej instalacji).
- **Tryb aktualizacji** (gdy wykryta starsza wersja): nazwij „Aktualizacja" nie reinstalacją,
  pokaż wersję obecną i docelową, zachowaj bazę/ustawienia/załączniki/backupy/skróty bez
  ponownego pytania o wszystko.
- **Wymagania techniczne:** zasoby lokalne (bez pobierania z sieci), jeden stabilny
  identyfikator aplikacji, jedna nazwa produktu/wydawcy, **prawdziwy podpis Authenticode
  instalatora ORAZ pliku `.exe` aplikacji - wprost zabronione użycie certyfikatu testowego
  albo self-signed do dystrybucji publicznej**. To wiąże ten wygląd z blokerem certyfikatu
  wyżej: nawet dopracowany wizualnie instalator nie spełni tej sekcji promptu bez prawdziwego
  certyfikatu.
- **Kontrola jakości:** Windows 10/11 x64, skalowanie 100/125/150%, czysty system i system
  z poprzednią wersją, anulowanie w trakcie, brak miejsca/uprawnień, zablokowane pliki,
  zachowanie danych przy aktualizacji i odinstalowaniu.
- Prompt wprost wymaga pokazania zrzutów/podglądu ekranów instalatora **do zatwierdzenia
  PRZEZ UŻYTKOWNIKA przed** zbudowaniem finalnej wersji - nie budować w ciemno.

## Zasady pracy przy tym planie

- Commit małymi krokami, po polsku, push po każdym commicie.
- Nie oznaczać pozycji jako gotowej bez testów i przechodzącego lint/typecheck.
- Nie budować instalatora bez wyraźnej zgody użytkownika.
