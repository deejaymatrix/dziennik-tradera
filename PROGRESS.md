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

**Aktualizacja 2026-07-24: oba sekrety GitHub Actions już ustawione.** Placeholder w
`tauri.conf.json` był już podmieniony wcześniej (patrz „Resprawdzenie po audycie" niżej).
Sprawdzone na żywo przez `gh secret list`: `TAURI_SIGNING_PRIVATE_KEY` był już dodany przez
użytkownika, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (pusta wartość - klucz nie ma hasła, ale
sekret i tak musi istnieć) dodany teraz na wyraźną prośbę użytkownika. **Jedyne, co zostaje
przed pierwszym prawdziwym sprawdzeniem end-to-end: wypchnięcie tagu wydania (`git tag
v1.0.0 && git push origin v1.0.0`) - to już wprost dotyczy Celu 1.9/instalatora i czeka na
osobną, wyraźną zgodę użytkownika, zgodnie z „BEZWZGLĘDNĄ BRAMKĄ JAKOŚCI"
(`Prompt_finalny_redesign_O...md`, sekcja po 31).** Do tego czasu przycisk "Sprawdź
aktualizacje" nadal zwraca błąd braku wydania - to oczekiwane.

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

**O7, znaleziona brakująca para w przeglądzie color-mix (część 19-20): `CommandPalette
.itemActive` nigdy nie dostał testu.** Ponowna kontrola `grep` po własnym wcześniejszym
przeglądzie (ten sam nawyk co przy manifeście) ujawniła, że `.itemActive` (14% akcentu,
`--color-text` dziedziczony z `.item` - dokładnie ten sam wzorzec co już przetestowany
`TransactionsPage .selectedRow`) nigdy nie trafił do testów. Policzone: PASS w obu motywach
z dużym marginesem (13,46, daleko nad progiem 4,5) - bez zmian kodu, tylko dopisany trwały
test regresyjny, żeby przyszła zmiana nie przeszła niezauważona. `pnpm test` 62/62 PASS.

**O7, zamknięcie audytu color-mix wyczerpującym przeglądem, nie kolejną częściową łatką.**
Zamiast kolejnego `grep -rl "color-mix"` (który dwa razy z rzędu ujawniał tylko JEDEN pominięty
przypadek na raz - `FormPanel` w części 20, `CommandPalette.itemActive` w części 31), przejrzane
linia po linii WSZYSTKICH 28 wystąpień `color-mix()` w repozytorium. Wynik: każde miejsce, gdzie
tekst renderuje się na takim tle, ma już test. `Switch` (kolor toru przy zaznaczeniu) i `Table`
(obramowanie wiersza) świadomie poza zakresem - to inne kryteria WCAG (odróżnialność stanu,
kontrast obramowań), nie czytelność tekstu. 0 kolejnych luk - ten wątek audytu uznany za
faktycznie zamknięty, nie tylko "na razie bez nowych znalezisk".

**O7, test mutacyjny: czy testy color-mix NAPRAWDĘ łapią regresję, czy tylko przechodzą
przez przypadek.** Tymczasowo cofnięty `--tint-badge` (motyw jasny) ze świadomie poprawnej
wartości 7% z powrotem na starą, zepsutą 18% - uruchomione testy, sprawdzone, cofnięte
z powrotem. Wynik: dokładnie 8 testów padło (5 wariantów `Badge` + 3 `FormPanel`, jedyne
komponenty dzielące ten token, WYŁĄCZNIE w motywie jasnym) - ani jednego więcej, ani mniej,
dokładnie zgodnie z przewidywaniem. `--tint-calendar-day`/`--tint-tag` (osobne tokeny)
nietknięte. Po cofnięciu: `git diff` na `tokens.css` czysty, 62/62 PASS ponownie. To
potwierdza, że testy color-mix realnie chronią przed regresją, a nie tylko przechodzą,
bo akurat nikt niczego nie zepsuł.

**O7, ten sam test mutacyjny zastosowany do testu pierścienia fokusu (część 21).** Tymczasowo
zmieniony `--color-focus-ring` (motyw ciemny) na kolor bliski `--color-surface` (gwarantowana
porażka poniżej 3:1), uruchomione testy, cofnięte. Wynik: dokładnie 1 test padł ("pierścień
fokusu... motyw ciemny"), pozostałych 61 bez zmian, w tym test motywu jasnego (token
nietknięty). Po cofnięciu: `git diff` czysty, 62/62 PASS ponownie. Ten sam wniosek co przy
`--tint-badge` - test realnie chroni, nie tylko przechodzi przypadkiem.

**O7, ten sam test mutacyjny dopełniony o stronę Rust (część 15).** Tymczasowo cofnięty
`default_accent()` na starą wartość `"#c9a85a"` (złoto), uruchomiony `cargo test`, cofnięty.
Wynik: dokładnie jeden test padł, z czytelnym komunikatem asercji (`left: "#c9a85a", right:
"#4c7dff"`) - dokładnie tak, jak przewidziano. Po cofnięciu: `git diff` czysty, `cargo test`
428/428 PASS, `cargo fmt --check` PASS. Trzy testy dodane w tej sesji (color-mix, pierścień
fokusu, akcent w Rust) mają teraz eksperymentalne dowody, że realnie łapią regresję - nie
tylko przechodzą, bo akurat nic nie jest zepsute.

**O7, sprawdzone bezpieczeństwo zależności JS/TS: `pnpm audit` - „No known vulnerabilities
found".** Redesign nie dodał żadnej nowej zależności (0 zmian w `package.json`), więc to
potwierdzenie stanu sprzed O1-O7, nie nowa ochrona wprowadzona przez redesign. `cargo audit`
niedostępny w tym środowisku (nie jest wbudowaną podkomendą `cargo`, wymagałby instalacji
nowego narzędzia bez wyraźnej prośby użytkownika - świadomie NIE zainstalowany).

**O7, trzy szybkie kontrole dostępności/spójności - wszystkie bez zmian kodu.** (1) `Badge`
nie potrzebuje `aria-label` mimo kolorowego tła - to zwykły `<span>` z czytelnym tekstem
dziecka („Aktywne", „Zarchiwizowane"), kolor jest dekoracją NAD tekstem, nie jedynym
nośnikiem. (2) `Toast` - `role="region" aria-live="polite"` na kontenerze i `role="status"`
na pojedynczym toaście bez zmian po redesignie (dostał tylko token line-height/font-weight
w CSS, logika ARIA w `.tsx` nietknięta). (3) `README.md`/`RAPORT_AUDYTU.md`/`AUDYT_KODU.md`/
`ROADMAP.md` - 0 wystąpień starej nazwy motywu „Institutional Black/Adaptive", nic tam nie
wymagało aktualizacji. Uruchomiony też pełny, połączony przebieg wszystkich narzędzi
(format/lint/typecheck/test JS + fmt/clippy/test Rust) jako jeden spójny przebieg zamiast
osobnych sprawdzeń per commit - identyczne wyniki jak dotychczas udokumentowane (428/428,
271/271, ten sam jeden znany błąd lintu sprzed redesignu), zero nowego dryfu po 37 częściach.

**O7, znaleziony i przeczytany oryginalny dokument promptu - sekcje 25/29/30/31/32 potwierdzone
literalnym tekstem, nie cytowane z pamięci.** Plik `Prompt_finalny_redesign_O_TradingView_Apple_
Fintech_i_pelny_audyt (2).md` zapisany lokalnie przez użytkownika w `Downloads` - odnaleziony
i przeczytany w całości. Kluczowe ustalenia:

- Sekcja 25 (testy wartości granicznych) dotyczy wyłącznie logiki biznesowej - redesign jej nie
  dotknął, pokrycie z bloku D pozostaje aktualne. Potwierdzone tekstem, nie założone.
- „BEZWZGLĘDNA BRAMKA JAKOŚCI" (po sekcji 31) to JAWNIE bramka dla Celu 1.9 (instalatory), nie
  dla samego O7 - cytat wprost: „Instalator pozostaje częścią odpowiedniego, wcześniej ustalonego
  celu wydania i jego osobnych warunków". Potwierdza to, że dotychczasowe zawężanie zakresu O7
  (bez testowania spakowanego instalatora, bez buildów macOS) było poprawną interpretacją, nie
  unikaniem pracy - zbieżne z już istniejącym zakazem użytkownika co do Celu 1.9.
- Sekcja 29 wymaga klasyfikacji `Krytyczny`/`Wysoki`/`Średni`/`Niski` dla każdego problemu -
  dopisana retroaktywnie w nowej sekcji 1.2 macierzy dla wszystkich realnych znalezisk tej sesji
  (najwyższa: `Wysoki` dla niemal niewidocznego tekstu `HeatmapTable` przy silnym nasyceniu).

Pełne wpisy: [MACIERZ_AUDYTU_REDESIGN_O.md](MACIERZ_AUDYTU_REDESIGN_O.md), nowa sekcja
„Doprecyzowanie zakresu" na początku dokumentu i sekcja 1.2.

**O7, trzy konkretne wymogi sekcji 21 (dostępność) sprawdzone WPROST przeciw literalnemu
tekstowi po raz pierwszy** (wcześniej tylko rekonstruowane z pamięci):

- „Animacje trwają około 120-180 ms" - `--motion-fast/-normal/-slow` w `tokens.css` to
  dokładnie 120ms/160ms/180ms - trafienie w widełki, nie przybliżenie.
- „Tooltipy są dostępne z klawiatury" - `Tooltip.tsx` ma `onFocus`/`onBlur` obok
  `onMouseEnter`/`onMouseLeave`, z komentarzem w kodzie wprost tłumaczącym dlaczego.
- Jedyne wystąpienie `tabIndex={-1}` w całej aplikacji (`AppShell.tsx`, `<main
id="main-content">`) to poprawny, standardowy wzorzec skip-linku, nie błąd - pozwala
  przenieść fokus programowo bez dodawania do normalnej kolejności Tab.

Wszystkie trzy PASS, bez zmian kodu - ale to pierwsza chwila, gdy dało się je zweryfikować
przeciw rzeczywistej liczbie/tekstowi promptu, a nie przeciw odtworzonemu z pamięci
przybliżeniu.

**O7, znaleziony i naprawiony realny błąd: `DataPage.tsx` pominięty przy migracji na stan
`loading` (część 4).** Czytając pełną listę komponentów z sekcji 9 promptu ("każdy komponent
ma posiadać komplet stanów... loading"), ponownie sprawdzeni wszyscy konsumenci `Button` -
`DataPage.tsx` (5 przycisków: eksport CSV/XLSX/PDF, kopia zapasowa, przywracanie) wciąż używał
starego ręcznego wzorca (`{x ? "..." : "..."}` + `disabled`), pominięty przy pierwotnej migracji
9 innych plików. Naprawione: wszystkie 5 przycisków dostały `loading={warunek}`, tekst
przestał się zmieniać (spinner NAD stałym tekstem, konsystentnie z resztą aplikacji).
Klasyfikacja ważności (sekcja 29): **Wysoki** - jedyny plik z 10 realnie potrzebujących tego
stanu, który go nie miał, akurat w miejscu z najdłuższą operacją (backup/restore całej bazy).

Weryfikacja: `pnpm typecheck` PASS, sprawdzone w przeglądarce (kliknięcie „Utwórz kopię
zapasową", `aria-busy` poprawnie `null` w stanie spoczynku, zero błędów konsoli po kliknięciu,
przycisk wraca do normalnego stanu po nieudanym wywołaniu Tauri) - pełny cykl `loading` nie do
zaobserwowania bez prawdziwego backendu (operacja kończy się/odrzuca zbyt szybko w tym
środowisku), ale poprawność oparta na identycznym, już 7-krotnie przetestowanym wzorcu
`Button.tsx`.

**O7, część 41 nie była ostatnia: 5 KOLEJNYCH pominiętych przycisków tego samego wzorca.**
Rozszerzony `grep` po całym `apps/desktop/src/pages` na dokładny wzorzec `{x ? "..." : "..."}`
(nie tylko powtórka sprawdzenia konsumentów z części 4) ujawnił: `CloseTradeModal.tsx`
(„Zamknij pozycję"), `ImportBrokerModal.tsx` („Importuj"), `NewTemplateModal.tsx` („Utwórz
szablon"), `settings/DataSection.tsx` („Sprawdź integralność danych") i - co najbardziej
zaskakujące - DRUGI przycisk w `SzablonyInstrumentowPage.tsx` („Przypisz"), pliku uznanym
wcześniej za już w pełni zmigrowany w części 4. To pokazuje, że „plik zmigrowany" nie znaczy
„każdy przycisk w pliku zmigrowany" - trzeba sprawdzać przycisk po przycisku.

Naprawione identycznie jak `DataPage.tsx`: `loading={warunek}` dopisany obok istniejącego
`disabled`, tekst przycisku ustabilizowany (bez zmiany na "..." podczas ładowania - to teraz
robi spinner). Zweryfikowane szerszym regexem: 0 pozostałych wystąpień wzorca w całym
`apps/desktop/src`. Klasyfikacja: **Wysoki** (ta sama klasa co część 41).

Weryfikacja: `pnpm typecheck`, `pnpm test` 271/271, `pnpm format:check` - wszystko zielone,
ten sam znany błąd lintu sprzed redesignu, zero nowych.

**O7, część 43: migracja `:active` (część 7-10) też nie była wyczerpująca.** Ta sama metoda,
która ujawniła luki w migracji `loading` (część 41-42) - porównanie WSZYSTKICH 21 plików z
`cursor: pointer` z plikami, które faktycznie dostały `:active` (tylko 5) - ujawniła 2 pominięte
przyciski: `FormPanel.header` (rozwijanie sekcji formularza) i `SettingsPage.menuItem`
(wewnętrzna nawigacja Ustawień). Oba miały już hover i focus-visible, ale nie active. Naprawione
tym samym wzorcem co `Sidebar.navLink`: `transform: scale(0.98)` na `:active`, w obu przypadkach
objęte już istniejącym `transition`.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, brak błędów konsoli.

**O7, część 44: przegląd z części 43 nie był dokończony - jeszcze 11 pominiętych elementów.**
Kontynuacja tego samego systematycznego przeglądu, tym razem sprawdzonego element po elemencie
(nie plik po pliku), znalazła kolejne braki `:active`/`:focus-visible`:
`ColorPicker.trigger`, `Toast.closeButton`, `Tag.removeButton`,
`TradeAttachments.thumbnailButton` i `.linkRow`, `StatCard.clickable`,
`PreferenceSections.swatch`, `DataSection.header`, `EmotionsEditor.suggestion` i
`.scaleButton`, `AccountsPage.nameButton`. Dwa z nich (`TradeAttachments.thumbnailButton`,
`DataSection.header`) nie miały wcześniej NAWET `:focus-visible` - dopisany razem z `:active`.
Skala `transform` dobrana wg rozmiaru elementu, zgodnie z ustalonym precedensem: 0,94 dla
małych przycisków ikon, 0,97-0,98 dla większych przycisków/wierszy, 0,9 dla małych próbek
koloru. Dwa natywne elementy `<details>/<summary>` (rozwijane sekcje) świadomie pominięte -
tak samo jak wcześniej `Checkbox`, bo renderowanie natywne przeglądarki.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271.

**O7, część 45: strukturalna luka WCAG 2.1.1 - wiersze tabeli klikalne tylko myszą.** Przy tym
samym przeglądzie znalezione coś poważniejszego niż brakujące CSS: `TransactionsPage.tsx`
(lista transakcji) i `BreakdownTable.tsx` (rozbicie wyniku w Raportach) używają
`<tr onClick={...}>` bez żadnej obsługi klawiatury - brak `tabIndex`, `role`, `onKeyDown`. To
realny błąd WCAG 2.1.1 (Keyboard), nie subiektywna ocena: `AccountsPage.module.css`'s
`.nameButton` w TYM SAMYM repo już pokazuje poprawny wzorzec (prawdziwy `<button>` stylizowany
na zwykły tekst, z komentarzem w kodzie wprost to tłumaczącym). Klasyfikacja ważności (sekcja
29): **Wysoki** - cała funkcjonalność (otwarcie szczegółów transakcji, drill-down raportu)
kompletnie niedostępna dla użytkowników klawiatury, nie kosmetyka.

Naprawione bez zmiany UX: zamiast przebudowy na zagnieżdżony przycisk (co zawęziłoby klikalny
obszar z "całego wiersza" do "jednej komórki"), dodane bezpośrednio na `<tr>`: `tabIndex={0}`,
`role="button"`, `aria-label` opisujący akcję, `onKeyDown` reagujący na Enter/Spację tą samą
akcją co `onClick` (z `event.preventDefault()`, żeby Spacja nie przewijała strony). Widoczność
fokusu przez `:focus-visible` z `outline` i ujemnym `outline-offset: -2px` - świadomie NIE
`transform: scale()` na `<tr>`, bo transformacje na wierszach tabeli różnie renderują się między
przeglądarkami (ryzyko rozjechania layoutu), więc dla wierszy zostaje sam `outline`.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271, brak błędów konsoli.

**O7, weryfikacja runtime całego pakietu części 43-45.** Port 1430 akurat wolny (użytkownik nie
miał uruchomionego własnego serwera) - okazja do sprawdzenia, czy wszystkie 18 reguł `:active`
i obie nowe reguły `.clickableRow:focus-visible` (`TransactionsPage`, `BreakdownTable`)
faktycznie skompilowały się przez CSS Modules/Vite bez literówek czy pomyłek w selektorach, nie
tylko że wyglądają poprawnie w źródle. `preview_start` + `javascript_tool` przeszukujący
`document.styleSheets` po dosłowny `cssText` każdej reguły w serwowanym budce - wszystkie 20
reguł znalezione dokładnie takie, jak oczekiwano (np. `._trigger_1b5ip_5:active { transform:
scale(0.97); }`), `--color-focus-ring` rozwiązany do realnego, widocznego koloru `#7ea1ff` (nie
`undefined`/przezroczysty), zero błędów konsoli na `/` i `/transakcje`. Zrzuty ekranu dalej
niedostępne w tym środowisku - trzecie potwierdzenie tego samego ograniczenia narzędzia
("Browser pane is not displayed"), nie nowa usterka. `preview_stop` po zakończeniu.

**O7, zamknięcie sweepu `:active` - ponowne przeliczenie wszystkich 21 plików.** Po częściach
43-45 ponownie skrzyżowane 21 plików z `cursor: pointer` z plikami, które faktycznie mają
`:active` (teraz 16, nie 5). Zostało dokładnie 6 plików bez `:active` - każdy sprawdzony wprost
w `.tsx`, czy to naprawdę uzasadniony wyjątek: `BreakdownTable.module.css` i
`TransactionsPage.module.css` (`.clickableRow` na `<tr>` - świadomie `:focus-visible`+`outline`
zamiast `transform`, część 45), `TradeAuditLog.module.css` i `ZasadyHandluPage.module.css`
(`.summary`/`.categorySummary` - potwierdzone jako natywny `<summary>` wewnątrz `<details>`, ta
sama kategoria co wcześniej uzasadniona), `CommandPalette`/`Checkbox` (uzasadnione wcześniej).
Wcześniejsza notatka „14 plików" w części 43 była już nieaktualna po części 44 - to pierwsza
chwila, gdy wszystkie 6 zweryfikowano pojedynczo, a nie zsumowano przybliżeniem. Sweep `:active`
zamknięty jako wyczerpujący, bez zmian kodu.

**O7, część 46: ten sam sweep dla stanu `disabled` (sekcja 9) - znaleziony i naprawiony realny
błąd w `EmotionsEditor`.** Ta sama metoda, która zamknęła sweep `:active`/`:focus-visible`:
skrzyżowane 33 pliki `.tsx` używające `disabled=` z 7 plikami `.css` mającymi `:disabled`. Dla
każdego z 33 sprawdzone, czy `disabled` trafia na współdzielony komponent (`Button`/`Select`/
`TextField`/`IconButton`/`Switch`/`Checkbox` - już mają `:disabled`) czy na natywny element bez
własnego CSS dla tego stanu.

Znaleziony 1 realny błąd: `EmotionsEditor.module.css`'s `.scaleButton` nie miał ŻADNEJ reguły
`:disabled`. `TradeFormModal` w trybie odczytu (`disabled={readOnly}`) ustawia natywny atrybut
`disabled` na przyciskach skali intensywności emocji - te przyciski NIE są ukryte w trybie
odczytu (w przeciwieństwie do wyszukiwarki emocji i przycisku „Usuń", które są), bo mają
pokazywać zapisaną wartość. Bez `:disabled` przycisk wyglądałby identycznie jak klikalny -
przeglądarki nie przyciemniają automatycznie customowych `background`/`border`/`color`. Naprawione
tym samym wzorcem co `Button:disabled`/`Select:disabled`: `cursor: not-allowed; opacity: 0.6;
filter: saturate(0.35);`. Klasyfikacja ważności (sekcja 29): **Średni** - mylące, ale nie
blokujące (dane nadal widoczne i poprawne, tylko mylący sygnał wizualny).

Pozostałe 10 sprawdzonych natywnych przycisków z wcześniejszego sweepu `:active`
(`.thumbnailButton`/`.linkRow`/`.nameButton`/`.trigger`/`.removeButton`/`.header`×2/
`.menuItem`/`.clickable`/`.swatch`) nigdy nie otrzymują `disabled` w swoich `.tsx` - potwierdzone
wprost, nie kolejna luka.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271. Port 1430 znów wolny -
`preview_start` + `javascript_tool` potwierdził `._scaleButton_...:disabled { cursor:
not-allowed; opacity: 0.6; filter: saturate(0.35); }` w realnie serwowanym CSS, zero błędów
konsoli, `preview_stop` po zakończeniu.

**O7, część 47: ten sam sweep dla `:hover` - 2 realne błędy, jeden we WŁASNEJ pracy tej sesji.**
Skrzyżowane 21 plików z `cursor: pointer` z 21 plikami z `:hover` (ale nie te same 21 - różne
zestawy). 6 kandydatów bez hover: 4 to natywne elementy już uzasadnione (`<summary>` w
`TradeAuditLog`/`ZasadyHandluPage`, `Checkbox`, `Switch`), 2 to realne błędy.

`TransactionsPage.module.css`'s `.clickableRow` nie miał `:hover`, mimo że WŁASNY komentarz przy
`.selectedRow` w tym samym pliku zakłada, że hover istnieje ("stąd pasek w kolorze akcentu, a nie
samo tło, które zlewałoby się z hoverem sąsiada") - `BreakdownTable.clickableRow` (identyczny
wzorzec drill-down) miał `:hover` od początku, `TransactionsPage` nigdy go nie dostał.

`settings/DataSection.module.css`'s `.header` - poważniejsze, bo to błąd WE WŁASNEJ PRACY tej
sesji (część 44): komentarz dodany wtedy mówi dosłownie „brak hover/focus-visible/active tu było
luką", ale naprawiono tylko `:focus-visible` i `:active` - `:hover` obiecany w komentarzu nigdy
nie trafił do kodu. Znalezione i naprawione w tym samym cyklu audytu, zanim urosło w kolejny dług
techniczny do odkrycia później.

Oba naprawione identycznie jak `FormPanel.header` (ten sam wzorzec "rozwijana sekcja"):
`background: var(--color-surface-alt)` na `:hover`.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271. Port 1430 wolny -
`preview_start` + `javascript_tool` potwierdził obie reguły (`.clickableRow:hover` w obu plikach,
`.header:hover` w obu plikach) w realnie serwowanym CSS, zero błędów konsoli, `preview_stop` po
zakończeniu.

**O7: zweryfikowana wprost pułapka fokusu `Modal`-a (sekcja 21) - nigdy wcześniej sprawdzona
realnie w tym audycie.** `Modal.tsx` jest oparty na natywnym `<dialog>` + `showModal()` -
istniejący `Modal.test.tsx` sprawdza tylko render i klik przycisku „Zamknij", nie samą pułapkę
fokusu (JSDOM nie implementuje realnej pułapki `<dialog>`, więc test jednostkowy nie mógłby tego
uczciwie sprawdzić). Port 1430 wolny - otwarty `AccountFormModal` w przeglądarce, potwierdzone 9
elementów fokusowalnych, wysłane 12× Tab i 15× Shift+Tab (celowo więcej niż liczba elementów) -
fokus ANI RAZU nie uciekł poza `<dialog>` w żadnym kierunku. Zgodnie z zasadą sekcji 30 („nie
oznaczaj PASS wyłącznie przez założenie") - to realny dowód, nie odczytanie kodu i zaufanie mu.

Przy tej samej weryfikacji znaleziona GRANICA NARZĘDZIA, nie błąd aplikacji: syntetyczny Escape
przez `computer{action:"key"}` nie wyzwala natywnego zamknięcia `<dialog>`, mimo że zdarzenie
jest `isTrusted:true` i `defaultPrevented:false` (zainstrumentowane listenery to potwierdziły).
Sprawdzone, że żaden kod aplikacji nie przechwytuje Escape (`grep` całego repo - tylko
`CommandPalette` obsługuje Escape, i tylko we własnym polu, bez `preventDefault`), a kliknięcie
przycisku „Anuluj" zamyka modal natychmiast - `onClose` jest więc okablowany poprawnie. Ta sama
klasa ograniczenia narzędzia co już znane „Enter/Spacja nie aktywują przycisków" w Browser pane -
zapisane jako nowy punkt w pamięci sesji, żeby nie badać tego ponownie w przyszłości.

Weryfikacja: bez zmian kodu (kod już był poprawny), `preview_start`+`computer`+`javascript_tool`
2026-07-24, `preview_stop` po zakończeniu.

**O7, część 48: ten sam test na `CommandPalette` - tym razem znaleziony REALNY błąd, nie granica
narzędzia.** `CommandPalette.tsx` ma `role="dialog" aria-modal="true"`, ale w przeciwieństwie do
`Modal` NIE jest natywnym `<dialog>` (to zwykły `<div>`), więc nie dostaje pułapki fokusu za
darmo od przeglądarki. Ta sama metoda weryfikacji: otwarcie palety (`Ctrl+K` przez zdarzenie
JS), seria `Tab` przez `computer{action:"key"}`, sprawdzenie czy fokus zostaje w panelu.

Po 23 naciśnięciach Tab fokus uciekł z panelu na link `/stan-emocjonalny` w Sidebarze -
CAŁKOWICIE ukryty pod overlayem palety, która nadal była otwarta na ekranie. `aria-modal="true"`
obiecuje czytnikom ekranu, że treść poza panelem jest niedostępna, ale nic w kodzie tego nie
egzekwowało - przyciski listy poleceń i cały Sidebar za nimi to zwykłe fokusowalne elementy w
normalnej kolejności DOM. Klasyfikacja ważności (sekcja 29): **Wysoki** - globalna funkcja
(`Ctrl+K`, używana często) myli użytkownika klawiatury, fokus ląduje na niewidocznym elemencie.

Naprawione minimalnie: `onKeyDown` pola wyszukiwania dostał gałąź `Tab` → `event.preventDefault()`,
przypinającą fokus do pola. Nawigacja po liście poleceń jest i tak strzałkami (Up/Down) + Enter -
Tab nigdy nie był potrzebny do dotarcia do pozycji listy, tylko przypadkowo do tego prowadził
(kliknięcie myszą na pozycji od razu zamyka paletę, więc to jedyna droga ucieczki fokusu).

Zweryfikowane po naprawie: 25× Tab - fokus cały czas na polu wyszukiwania, nigdy nie uciekł.
Strzałka w dół nadal poprawnie podświetla dokładnie 1 pozycję listy - bez regresji w istniejącej
nawigacji klawiaturą.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271, `preview_start`+
`computer`+`javascript_tool` potwierdził błąd PRZED naprawą i brak go PO, `preview_stop` po
zakończeniu.

**O7, część 49: znalezione 2 naruszenia WŁASNEGO, udokumentowanego w kodzie kontraktu -
`net_pnl` kolorowany bez `formatSignedMoney`.** `decimal.ts` ma jawny komentarz przy
`formatSignedMoney`: „Używana wszędzie tam, gdzie wartość jest dodatkowo KOLOROWANA na
zielono/czerwono. Sam kolor nie może być jedynym nośnikiem informacji". Sweep tą samą metodą co
poprzednie: skrzyżowane 8 plików z `styles.profit`/`styles.loss` z 5 plikami wołającymi
`formatSignedMoney`.

Znalezione 2 realne naruszenia tego kontraktu: `CalendarPage.tsx` (komórka dnia w kalendarzu -
`.profitDay`/`.lossDay` na tle koloru dnia, ale `formatMoney` bez znaku) i
`TradePreviewCard.tsx` (wiersz „Wynik netto" w podglądzie na żywo kalkulatora pozycji -
dynamiczny `tone` wg znaku, ale też `formatMoney`). Oba miejsca pokazywały niejawny minus dla
strat (domyślne zachowanie `Intl.NumberFormat`), ale ZERO znaku dla zysków - dokładnie ryzyko
opisane w komentarzu ("różnią się wtedy tylko minusem, który łatwo przeoczyć obok cyfr").

Pozostali kandydaci sprawdzeni pojedynczo, nie kolejna luka: `StatCard`/`ReadOnlyField`
konsumenci albo w ogóle nie ustawiają `tone` (neutralne, bez koloru - np. „Śr. miesięczny P&L"
w raporcie rocznym), albo ustawiają `tone` na wartości inherentnie jednoznakowej („Potencjalny
zysk" - liczba zawsze dodatnia z definicji, sama etykieta tekstowa już niesie znaczenie, jak
wcześniej uzasadniony przypadek `Badge`). `TradeBalanceCard.tsx` i saldo/ryzyko/brutto w
`TradeInspector.tsx`/`TradePreviewCard.tsx` poprawnie zostają przy zwykłym `formatMoney` - to
NIE są wyniki, zgodnie z tym samym komentarzem w kodzie.

Naprawione zamianą `formatMoney`→`formatSignedMoney` wyłącznie w tych 2 miejscach, bez ruszania
pozostałych wywołań w tych samych plikach.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271 - `formatSignedMoney`
ma już dedykowane testy jednostkowe w `decimal.test.ts` (znak dla dodatnich/ujemnych/zera,
z walutą i bez), więc mechaniczna zamiana funkcji formatującej w miejscu wywołania jest w pełni
pokryta bez potrzeby dodatkowego testu komponentu.

**O7, część 50: „Enter zatwierdza właściwą akcję" (sekcja 21) - 2 z 4 mikro-formularzy „wpisz
nazwę + Dodaj" nie obsługiwały Enter wcale.** `Button` domyślnie ma `type="button"`, więc ryzyko
tu nie jest "Enter uruchamia złą akcję" (jak przy `variant="danger"`, sprawdzone osobno - jedyne
takie miejsce, `KoszPage.tsx`, jest bezpieczne, bo nie ma `<form>` łączącego pole wyszukiwania z
przyciskiem niszczącym), tylko "Enter nie robi nic", mimo że identyczny wzorzec w innym miejscu
aplikacji już to obsługuje.

Sweep znalazł 4 miejsca dokładnie tego samego wzorca („Nowy X" + przycisk „Dodaj"):
`TradeFormModal.tsx` (dodawanie interwału z poziomu formularza transakcji) i
`TradeAttachments.tsx` (dodawanie linku) już mają jawny `onKeyDown` z komentarzem w kodzie
tłumaczącym dlaczego ("Bez tego Enter w polu adresu/nazwy trafiłby do formularza karty
transakcji"). `IntervalsSection.tsx` i `EmotionalStatesSection.tsx` (obie w Ustawieniach) - te
same widżety dla tych samych operacji (dodanie interwału/stanu emocjonalnego), ale BEZ żadnej
obsługi Enter.

Naprawione identycznie jak istniejący wzorzec: `onKeyDown` z `event.preventDefault()` +
wywołaniem tej samej funkcji `handleAdd()`, którą wywołuje przycisk „Dodaj".

Weryfikacja WYKONANIA, nie tylko wyglądu kodu: wstrzyknięty fałszywy
`window.__TAURI_INTERNALS__.invoke` (technika z pamięci sesji), wpisana wartość pola przez
natywny setter + zdarzenie `input`, wysłany `Enter` - potwierdzone, że `create_interval`
i `create_emotional_state` faktycznie wywołują się z poprawną wartością pola
(`{"label":"M15 test"}`, `{"name":"Euforia test"}`), nie tylko że `event.preventDefault()`
zwraca `true`. `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271, `preview_start` +
`javascript_tool`, `preview_stop` po zakończeniu.

**O7: sprawdzone (częściowo) „brak utraty focusu podczas automatycznych przeliczeń" (sekcja
21).** `TradeFormModal.tsx` (`preview_trade`, debounce 300ms) i `KalkulatorPozycjiPage.tsx`
(`calculate_position_size`, debounce 250ms, z komentarzem w kodzie wprost mówiącym, że to ten
sam wzorzec) - przegląd kodu potwierdza, że wynik przeliczenia trafia do OSOBNEGO stanu
(`preview`/`result`), nie do stanu samych pól formularza, więc pola input nie powinny się
remontować przy każdym przeliczeniu.

Próba pełnej weryfikacji w przeglądarce z wstrzykniętym fałszywym mostkiem Tauri: pierwszy
przebieg (prostszy przypadek) potwierdził, że DOKŁADNIE ten sam węzeł DOM pola „Cena wejścia"
pozostaje skupiony 500ms po wpisaniu wartości (dłużej niż debounce). Drugi przebieg (pełny
kalkulator pozycji) natrafił na awarię interfejsu spowodowaną NIEPOPRAWNYM kształtem mojej
sfałszowanej odpowiedzi `calculate_position_size` (zgadywane pola nie pasowały do prawdziwych:
`actual_risk_amount`/`stop_loss_price`/`loss_per_lot`/`raw_lot`/`rr`) - to mój błąd testowy, nie
potwierdzony błąd aplikacji, ale też nie domyka pełnej, czystej weryfikacji.

Uczciwie oznaczone jako CZĘŚCIOWO ZWERYFIKOWANE, nie PASS - zgodnie z zasadą sekcji 30 („nie
oznaczaj PASS wyłącznie przez założenie"). Wysoka pewność z przeglądu kodu (identyczny,
świadomie powtórzony wzorzec w 2 miejscach), ale bez pełnego domknięcia dowodem z przeglądarki.

**O7: domknięta powyższa częściowa weryfikacja - teraz pełny PASS.** Odczytany wprost pełny
interfejs `PositionSizingResult` w `KalkulatorPozycjiPage.tsx:22-36` (13 pól, w tym pominięty
wcześniej `warnings: string[]`) i zbudowany kompletny, poprawny fałszywy mostek Tauri zamiast
zgadywanego. Dodatkowo: uruchomione na ŚWIEŻEJ karcie przeglądarki (`tabs_create`), nie na tej
samej co poprzednia nieudana próba - odkryte przy okazji, że `read_console_messages` kumuluje
historię przez cały czas życia karty, nie tylko od ostatniej nawigacji (stary błąd z poprzedniej
próby dalej pojawiał się w konsoli mimo poprawnie działającej strony i wielu świeżych nawigacji;
dopiero nowa karta pokazała czystą konsolę) - zapisane jako nowy punkt w pamięci sesji.

Na czystej karcie: `calculate_position_size` faktycznie wywołane z poprawnym payloadem, wynik
poprawnie wyrenderowany, DOKŁADNIE ten sam węzeł DOM pola „Cena wejścia" pozostał skupiony
(potwierdzone znacznikiem na obiekcie węzła, nie tylko selektorem), pozycja kursora zachowana,
zero błędów konsoli. Pełny PASS, bez zmian kodu (kod już był poprawny).

**O7: 4 trasy zweryfikowane z prawdziwymi danymi, nie tylko stanem błędu - pierwszy raz w tym
audycie.** Wstrzyknięty fałszywy `window.__TAURI_INTERNALS__.invoke` zwracający kompletne,
zgodne z prawdziwymi interfejsami TS obiekty (`Trade`, `AccountWithBalance`, `AccountReport`),
na świeżych kartach przeglądarki. Cel: potwierdzić, że naprawy tej sesji (część 45 - klawiaturowo
dostępne wiersze, część 47 - hover, część 49 - `formatSignedMoney`) faktycznie działają z
realnymi danymi, nie tylko w izolacji/kodzie.

`/transakcje` z 2 transakcjami (zyskowna + stratna): tabela poprawna, `formatSignedMoney`
pokazuje jawny znak w obu kierunkach, oba wiersze mają poprawne atrybuty dostępności - i
FUNKCJONALNIE: fokus na wierszu + Enter faktycznie otworzył `TradeInspector` z poprawnymi
danymi transakcji. Zero błędów konsoli.

`/kalendarz` z dniem zyskownym i stratnym: oba pokazują jawny znak i poprawną klasę CSS
(`profitDay`/`lossDay`) zgodną ze znakiem wartości. Zero błędów konsoli.

`/raporty` (zakładka Miesięczny, pełny `FilteredReport`): statystyki, kalendarz miesiąca
i TOP 5 najlepszych/najgorszych transakcji wyrenderowane poprawnie, `formatSignedMoney`
z jawnym znakiem wszędzie. Przy tej weryfikacji znalezione, że `BreakdownTable.tsx` nigdzie
się nie renderuje (osobny wpis wyżej). Zero błędów konsoli.

`/konta` z 2 kontami: `.nameButton` kliknięty FUNKCJONALNIE otworzył `AccountDetailsModal`
z poprawnymi danymi. Zero błędów konsoli.

`/strategie` z 2 strategiami: tabela poprawna, zero błędów konsoli - weryfikacja ogólna.

`/dane` (`DataPage.tsx`, część 41-42): kliknięty „Utwórz kopię zapasową" z fałszywym opóźnieniem
800ms - `aria-busy`/`disabled` poprawnie aktywne przez cały czas operacji, wracają do
`null`/`false` po zakończeniu. Pierwsza próba (podzielona na 2 osobne wywołania narzędzia) dała
fałszywy negatyw przez opóźnienie MIĘDZY wywołaniami, nie prawdziwy błąd - poprawiona metoda:
klik + wszystkie odczyty w JEDNYM atomowym skrypcie z wewnętrznymi `await`. Zapisane w pamięci
sesji jako nowy punkt 9, żeby nie powtórzyć tego błędu testowego.

`/kosz` (`KoszPage.tsx` część 52, `IconButton` część 53): lista poprawna, `dependency_note`
wyświetlany dla powiązanych kont, „Opróżnij kosz" otworzyło prawdziwy `ConfirmDialog`
z poprawną treścią, potwierdzenie faktycznie wywołało `empty_trash`/`restore_trash_item`
z `aria-busy`/`disabled`/spinnerem aktywnym przez cały czas operacji. Zero błędów konsoli
w żadnym z kilku przebiegów tej trasy.

`/` (Dashboard, pełny `FilteredReport`+`AccountComparisonRow[]`): to na tej trasie znaleziony
brakujący jawny znak w StatCard „Wynik netto" (część 51) - PRZED naprawą „100,00 USD" na
zielono, PO naprawie „+100,00 USD". Rankingi, heatmapy, rozkład wyników poprawne. Zero błędów
konsoli.

`/kalkulator-pozycji` (pełny `PositionSizingResult`, część 50-51 - weryfikacja braku utraty
focusu): wpisanie ceny/SL/ryzyka wywołało `calculate_position_size`, wynik wyrenderowany,
dokładnie ten sam węzeł DOM pola „Cena wejścia" pozostał skupiony przez cały debounce. Zero
błędów konsoli.

Pozostałe 5 tras wciąż niesprawdzone z prawdziwymi danymi - blokada częściowo, nie w pełni,
zamknięta.

**O7, część 51: kontrakt `formatSignedMoney` (część 49) złamany w 5 KOLEJNYCH miejscach -
znalezione dopiero przy weryfikacji `/raporty` i Dashboardu z prawdziwymi danymi.** Sweep
części 49 szukał literalnego `styles.profit`/`styles.loss` w kodzie konsumentów - PRZEOCZYŁ
konsumentów `StatCard`/`ReadOnlyField`, które przekazują `tone` jako zwykły PROP, bez
odwołania do klasy CSS wprost w tym samym pliku. Odkryte wizualnie: Dashboard pokazywał
„Wynik netto: 100,00 USD" na zielonym tle, bez „+". Poprawiony sweep: `grep -rn "tone={"` w
całym `apps/desktop/src` (dokładna metoda zamiast przybliżonej) - znalazł dokładnie 5 miejsc
z dynamicznym `tone={Number(x) >= 0 ? "profit" : "loss"}`, wszystkie formatujące przez zwykłe
`formatMoney`: `DashboardPage.tsx` („Wynik netto"), `ReportMonthlyTab.tsx` („P&L netto",
„Zrealizowane na pozycjach otwartych"), `ReportYearlyTab.tsx` („P&L netto roku", „Zrealizowane
na pozycjach otwartych").

Naprawione identycznie jak część 49: `formatMoney`→`formatSignedMoney` wyłącznie w tych 5
wywołaniach. Reszta `tone=` w tych samych plikach świadomie NIE zmieniona - `tone="profit"`/
`tone="loss"` STATYCZNE na wartościach inherentnie jednoznakowych („Średni zysk"/„Średnia
strata" - etykieta już niesie znaczenie).

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271. Zweryfikowane w
przeglądarce na fałszywym `FilteredReport`/`AccountComparisonRow` (świeża karta) - PRZED
naprawą Dashboard pokazywał „100,00 USD" bez znaku, PO naprawie (HMR podchwycił zmianę na
żywo) „+100,00 USD" - to samo potwierdzone na zakładkach Miesięczny i Roczny raportów. Zero
błędów konsoli.

**O7, znalezisko przy okazji: `BreakdownTable.tsx` jest martwym kodem od „Fazy 9 v2", nie od
bieżącego redesignu.** Próba weryfikacji zakładki „Strategia"/„Instrument" z prawdziwymi danymi
ujawniła, że „Wynik wg strategii"/„Wynik wg instrumentu" w zakładce Miesięcznej to wykresy
Recharts, nie tabele - sam komponent `BreakdownTable` nigdzie się nie renderuje. Potwierdzone
wyczerpująco: zero importów samego komponentu w całym `apps/desktop/src` poza jego własnym
plikiem. `git log --follow` pokazuje, że jedyny konsument (`ReportDimensionTab.tsx`) został
usunięty w commicie „Faza 9 v2: przebudowa wszystkich raportów i dashboardu wg wzoru
użytkownika" (`04adb14`) - zastąpiony osobnymi, zduplikowanymi tabelami wprost w
`ReportYearlyTab.tsx`/`ReportAccountComparisonTab.tsx`, które importują TYLKO CSS (klasy
`.profit`/`.loss`), nigdy sam komponent. Osierocony na długo PRZED Blokiem O.

Uczciwa retroaktywna adnotacja: naprawy `:active`/`:focus-visible`/klawiatury/`:hover` w tym
pliku z części 43-45/47 tej sesji były technicznie poprawne, ale obecnie nie docierają do
żadnego prawdziwego użytkownika. Klasyfikacja: **Niski** - dług techniczny, nie regresja, NIE
naprawiany w ramach O7 (usunięcie/reintegracja to osobna zmiana architektoniczna) - zgłoszony
jako osobne zadanie w tle.

**O7, część 52: migracja `loading` (część 41-42) DALEJ nie była wyczerpująca - 14 KOLEJNYCH
przycisków bez `loading` w 8 plikach, znalezionych przy weryfikacji `/kosz` z prawdziwymi
danymi.** Kliknięcie „Opróżnij kosz" nie pokazywało spinnera mimo że `disabled` poprawnie się
aktywował - sprawdzenie kodu ujawniło `disabled={busy}` bez towarzyszącego `loading={busy}`.
Rozszerzony sweep: znalezione wszystkie pliki w `apps/desktop/src/pages` z `disabled={` wprost
odwołującym się do zmiennej stanu async (`busy`/`saving`/`submitting`/`diagnosticsBusy`/
`creatingBackup`), każdy przycisk sprawdzony ręcznie.

Znalezione 14 przycisków w 8 plikach, wszystkie wyzwalające realny `invokeCommand`, żaden bez
`loading`: `KoszPage.tsx` (3 - „Opróżnij kosz" NIEODWRACALNA operacja, „Przywróć zaznaczone",
„Usuń trwale zaznaczone"), `SettingsPage.tsx` (3 - kopiuj/eksportuj diagnostykę, „Zapisz" w
dialogu nawigacji), `EmotionalStatesSection.tsx`/`IntervalsSection.tsx` (po 1 - „Dodaj"),
`ImportBrokerModal.tsx` (1 - „Wybierz plik CSV", `busy` aktywne podczas parsowania pliku, nie
podczas natywnego okna wyboru), `settings/DataSection.tsx` (1 - „Przywróć domyślne"),
`TradeAttachments.tsx` (3 - „Dodaj zdjęcie", „Wklej ze schowka", „Dodaj" link),
`TradeFormModal.tsx` (1 - „Zapisz szkic", brat „Zapisz transakcję" który już miał `loading`).

Rozróżnione od poprawnych przypadków bez `loading`: przyciski „Anuluj"/otwierające dialog
(ustalony wzorzec - nigdy nie potrzebują `loading`), `IconButton` w `KoszPage`/
`SzablonyInstrumentowPage` (architektoniczne ograniczenie - komponent nie ma w ogóle propa
`loading`, NIE naprawiane tu, poza zakresem punktowej poprawki). Klasyfikacja ważności (sekcja
29): **Wysoki** dla „Opróżnij kosz" - brak spinnera przy trwałej, nieodwracalnej operacji
wygląda jak kliknięcie nic nie zrobiło.

Naprawione dodaniem `loading={ta sama zmienna co disabled}` do wszystkich 14, bez zmiany reszty
logiki. Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 271/271.
`preview_start` - port 1430 był zajęty przez MÓJ WŁASNY serwer z wcześniejszej fazy tej samej
sesji (potwierdzone `preview_list` przed użyciem, nie serwer użytkownika), więc kontynuowane na
istniejącej karcie. „Opróżnij kosz" z fałszywym opóźnieniem 700ms w `empty_trash`: `aria-busy`/
`disabled` poprawnie `true` przez cały czas trwania operacji (odczyty w JEDNYM atomowym
skrypcie, zgodnie z punktem 9 w pamięci sesji), wraca do `null`/`false` po zakończeniu, zero
błędów konsoli.

**O7, część 53: domknięte architektoniczne ograniczenie z części 52 - `IconButton` dostał
obsługę `loading`.** Część 52 świadomie NIE naprawiła `IconButton` w `KoszPage`/
`SzablonyInstrumentowPage` (przywróć/usuń trwale/duplikuj/odepnij/do kosza), bo komponent
w ogóle nie miał propa `loading` - zgłoszone wtedy jako osobne zadanie w tle. Uznane teraz za
wystarczająco małe i dobrze uzasadnione, żeby zrobić bez czekania na osobną sesję.

Dodany prop `loading?: boolean` do `IconButtonProps`, spinner (`position: absolute; inset: 0`)
analogiczny do `Button.module.css`, ikona chowana przez `visibility` (nie `display: none`)
w nowym `.iconWrapper` - dokładnie ten sam wzorzec co `Button`. Podpięty w 5 miejscach
wyzwalających realny `invokeCommand` (`KoszPage`: przywróć/usuń trwale per wiersz;
`SzablonyInstrumentowPage`: duplikuj/odepnij/do kosza) - NIE podpięty w 3 miejscach, które
tylko nawigują/otwierają dialog („Edytuj instrumenty", „Zmień nazwę", „Przypisz do konta" - ten
sam wzorzec „Cancel/dialog-opening nie potrzebuje loading" co w części 52).

Nowy plik `IconButton.test.tsx` (4 testy, wzorem `Button.test.tsx`) - komponent nie miał
wcześniej ŻADNEGO testu jednostkowego, mimo że jest używany w dziesiątkach miejsc w aplikacji.

Weryfikacja: `pnpm format:check`, `pnpm typecheck`, `pnpm test` 275/275 (26 plików, +1 nowy +4
testy). Port 1430 przestał odpowiadać w międzyczasie (proces z wcześniejszej fazy zniknął) -
uruchomiony własny serwer, świeża karta. „Przywróć" w Koszu z fałszywym opóźnieniem 600ms:
`aria-busy`/`disabled`/spinner poprawnie aktywne przez cały czas trwania (odczyty w jednym
atomowym skrypcie), wraca po zakończeniu, zero błędów konsoli.

**O7, część 54: weryfikacja `/instrumenty` z prawdziwymi (fałszywymi) danymi + kolejna luka
architektoniczna znaleziona przy okazji.** `InstrumentsPage.tsx` wyrenderowana poprawnie z 2
instrumentami z fałszywego mostka Tauri (`InstrumentWithDetails`/`BrokerTemplate` zbudowane
z pełnych interfejsów TS w `app/types/instrument.ts`) - tabela, liczniki, lista kolejności
widocznych instrumentów.

Znalezisko: strona w ogóle nie miała zmiennej `busy` - żaden z 5 `IconButton` (pokaż/ukryj,
usuń, przesuń wyżej/niżej) ani 3 `Button` (2 zbiorcze + „Domyślna widoczność") nie blokował się
i nie pokazywał spinnera podczas `invokeCommand`, w przeciwieństwie do `KoszPage`/
`SzablonyInstrumentowPage` (część 52-53), które już to miały. Naprawione tym samym, ustalonym
wzorcem: `useState<boolean>` + `setBusy(true)`/`finally setBusy(false)` w wszystkich pięciu
handlerach async (`handleBulkVisibility`, `handleToggleVisibility`,
`handleResetDefaultVisibility`, `handleDelete`, `handleMoveVisible`), podpięte jako
`loading={busy}` wszędzie poza „Edytuj" (Pencil - tylko otwiera dialog, ten sam wzorzec
„dialog-opening nie potrzebuje loading").

Zweryfikowane w przeglądarce z fałszywym opóźnieniem 700ms w `set_instrument_visibility`:
`aria-busy`/`disabled` poprawnie `true` przez cały czas trwania operacji (jeden atomowy skrypt,
punkt 9 pamięci sesji), wraca do `null`/`false` po zakończeniu. Przy okazji potwierdzone, że
prawdziwe wartości `category` w systemie to gotowe polskie etykiety („Forex", „Metale" - patrz
`INSTRUMENT_CATEGORIES` w `app/types/instrument.ts`), nie kody do tłumaczenia - kolumna
„Kategoria" w tabeli renderuje je wprost poprawnie, żadna naprawa nie była tu potrzebna.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint src/pages/InstrumentsPage.tsx`,
`pnpm exec prettier --check src/pages/InstrumentsPage.tsx` - wszystkie czyste. Zero błędów
konsoli. Tras zweryfikowanych z prawdziwymi danymi: 10 z 14 (patrz
`MACIERZ_AUDYTU_REDESIGN_O.md`).

**O7, część 55: `/interwaly` + `/stan-emocjonalny` zweryfikowane - ten sam brak `busy` co
w części 54, tym razem w DWÓCH plikach naraz.** `IntervalsSection.tsx` i
`EmotionalStatesSection.tsx` (ten sam wzorzec, jeden opisany w komentarzu jako wzorowany na
drugim) nie śledziły stanu `busy` w ogóle - żaden `IconButton` (ukryj/pokaż, usuń, przesuń
wyżej/niżej, archiwizuj/przywróć, zapisz zmianę nazwy) nie blokował się i nie pokazywał
spinnera podczas `invokeCommand`.

Naprawione identycznym wzorcem co część 52-54: nowa zmienna `useState<boolean>` w obu plikach

- `setBusy(true)`/`finally setBusy(false)` we wszystkich async handlerach, podpięte jako
  `loading={busy}` wszędzie poza „Anuluj zmianę nazwy" (X - bez `invokeCommand`) i „Zmień nazwę"
  (Pencil - tylko otwiera tryb edycji). Istniejący `submitting` przy przycisku „Dodaj" w obu
  plikach zostawiony bez zmian - to osobna, niezależna zmienna od `busy` (dodawanie nowego
  elementu vs akcja na istniejącym).

Zweryfikowane w przeglądarce oba komponenty (fałszywe opóźnienie 700ms w
`set_interval_hidden`/`set_emotional_state_hidden`): `aria-busy`/`disabled` poprawnie `true`
przez cały czas trwania operacji (jeden atomowy skrypt, punkt 9 pamięci sesji), wraca po
zakończeniu. Zero błędów konsoli na obu trasach.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
275/275 - wszystkie czyste. Tras zweryfikowanych z prawdziwymi danymi: 12 z 14 (patrz
`MACIERZ_AUDYTU_REDESIGN_O.md`) - pozostały `/zasady-handlu` i `/ustawienia`.

**O7, część 56: `/zasady-handlu` zweryfikowane - inna odmiana tej samej luki, tym razem na
przycisku bez ŻADNEJ zmiennej stanu.** `ZasadyHandluPage.tsx` wyrenderowana poprawnie (1
kategoria, 1 pytanie). Sześć `IconButton` w trybie edycji (przesuń kategorię/pytanie wyżej/
niżej, dodaj pytanie, do kosza) sprawdzone i potwierdzone jako CELOWO bez `loading` - to czyste
edycje lokalnego `draft`, bez `invokeCommand`, zgodnie z ustalonym wzorcem.

Za to przycisk „Przywróć szablon" (`handleRestoreTemplates`, wywołuje
`restore_trading_rule_templates`) nie miał kompletnie żadnej zmiennej stanu ładowania - nie
tylko brak `loading`, ale strona w ogóle nie śledziła, że ta operacja trwa. Naprawione nową,
dedykowaną zmienną `restoringTemplates` (celowo NIE dzieloną z istniejącym `saving`, które
dotyczy osobnej operacji zapisu całej zakładki) + `setRestoringTemplates(true)`/
`finally setRestoringTemplates(false)` + `loading={restoringTemplates}`.

Zweryfikowane w przeglądarce z fałszywym opóźnieniem 700ms: kliknięcie otworzyło prawdziwy
`ConfirmDialog` z poprawną treścią ostrzeżenia, po potwierdzeniu `aria-busy`/`disabled`
poprawnie `true` przez cały czas trwania operacji (jeden atomowy skrypt, punkt 9 pamięci),
wraca po zakończeniu. Zero błędów konsoli.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
275/275 - wszystkie czyste. Tras zweryfikowanych z prawdziwymi danymi: 13 z 14 (patrz
`MACIERZ_AUDYTU_REDESIGN_O.md`) - pozostało tylko `/ustawienia`.

**O7, część 57: `/ustawienia` - próba weryfikacji z danymi ujawniła twardy limit narzędzia, nie
błąd w kodzie, sweep tras zamknięty w praktycznym zakresie.** `PreferencesProvider` (globalny,
opakowuje cały router) pobiera `get_preferences` dokładnie raz przy montowaniu, bez ponowienia
poza pełnym przeładowaniem strony - celowy projekt ("brak backendu nie może zostawić aplikacji
bez wyglądu", komentarz w kodzie). Fałszywy mostek Tauri da się wstrzyknąć dopiero PO pierwszym
wczytaniu strony, ale to pierwsze wczytanie (z konieczności bez mostka) już nieodwracalnie
zapisało błąd w kontekście dostawcy - a przycisk „Odśwież" (`window.location.reload()`, jedyny
poprawny sposób ponowienia) kasuje mostek zanim nowe drzewo React się zamontuje, w kółko.

Potwierdzone za to, że stan błędu renderuje się poprawnie (czytelny komunikat PL + działający
„Odśwież", ten sam wzorzec co reszta 14 tras w oryginalnym sweepie bez danych). Zapisane jako
punkt 10 w pamięci sesji - nie próbować tego ponownie, to strukturalny limit narzędzia, nie
brakująca weryfikacja.

Stan sekcji 24 (pełny test z prawdziwymi danymi): 13 z 14 tras z prawdziwymi danymi, 14 z 14 ze
stanem błędu, `/ustawienia` udokumentowane jako jedyny wyjątek z jasnym uzasadnieniem
technicznym - blokada uznana za zamkniętą w praktycznym zakresie dostępnym z tego narzędzia.

**O7, część 58: wyczerpujący sweep WSZYSTKICH 24 plików używających `IconButton` w całym
`apps/desktop/src` (nie tylko stron dotkniętych wcześniej w częściach 52-56) - znalezione 4 KOLEJNE
pliki z tym samym brakiem `busy`.** Metoda: `grep -rl "IconButton" apps/desktop/src`, każdy plik
sprawdzony ręcznie - czy `onClick` wywołuje `invokeCommand` (bezpośrednio albo przez hook), i czy
istnieje zmienna stanu podpięta jako `loading=`. Rozróżnione od poprawnych przypadków bez potrzeby
`loading`: dialog-openery (`Pencil`/`ArrowLeftRight` itd.), czyste edycje lokalnego stanu bez
backendu (`RuleListEditor`, `EmotionsEditor`, `PartialClosesEditor`, `TradeInspector` pin/zamknij),
nawigacja/motyw w `Sidebar`/`Header`. Wszystkie modale formularzy (`AccountFormModal`,
`StrategyFormModal`, `CashOperationsModal`, `CloseTradeModal`, `NewTemplateModal`,
`AccountDetailsModal`) sprawdzone i potwierdzone jako JUŻ poprawne - własny `submitting`/`busy`
podpięty pod `loading=` na przycisku zapisu.

Znalezione i naprawione 4 pliki, ten sam wzorzec `useState<boolean>` + `setBusy(true)`/
`finally setBusy(false)` + `loading={busy}`:

- `TradeAttachments.tsx` - `busy` JUŻ ISTNIAŁ (użyty na "Dodaj zdjęcie"/"Wklej ze schowka"/"Dodaj"
  z części 52) i faktycznie się ustawiał przez `withBusy()` przy przesuwaniu/usuwaniu załącznika -
  ale 3 `IconButton` (przesuń wyżej/niżej, usuń) nie miały `loading={busy}` w JSX, więc stan był
  śledzony, tylko niewidoczny. Najbardziej podstępny wariant tego błędu w całym audycie.
- `TransactionsPage.tsx` (główna lista transakcji!) - `handleSoftDelete`/`handleRestore` (Kosz/
  Przywróć transakcję) nie miały ŻADNEJ zmiennej `busy`. Dodana nowa.
- `AccountsPage.tsx` - `handleArchive`/`handleRestore` konta bez `busy`. Dodana nowa.
- `StrategiesPage.tsx` - `handleDuplicate`/`handleArchive`/`handleRestore` strategii bez `busy`.
  Dodana nowa.

Zweryfikowane w przeglądarce `/transakcje` (usunięcie transakcji do kosza, fałszywe opóźnienie
700ms) i `/konta` (archiwizacja konta, 700ms): `aria-busy`/`disabled` poprawnie `true` przez cały
czas trwania operacji (jeden atomowy skrypt, punkt 9 pamięci), wraca po zakończeniu, status
wiersza transakcji poprawnie zmienił się na "Zamknięta (w koszu)" po operacji. Zero błędów
konsoli na obu trasach.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
275/275 - wszystkie czyste. To zamyka sweep `IconButton`/`busy` w całej aplikacji - wszystkie 24
pliki z `IconButton` sprawdzone, nie tylko te dotknięte wcześniejszymi częściami.

**O7, część 59: sekcja 26 promptu ("niezależne obliczenia referencyjne") - 4 ścieżki liczbowe
zweryfikowane ręcznie, nie tylko przez odczytanie, że test istnieje.** Dotąd żadna część O7 nie
przeliczyła niczego SAMODZIELNIE wbrew dosłownemu brzmieniu sekcji 26 ("wykonaj niezależne
obliczenia referencyjne i porównaj je z aplikacją") - poprzednie części ufały istniejącym testom
Rust bez ręcznego przeliczenia ich wejść. Odczytany oryginalny dokument promptu
(`Prompt_finalny_redesign_O_TradingView_Apple_Fintech_i_pelny_audyt (2).md` w `Downloads`),
sekcje 22/23/26/28 - jedyne trzy z 23-32 bez dotychczasowego literalnego odniesienia w tym pliku.

Cztery reprezentatywne ścieżki przeliczone ręcznie z surowych danych wejściowych testu (nie
przepisane z oczekiwanego wyniku):

1. `trade_calculations::buy_profit_when_exit_above_entry` - EURUSD, wejście 1,10000/wyjście
   1,10500/SL 1,09500/TP 1,11000/prowizja 5/saldo 10000: 500 punktów × 1 USD/punkt = brutto 500,
   netto 495, ryzyko 500, zysk potencjalny 1000, RR 2, R 0,99, ryzyko% 5, wynik% 4,95 - wszystkie
   8 wartości zgodne z ręcznym przeliczeniem.
2. `trade_calculations::czesciowe_zamkniecia_sa_jedynym_zrodlem_wyniku_pienieznego` - suma
   częściowych zamknięć (180 + (-30) = 150) jako JEDYNE źródło brutto, NIE dodane do 500 z ceny
   wyjścia (co byłoby podwójnym liczeniem) - netto 150-5-2-1=142, punkty (metryka cenowa, nie
   pieniężna) liczone niezależnie z ceny = 500 - zgodne.
3. `position_sizing::liczy_lot_z_ryzyka_procentowego` - saldo 10000, ryzyko 1%=100 USD, SL 1000
   punktów×1 USD=1000 USD strata/lot → sugerowany lot 100/1000=0,10, jednostki 0,10×100000=10000
   - zgodne.
4. `trade_stats::max_drawdown_is_the_largest_peak_to_trough_drop` (ślad kapitału 100→-50→-20→180)
   - ręczne śledzenie szczytu: max drawdown = szczyt 100 minus dołek -50 = 150, kolejny dołek -20
     (drawdown 120 od tego samego szczytu) mniejszy, nowy szczyt 180 zeruje drawdown - zgodne z
     `max_drawdown = Some(150)`. `win_rate_and_profit_factor_from_wins_and_losses` (2 zyski, 1
     strata) - win_rate 2/3×100, profit_factor 300/50=6, expectancy 250/3, average_r (1+2-1)/3 -
     wszystkie zgodne z ręcznym przeliczeniem.

Redesign O (i osobny audyt formatowania z tej samej sesji) nie dotknął ANI JEDNEGO pliku
kalkulacyjnego - potwierdzone `git log --oneline` na `domain/trade_calculations.rs`,
`domain/position_sizing.rs`, `domain/trade_stats.rs`: ostatnie commity dotykające tych plików
to sprzed Bloku O (nie widnieją w żadnym z commitów tej sesji ani poprzednich części O1-O7).
`cargo test` 435/435 PASS bez zmian przez całą sesję redesignu i audytu formatowania -
mechaniczny dowód braku regresji uzupełniony teraz ręczną, niezależną weryfikacją arytmetyki.

Sekcja 22 (rozmiary okna/skalowanie Windows/macOS) i sekcja 23 (obowiązkowy audyt wizualny +
zrzuty ekranu) pozostają zablokowane TĄ SAMĄ, trzykrotnie potwierdzoną usterką środowiska
(`computer{action:"screenshot"}` nie kompozytuje klatek) - żadna nowa próba nie zmieniłaby tego
wyniku. Za to CAŁA lista ekranów z sekcji 23 („Dashboard; Nową transakcję; historię; Inspector;
konta; strategie; instrumenty; szablony brokerów; kalkulator; wszystkie raporty; Stan emocjonalny;
Zasady handlu; Kosz; Ustawienia; modale; menu; długie teksty; duże liczby; polskie znaki") została
w MIĘDZYCZASIE wyczerpująco sprawdzona na poziomie kodu przez OSOBNY, równoległy audyt tej samej
sesji (`TaskList` #1-23 w tym pliku, tabela PASS/FAIL 19/19) - inny punkt wyjścia (zgłoszenie
użytkownika o formatowaniu liczb), ale identyczny zakres ekranów co sekcja 23. Krzyżowe odniesienie
zapisane tutaj zamiast duplikowania już wykonanej pracy.

Sekcja 28 (narzędzia kontroli) - wszystkie wymagane narzędzia już uruchamiane rutynowo przy
każdej części tej sesji i w finalnej regresji audytu formatowania: `pnpm lint`/`format:check`/
`typecheck`/`test`, `cargo fmt --check`/`clippy -D warnings`/`test`. Jedyny czerwony punkt
(`cargo clippy`, 5 błędów martwego kodu w `preferences.rs`/`update_manifest.rs`/`state.rs`)
potwierdzony jako przedawniony dług sprzed tej sesji (`git log` na dotkniętych plikach), już
zgłoszony osobno (`task_c91d280f`) - świadomie nie mieszany z zakresem O7.

Weryfikacja: bez zmian kodu w tej części - wyłącznie ręczne przeliczenia i odczyt istniejących
testów/promptu. `cargo test` 435/435 potwierdzone ponownie.

**O7, część 60: sprostowanie do części 59 - znaleziony PRAWDZIWY, dedykowany moduł „audyt A4"
(sekcje 25+26), lepszy niż to, co ręcznie odtworzyłem.** Część 59 przeliczyła ręcznie 4 ścieżki
z ogólnych testów jednostkowych `trade_calculations`/`position_sizing`/`trade_stats`, nie
wiedząc jeszcze o `src-tauri/src/audyt.rs` - osobnym pliku z wcześniejszego audytu (Blok D),
który robi DOKŁADNIE to, czego dosłownie żąda sekcja 26 ("wykonaj niezależne obliczenia
referencyjne"), i to szerzej niż moja ręczna weryfikacja:

- `mod obliczenia_referencyjne` (sekcja 26) - **P&L SELL jako jawne LUSTRO P&L BUY**
  (`pnl_sell_jest_lustrem_pnl_buy` - ten sam ruch ceny, przeciwny znak, "najczęstsze miejsce na
  błąd znaku" wprost w komentarzu; moja część 59 sprawdziła tylko BUY), punkty-a-nie-ticki jako
  osobna metryka, liniowe skalowanie wyniku przez lot (1/0,5/0,01), koszty odejmujące się OD
  zysku I OD straty, **jawny test konwencji znaku swapu** (naliczony swap jako koszt, swap na
  korzyść jako wartość ujemna - z komentarzem ostrzegającym, że odwrócenie znaku po cichu
  przeliczyłoby WSZYSTKIE historyczne transakcje), osobna wartość ticka zysk/strata, przeliczenie
  walutowe (z twardym zakazem zgadywania kursu), częściowe zamknięcia z CELOWO sprzeczną ceną
  wyjścia (żeby złapać podwójne liczenie, gdyby silnik jednak użył ceny zamiast sumy kwot),
  dokładność dziesiętna (`0,10+0,20=0,30` skontrastowane wprost z wynikiem na `f64`), dzielenie
  przez zero przy zerowym ticku/ryzyku.
- `mod pieniadze_bez_float` - **automatyczna, trwała gwarancja całego wymogu "pieniądze nie mogą
  używać binarnego float"**: test czyta ŹRÓDŁO 5 modułów pieniężnych
  (`trade_calculations`/`trade_partial_close`/`balance`/`trade_stats`/`cash_operation`) i
  odrzuca każde wystąpienie `f64`/`f32` poza komentarzem/testem dokumentującym problem - nie
  jednorazowe sprawdzenie, tylko regresja pilnująca tego na zawsze.
- `mod wartosci_graniczne` w tym samym pliku - osobno pokrywa niemal całą listę sekcji 25 (puste
  pola/same spacje, polskie znaki, bardzo długa nazwa, ujemne/zerowe saldo, bardzo duże saldo,
  loty dziesiętne, zamknięcie przed otwarciem, duplikat nazwy, nieobsługiwana waluta, zamknięcie
  większe od lota, zerowe/ujemne częściowe zamknięcie, zamknięcie całego lota) - potwierdza,
  że część 59's odwołanie do "pokrycia z bloku D" miało realne, sprawdzalne pokrycie, a nie
  tylko domniemanie.

Uruchomione wprost: `cargo test audyt::` - **41/41 PASS** (w tym cały `obliczenia_referencyjne`,
`pieniadze_bez_float`, `wartosci_graniczne`). Ręczna weryfikacja z części 59 zostaje jako
DODATKOWE potwierdzenie (inny punkt wejścia - ogólne testy jednostkowe modułów domenowych, nie
dedykowany plik audytowy), nie jest już jedynym dowodem dla sekcji 26 - `audyt.rs` jest
właściwym, autorytatywnym źródłem. Zapisane tutaj wprost, żeby przyszła praca nie odtwarzała
ręcznie tego, co już istnieje w gotowej, lepszej formie.

Weryfikacja: bez zmian kodu - `cargo test audyt::` 41/41 PASS, `cargo test` (całość) 435/435
bez regresji.

**O7, część 61: manifest plik-po-pliku niezależnie zweryfikowany bajt w bajt, nie tylko
liczbowo.** Przy okazji poprzedniej korekty (część 60/wcześniejsze odświeżenie) tekst WYŻEJ tej
samej tabeli (sekcja grup) był już poprawiony na „98 plików", ale akapit wprowadzający SAMĄ
tabelę plik-po-pliku (`### Manifest plik-po-pliku`) wciąż mówił „70 wierszy"/„70 plików" -
pozostałość sprzed wielu odświeżeń (94→98 z części 58 nigdy nie dotarło do TEGO konkretnego
zdania, mimo że same wiersze tabeli już dawno zawierały świeże wpisy, np. `AccountsPage.tsx`
z odniesieniem do części 58). Naprawione na `98`.

Przy tej okazji wykonana NIEZALEŻNA weryfikacja, nie tylko poprawka literałki: policzone
`grep -c` na faktycznych wierszach tabeli (98) i porównane PLIK PO PLIKU (nie tylko liczbowo)
z `git diff --name-only 0c2eb41^..adb3d2a` przez `diff` dwóch posortowanych list - **wynik
pusty (zero różnic)**, potwierdzone też brak duplikatów ścieżek w samej tabeli
(`sort | uniq -d` - pusty wynik). To mocniejszy dowód niż dotychczasowe "N=N" - manifest
faktycznie zawiera dokładnie te same 98 plików, które realnie zmienił redesign, ani jednego
mniej, ani jednego więcej, ani żadnego powtórzonego.

Weryfikacja: bez zmian kodu - wyłącznie korekta dokumentacji + niezależne porównanie zbiorów
plików.

**O7, część 62: znaleziona i naprawiona realna luka - „tryb zgodny z systemem" (O1, oznaczony
✅) nie miał ŻADNEGO testu jednostkowego.** `ThemeProvider.tsx` i `PreferencesProvider.tsx` -
jedyne dwa pliki realizujące reaktywne śledzenie motywu Windows na żywo (`matchMedia`

- `addEventListener("change", ...)`) - nie miały ani jednego pliku testowego. Status „✅" w
  tabeli O1 opierał się wyłącznie na przeglądzie kodu, nie na automatycznej regresji - dokładnie
  ten wzorzec luki, który ta sesja O7 już wielokrotnie znajdowała i naprawiała gdzie indziej
  (sentinel akcentu, color-mix WCAG, pierścień fokusu), tym razem dla samego mechanizmu
  przełączania motywu.

Nowy plik `app/PreferencesProvider.test.tsx` (4 testy): rozwiązanie „system" na start zgodnie
z aktualnym dopasowaniem OS; **żywa aktualizacja `data-theme` na dokumencie w trakcie działania
aplikacji**, gdy użytkownik przełączy jasny/ciemny w Windows bez żadnej akcji w samej aplikacji
(symulowane wywołaniem zdarzenia `change` na fałszywym `MediaQueryList`, nie przez ponowne
wywołanie funkcji); brak jakiegokolwiek wpływu zmiany OS, gdy motyw jest jawnie `dark`/`light`;
odpięcie nasłuchu `change` (sekcja 27: „listenery bez cleanup") przy odmontowaniu.

Zweryfikowane testem mutacyjnym (ten sam wzorzec co wcześniej dla `--tint-badge`/pierścienia
fokusu/`default_accent`): tymczasowo zakomentowane `query.addEventListener(...)` w
`PreferencesProvider.tsx`, uruchomione testy - **dokładnie 2 z 4 testów padły** (te zależne od
żywego nasłuchu: aktualizacja na żywo i sam fakt zarejestrowania nasłuchu), pozostałe 2
(rozwiązanie startowe, brak wpływu przy motywie nie-systemowym) bez zmian - dokładnie zgodnie
z przewidywaniem. Po cofnięciu: `git diff` na pliku źródłowym czysty, 4/4 PASS ponownie.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto (w tym naprawiony
`@typescript-eslint/unbound-method` przez własne liczniki zamiast `expect(mock.metoda)`),
`pnpm exec prettier --check` czysto, `pnpm test -- --run` **293/293** (4 nowe testy, 29 plików).

**O7, część 63: ta sama klasa luki co część 62 - O2 ("BUY/SELL z jawnym tekstem obok koloru")
też nie miało ŻADNEGO testu.** `grep` po `TRADE_SIDE_LABELS` w plikach testowych - zero wyników.
Status ✅ w tabeli O2 opierał się wyłącznie na przeglądzie kodu (3 konsumenci:
`TransactionsPage`/`TradeInspector`/`DayTradesModal`, wszystkie renderują tekst wewnątrz
`Badge`), bez automatycznej regresji pilnującej, że tekst NIE zniknie przy przyszłym
refaktorze zostawiającym tylko kolor - dokładnie wymóg WCAG 1.4.1, który O2 dokumentuje.

Nowy plik `pages/DayTradesModal.test.tsx` (wybrany jako cel, bo przyjmuje `trades: Trade[]`
bezpośrednio jako prop - bez potrzeby mockowania całego backendu jak przy
`TransactionsPage`/`TradeInspector`): render z jedną transakcją BUY i jedną SELL, asercja że
tekst „BUY"/„SELL" faktycznie trafia na ekran (`screen.getByText`), nie tylko że stała
`TRADE_SIDE_LABELS` istnieje gdzieś w kodzie.

Zweryfikowane testem mutacyjnym: tymczasowo usunięte `{TRADE_SIDE_LABELS[trade.side]}` z dzieci
`Badge` (zostawiony sam kolor wariantu) - test **padł dokładnie tak, jak powinien**
(`screen.getByText("BUY")` nie znalazło elementu). Po cofnięciu: `git diff` czysty, test znów
PASS.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **294/294** (30 plików).

**O7, część 64: TRZECI przypadek tej samej klasy luki - O4 ("domyślny kolor nowej strategii
złoto→niebieski") był niezależnym literałem, nie dzielonym źródłem prawdy.** `StrategyFormModal.tsx`
miał własny magiczny literał `"#4c7dff"`, a `PreferencesProvider.tsx` osobny, nieeksportowany
`DEFAULT_ACCENT = "#4c7dff"` - komentarz w `StrategyFormModal.tsx` WPROST mówił, że mają się
zgadzać, ale nic tego nie wymuszało poza pamięcią przyszłego edytora. Dokładnie „wielokrotne
źródła prawdy" z sekcji 27 promptu - ta sama klasa błędu co z-index/font-weight/line-height/
border-radius/box-shadow znalezione wcześniej w tej sesji, tylko dotąd przeoczona dla samych
kolorów domyślnych.

Naprawione strukturalnie, nie tylko testem: `DEFAULT_ACCENT` wyeksportowany z
`PreferencesProvider.tsx`, `StrategyFormModal.tsx` zaimportował go zamiast duplikować literał -
teraz te dwa miejsca fizycznie NIE MOGĄ się rozjechać (TypeScript/moduł to wymusza, nie tylko
komentarz). Dodatkowo nowy `pages/StrategyFormModal.test.tsx`: render nowej (pustej) strategii,
asercja że wyzwalacz `ColorPicker` faktycznie pokazuje `DEFAULT_ACCENT` w `aria-label` (nie
tylko że import istnieje w kodzie).

Zweryfikowane testem mutacyjnym: tymczasowo przywrócony stary literał złota (`#c9a85a`) zamiast
`DEFAULT_ACCENT` - test **padł dokładnie tak, jak powinien**. Po cofnięciu: `git diff` na
`StrategyFormModal.tsx` pokazuje wyłącznie zamierzoną zmianę (import + użycie stałej), zero
śladu mutacji.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto (brak cyklu importów `pages/`→`app/`),
`pnpm exec eslint` czysto, `pnpm exec prettier --check` czysto, `pnpm test -- --run` **295/295**
(31 plików).

**O7, część 65: CZWARTY przypadek tej samej klasy luki - dostępność `Select`/`Textarea` (sekcja
1.1 macierzy) była potwierdzona wyłącznie `grep`-em po źródle, nie rzeczywistym renderem.**
Zapis w macierzy wprost mówił: „`aria-invalid`/`aria-describedby`/`aria-required`/`role=\"alert\"`
na komunikacie błędu: potwierdzone w `TextField.tsx`, i PRZEZ GREP - to samo w `Select.tsx`/
`Textarea.tsx`" - `TextField.test.tsx` istniał i faktycznie renderował komponent (3 testy), ale
`Select`/`Textarea` nie miały ŻADNEGO pliku testowego mimo identycznej, jawnie udokumentowanej
gwarancji dostępności.

Dodane `ui/components/Select/Select.test.tsx` i `ui/components/Textarea/Textarea.test.tsx` (6
testów łącznie) - lustrzane odbicie już sprawdzonego wzorca z `TextField.test.tsx`: powiązanie
etykiety z kontrolką (dostępna nazwa), realna interakcja użytkownika (wpisywanie/wybór opcji),
`aria-invalid="true"` + `role="alert"` z treścią komunikatu przy błędzie.

Zweryfikowane testem mutacyjnym na `Select.tsx`: tymczasowo `aria-invalid={undefined}` zamiast
`Boolean(error) || undefined` - test „marks the field invalid..." **padł dokładnie tak, jak
powinien** (pozostałe 2 testy w tym samym pliku bez zmian, zgodnie z przewidywaniem). Po
cofnięciu: `git diff` na `Select.tsx` czysty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **301/301** (33 plików, +6 nowych testów).

**O7, część 66: PIĄTY przypadek tej samej klasy luki - dostępność klawiaturowa `Tooltip.tsx`
(sekcja 21) nigdy nie miała testu.** Macierz wprost mówiła: „potwierdzone przeciw literalnemu
wymogowi PO RAZ PIERWSZY" - ale wyłącznie przeglądem kodu (`onFocus`/`onBlur` obok
`onMouseEnter`/`onMouseLeave`), nie renderem. Wymóg z promptu jest jednoznaczny: „tooltipy są
dostępne z klawiatury" - dymek NIE MOŻE pojawiać się wyłącznie na hover myszą, bo to by łamało
WCAG dla użytkowników niekorzystających z myszy.

Nowy `ui/components/Tooltip/Tooltip.test.tsx` (4 testy): dymek niewidoczny, dopóki nic nie jest
w fokusie/pod kursorem; **pokazuje się po fokusie klawiaturowym (`Tab`), nie tylko po
najechaniu myszą**; chowa się po odejściu fokusu (`Tab` dalej); `aria-describedby` na elemencie
faktycznie wskazuje na wyrenderowany dymek (nie tylko istnieje jako atrybut).

Zweryfikowane testem mutacyjnym: tymczasowo usunięte `onFocus`/`onBlur` z `Tooltip.tsx`
(zostawione tylko `onMouseEnter`/`onMouseLeave`) - **3 z 4 testów padły** (wszystkie zależne od
fokusu klawiaturowego), test „nie pokazuje treści na starcie" bez zmian, dokładnie zgodnie
z przewidywaniem. Po cofnięciu: `git diff` czysty, 4/4 PASS ponownie.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **305/305** (34 pliki, +4 nowe testy).

**O7, część 67: SZÓSTY przypadek tej samej klasy luki - `Modal.test.tsx` ISTNIAŁ, ale nie
testował akurat TEGO, co macierz twierdziła, że sprawdziła.** Sekcja 1.1 macierzy: „Escape
zamyka warstwy bezpiecznie - `onCancel` z `preventDefault()` + wywołanie `onClose()` -
kontrolowane zamknięcie zsynchronizowane ze stanem React, nie wyścig z natywnym zachowaniem
`<dialog>`". Istniejący `Modal.test.tsx` (2 testy) sprawdzał wyłącznie renderowanie treści i
kliknięcie przycisku „Zamknij" - ani jednego testu dla ścieżki Escape/`cancel`. Subtelniejszy
wariant dotychczasowej luki: nie brak pliku testowego, tylko MYLĄCE poczucie pokrycia, bo plik
istnieje i coś testuje - tylko nie akurat udokumentowane zachowanie.

Dodany trzeci test do `Modal.test.tsx`: natywny `<dialog>` wywołuje zdarzenie `cancel` przy
Escape (niesymulowane przez `userEvent` - jsdom nie odtwarza tej ścieżki klawiatura→zdarzenie
wiarygodnie), więc test wysyła zdarzenie `cancel` (`cancelable: true`) bezpośrednio na element
`<dialog>` i sprawdza to, co faktycznie testowalne i faktycznie ISTOTNE: czy handler
`onCancel` woła `event.preventDefault()` (`cancelEvent.defaultPrevented === true`) i czy
`onClose` faktycznie się wywołuje - nie czy przeglądarka umie wysłać Escape (to jej odpowiedzialność).

Zweryfikowane testem mutacyjnym: tymczasowo `onCancel` bez `preventDefault()`/`onClose()` -
nowy test **padł dokładnie tak, jak powinien** (`defaultPrevented` fałszywe), pozostałe 2 testy
w pliku bez zmian. Po cofnięciu: `git diff` na `Modal.tsx` czysty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **306/306** (34 pliki, +1 nowy test w istniejącym pliku).

**O7, część 68: SIÓDMY przypadek tej samej klasy luki - czas animacji (sekcja 21: „ok.
120-180 ms") nigdy nie miał testu.** Macierz: „Pierwsza weryfikacja wprost przeciw literalnej
liczbie z promptu... `--motion-fast: 120ms`... trafienie w widełki, nie przybliżenie" - ale to
był jednorazowy odczyt `tokens.css`, nie test pilnujący, że przyszła zmiana (np. „przyspieszmy
animacje dla lepszego UX") nie wypchnie wartości poza wymagane widełki po cichu.

Nowy plik `design/motion.test.ts` (osobny od `tokens.test.ts`, bo to inny wymiar - czas, nie
kontrast kolorów): czyta `--motion-fast/-normal/-slow` WPROST z `tokens.css` (ten sam wzorzec
co `tokens.test.ts` dla kolorów - nie kopiuje wartości do testu), sprawdza że każdy mieści się
w 120-180ms, plus że kolejność jest rosnąca (`fast < normal < slow`).

Zweryfikowane testem mutacyjnym: tymczasowo `--motion-slow: 300ms` w `tokens.css` - **dokładnie
1 z 4 testów padł** (ten dla `--motion-slow` konkretnie, pozostałe dwa tokeny i test kolejności
bez zmian). Po cofnięciu: `git diff` na `tokens.css` czysty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **310/310** (35 plików, +4 nowe testy).

**O7, część 69: `ConfirmDialog.tsx` (zastępuje `window.confirm` w 16+ miejscach, w tym przy
NIEODWRACALNYCH operacjach) nie miał ŻADNEGO testu - tu ryzyko jest bezpieczeństwem danych, nie
tylko dostępnością/formatowaniem jak w częściach 62-68.** Błąd w `Promise<boolean>` tego
komponentu (np. "Anuluj" po cichu rozwiązujący się na `true`) mógłby wywołać nieodwracalną
operację (opróżnienie kosza, trwałe usunięcie) mimo że użytkownik jawnie kliknął odmowę -
dokładnie przeciwieństwo zasady „nigdy nie niszczyć danych" tego projektu.

Nowy `ui/components/ConfirmDialog/ConfirmDialog.test.tsx` (5 testów, harness z `useConfirm()`

- `.then(onWynik)` żeby obserwować rzeczywiste rozwiązanie Promise'a, nie tylko renderowanie):
  `confirm()` rozwiązuje się na `true` po kliknięciu przycisku potwierdzenia; **rozwiązuje się na
  `false` po „Anuluj" - NIE na `true`**; rozwiązuje się na `false` przy zamknięciu przez Escape
  (`cancel` na `<dialog>`, ten sam wzorzec co część 67 - wymagał ręcznego `await Promise.resolve()`
  po `dispatchEvent`, bo surowe wywołanie zdarzenia, w odróżnieniu od `user.click()`, nie odczekuje
  samo na mikrozadanie `.then()`); własne etykiety przycisków i `danger` renderują się poprawnie;
  skrót tekstowy (`confirm("...")`) działa tak samo jak pełny obiekt opcji.

Zweryfikowane testem mutacyjnym na DOKŁADNIE tym niebezpiecznym scenariuszu z opisu wyżej:
tymczasowo przycisk „Anuluj" wołający `settle(true)` zamiast `settle(false)` - **dokładnie 2
z 5 testów padły** (oba klikające „Anuluj"/"Zostaw", pokazując `Received: [true]` zamiast
`[false]`), pozostałe 3 (potwierdzenie, Escape, sam tekst) bez zmian. Po cofnięciu: `git diff`
na `ConfirmDialog.tsx` czysty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **315/315** (36 plików, +5 nowych testów).

**O7, część 70: `useOptionalConfirm.ts` - bezpośredni konsument `ConfirmDialog` (część 69), TA
SAMA klasa ryzyka bezpieczeństwa danych, też bez ŻADNEGO testu.** Ten hak respektuje przełączniki
„Potwierdzenie przeniesienia do kosza"/„Potwierdzenie operacji nieodwracalnej" z Ustawień -
pomylony `kind` (np. `trash` sprawdzający po cichu `confirm_permanent_operation` zamiast
własnego pola, klasyczny błąd kopiuj-wklej przy dodawaniu drugiego rodzaju potwierdzenia) mógłby
albo cicho pomijać potwierdzenie, którego użytkownik NIE wyłączył, albo pokazywać je mimo
wyłączenia - w żadną stronę to nie jest tylko kosmetyczny problem.

Nowy `app/useOptionalConfirm.test.tsx` (5 testów, render `PreferencesProvider` + `ConfirmProvider`
razem - hak wymaga obu): pokazuje prawdziwe okno, gdy dany rodzaj potwierdzenia jest włączony;
pomija okno i rozwiązuje na `true`, gdy wyłączony; **i kluczowo - dwa testy krzyżowe potwierdzające
NIEZALEŻNOŚĆ obu przełączników** (wyłączenie potwierdzenia kosza nie rusza potwierdzenia operacji
nieodwracalnej, i odwrotnie) - to właśnie te dwa testy łapią błąd „sprawdzone złe pole".

Zweryfikowane testem mutacyjnym na DOKŁADNIE tym opisanym scenariuszu: tymczasowo `enabled`
zawsze czytające `confirm_permanent_operation`, ignorując `kind` - **dokładnie 2 z 5 testów
padły** (oba dwa testy krzyżowe dla `kind="trash"` z rozbieżnymi wartościami obu pól), pozostałe
3 (w tym test z obiema wartościami `true`, gdzie mutacja przypadkiem dawała ten sam wynik) bez
zmian - dokładnie zgodnie z przewidywaniem. Po cofnięciu: `git diff` na `useOptionalConfirm.ts`
czysty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **320/320** (37 plików, +5 nowych testów).

**O7, część 71: `useReportFilter.ts` (213 linii, współdzielony przez Dashboard I zakładkę
Raporty) - trzy czyste funkcje konwertujące filtr na zapytanie backendu, zero testów.** Inny
rodzaj ryzyka niż części 62-70 (tam: dostępność/bezpieczeństwo danych) - tu błąd w
`toReportFilter`/`toAccountComparisonFilter` cicho pokazywałby ZŁE dane finansowe (np. wynik za
"miesiąc 3 wszystkich lat" zamiast "bez filtra miesiąca"), które użytkownik wziąłby za prawdziwy
raport. Pełny hak (efekty, wywołania sieciowe) świadomie POZOSTAWIONY bez testu - nieproporcjonalny
koszt mockowania względem ryzyka; te trzy eksportowane, czyste funkcje są tanim, wysokowartościowym
wycinkiem.

Nowy `app/useReportFilter.test.ts` (8 testów, zero mockowania - czyste funkcje): puste opcjonalne
pola zamieniają się na `null`, nie zostają pustymi stringami; **miesiąc BEZ roku jest ignorowany**
(filtrowanie po samym miesiącu nie ma sensu - rok+miesiąc muszą iść razem); sam rok bez miesiąca
to poprawny filtr roczny; `toAccountComparisonFilter` nie ma w ogóle pola `account_id` (porównanie
dotyczy wszystkich kont); `monthYearLabel` buduje polską etykietę i zwraca pusty string, gdy
brakuje któregokolwiek z pól.

Zweryfikowane testem mutacyjnym: tymczasowo usunięty warunek roku z obu funkcji (`f.month ?
Number(f.month) : null` zamiast `f.year && f.month ? ...`) - **dokładnie 2 z 8 testów padły**
(oba dla scenariusza "miesiąc bez roku", po jednym w każdej funkcji), pozostałe 6 bez zmian. Po
cofnięciu (`git checkout` na pojedynczym pliku): `git diff` czysty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **328/328** (38 plików, +8 nowych testów).

**O7, część 72: `reportFormat.ts` (31 linii) - cztery czyste funkcje formatujące wskaźniki
raportów, używane w 7 miejscach (Dashboard, ReportMonthlyTab, ReportYearlyTab,
ReportAccountComparisonTab, ReportSymbolTab, BreakdownTable, HeatmapTable), zero testów.** Ten
sam rodzaj ryzyka co część 71 - błąd tu cicho zniekształca prezentację prawdziwych wyników
finansowych (np. pokazuje "0.00%" zamiast "—" dla brakującej wartości, albo odwrotnie).

Nowy `app/reportFormat.test.ts` (13 testów, zero mockowania): `formatNumber` zamienia `null` na
myślnik, zaokrągla do 2 miejsc domyślnie (konfigurowalne), zwraca niezmienioną wartość dla
stringa niebędącego liczbą (nie chowa go pod myślnikiem), a pusty string traktuje jako `0`, nie
jako `null`; `formatPercent`/`formatR` doklejają odpowiedni symbol; `formatMinutes` pokazuje same
minuty poniżej godziny, **pomija "0 min" przy pełnych godzinach**, a przy reszcie minut pokazuje
oba składniki.

Zweryfikowane testem mutacyjnym: tymczasowo usunięty warunek `minutes === 0` w `formatMinutes`
(zawsze renderujący oba składniki) - **dokładnie 1 z 13 testów padł** ("pełne godziny bez reszty
minut nie pokazują '0 min'"), pozostałe 12 bez zmian. Po cofnięciu: `git diff --stat` na
`reportFormat.ts` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **341/341** (39 plików, +13 nowych testów).

**O7, część 73: `datetime.ts` (27 linii) - konwersja `<input type="datetime-local">` ↔ ISO UTC
dla backendu, używana przy edycji czasu otwarcia/zamknięcia transakcji (TradeFormModal,
CloseTradeModal), zero testów.** Wyższe ryzyko niż czyste formatowanie prezentacyjne - błąd tu
cicho zapisałby transakcję z PRZESUNIĘTYM czasem (np. o offset strefy), co psuje Kalendarz,
raporty dzienne i kolejność transakcji na liście.

Nowy `app/datetime.test.ts` (10 testów, zero mockowania): `toDatetimeLocalValue` zamienia
`null`/pusty string/nieprawidłowy ISO na pusty string (bez wyjątku), dokłada zera wiodące dla
miesiąca/dnia/godziny/minuty/sekundy poniżej 10 i zachowuje dwucyfrowe wartości bez obcinania;
`fromDatetimeLocalValue` zamienia pusty string/same spacje/nieprawidłową wartość na `null`;
dodatkowy test round-trip (`toDatetimeLocalValue(fromDatetimeLocalValue(x)) === x`) potwierdza
brak przesunięcia strefy przy zapisie i odczycie tej samej lokalnej chwili. Testy budują
oczekiwane wartości przez te same API `Date`, więc działają niezależnie od strefy czasowej
maszyny uruchamiającej testy.

Zweryfikowane testem mutacyjnym: tymczasowo usunięty `.padStart(2, "0")` w `pad()` -
**dokładnie 2 z 10 testów padły** (test zer wiodących i test round-trip, oba jedyne wrażliwe na
brak paddingu), pozostałe 8 bez zmian. Po cofnięciu: `git diff --stat` na `datetime.ts` pusty.
(Osobno sprawdzone i odrzucone jako niediagnostyczna: mutacja `.trim()` na samo `!value` - test
"same spacje" nadal przechodził, bo `new Date("   ")` i tak daje `NaN` przez późniejszy warunek;
`.trim()` samo w sobie nie ma unikalnej gałęzi do złapania, więc nie wymaga osobnego dowodu.)

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **351/351** (40 plików, +10 nowych testów).

**O7, część 74: `blobToBase64.ts` (15 linii) - kodowanie załączników (wklejenie ze schowka,
upuszczenie pliku) do base64 przed wysłaniem przez IPC do Tauri, zero testów.** Błąd tu cicho
zepsułby zapisany plik (np. zostawiony prefiks `data:...;base64,` w bajtach, albo obcięty
pierwszy znak przy złym indeksie przecinka) - użytkownik zobaczyłby uszkodzony obraz dopiero przy
próbie otwarcia załącznika, długo po imporcie.

Nowy `app/blobToBase64.test.ts` (3 testy): koduje tekstowy blob do czystego base64 bez prefiksu
data URL (zdekodowane `atob` daje z powrotem oryginalny tekst); poprawnie koduje bajty binarne
(sygnatura PNG) bajt-po-bajcie, nie tylko tekst ASCII; odrzuca obietnicę z błędem, gdy odczyt się
nie powiedzie (podmieniony `FileReader` wywołujący `onerror`).

Zweryfikowane testem mutacyjnym: tymczasowo `result.slice(commaIndex)` zamiast
`result.slice(commaIndex + 1)` (zostawiony przecinek na początku) - **dokładnie 2 z 3 testów
padły** (oba testy kodowania - tekstowy i binarny), test ścieżki błędu bez zmian, zgodnie z
przewidywaniem. Po cofnięciu: `git diff --stat` na `blobToBase64.ts` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **354/354** (41 plików, +3 nowe testy).

**O7, część 75: `invokeCommand.ts` (59 linii) - JEDYNE miejsce, przez które każde wywołanie
backendu w aplikacji przechodzi, zero testów.** Wyższe ryzyko niż wszystko dotąd w tej serii -
błąd w `extractErrorMessage` albo `hasTauriRuntime` wpływa na to, co użytkownik widzi przy
KAŻDEJ awarii KAŻDEJ komendy w całej aplikacji. Dotąd niesprawdzone wprost, bo każdy inny test
podmienia cały moduł przez `vi.mock("./invokeCommand", ...)` - jego własna logika nigdy nie
została wykonana przez żaden test.

Nowy `app/invokeCommand.test.ts` (11 testów, `vi.mock("@tauri-apps/api/core", ...)` na dynamiczny
import): `extractErrorMessage` czyta `message` z payloadu błędu Rust i z instancji `Error`,
zwraca zwykły string bez zmian (Tauri czasem odrzuca gołym stringiem), **pusty string/same spacje
NIE liczą się jako czytelny komunikat**, pole `message` które nie jest stringiem NIE liczy się
jako `AppErrorPayload`, `null`/`undefined`/liczba dostają domyślny komunikat po polsku;
`hasTauriRuntime` zwraca `false`/`true` zależnie od `window.__TAURI_INTERNALS__`; `invokeCommand`
odrzuca z czytelnym komunikatem PL i celowo NIE woła `invoke()`, gdy nie ma środowiska Tauri,
zwraca wynik `invoke()` bez zmian, gdy środowisko jest obecne, i normalizuje odrzucenie `invoke()`
do zwykłego `Error` z zachowanym `cause`.

Zweryfikowane testem mutacyjnym (3 niezależne mutacje, każda cofnięta osobno): (1) usunięty
warunek typu `message` w `isAppErrorPayload` - **dokładnie 1 z 11 padł** (test "message: 42");
(2) usunięty `.trim()` z warunku string - **dokładnie 1 z 11 padł** (test pustego stringa);
(3) `if (!hasTauriRuntime())` zamienione na `if (false)` - **dokładnie 1 z 11 padł** (test braku
środowiska Tauri, `invoke` nigdy nie wywołane). Po każdym cofnięciu: `git diff --stat` na
`invokeCommand.ts` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **365/365** (42 pliki, +11 nowych testów).

**O7, część 76: `useTauriQuery.ts` (54 linie) - współdzielony hook do wywoływania komend Tauri ze
stanem loading/ready/error i `refetch`, zero testów wprost.** Jedyne dotychczasowe użycie
(`SettingsPage.test.tsx`) podmienia cały hook przez `vi.mock`, więc jego własna logika - w tym
ochrona przed wyścigiem (`cancelled`), która ma nie dopuścić, by SPÓŹNIONA odpowiedź STAREGO
zapytania nadpisała wynik nowszego po `refetch()` - nigdy nie została wykonana przez żaden test.
Bez tej ochrony np. szybkie kolejne odświeżenie ustawień mogłoby pokazać przestarzałe dane, gdyby
stare zapytanie odpowiedziało później niż nowe.

Nowy `app/useTauriQuery.test.ts` (5 testów, `renderHook` + `vi.mock("@tauri-apps/api/core", ...)`

- ręcznie sterowalne odroczone obietnice): stan startowy `"loading"`; przejście do `"ready"` z
  danymi po powodzeniu; przejście do `"error"` z czytelnym komunikatem (przez `extractErrorMessage`)
  po niepowodzeniu; `refetch()` woła komendę ponownie i podmienia wynik; **spóźniona odpowiedź
  STAREGO zapytania NIE nadpisuje wyniku nowszego** - kluczowy test ochrony przed wyścigiem, celowo
  rozwiązujący dwie obietnice w odwrotnej kolejności niż wywołania (`refetch()`, potem druga
  obietnica najpierw, pierwsza dopiero po niej).

Zweryfikowane testem mutacyjnym: tymczasowo usunięty warunek `if (!cancelled)` wokół `setState`
ścieżki sukcesu - **dokładnie 1 z 5 testów padł** (test ochrony przed wyścigiem, wynik "stare"
nadpisał "nowe" zamiast zostać odrzucony), pozostałe 4 bez zmian. Po cofnięciu: `git diff --stat`
na `useTauriQuery.ts` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **370/370** (43 pliki, +5 nowych testów).

**O7, część 77: `ThemeProvider.tsx`/`useTheme` (65 linii) - jednoklikowy przełącznik motywu w
nagłówku, zero testów.** Najbardziej nieoczywista część: `toggleTheme()` zapisuje ROZWIĄZANY
motyw, nie surową wartość z preferencji - więc przełączenie z trybu „systemowy" zawsze ląduje na
KONKRETNYM motywie (przeciwnym do aktualnie widocznego), nigdy nie zostaje w trybie systemowym.
Błąd tu (np. użycie surowej wartości zamiast rozwiązanej) mógłby po cichu utknąć w pętli "system
→ system" albo przeskoczyć na złą stronę, gdy motyw systemu Windows nie zgadza się z tym, co
użytkownik aktualnie widzi.

Nowy `app/ThemeProvider.test.tsx` (9 testów, `renderHook` + prawdziwy `<PreferencesProvider>` +
`vi.mock("./invokeCommand", ...)`): rozwiązywanie `theme` dla `"dark"`/`"light"`/`"system"` (oba
warianty `matchMedia`); `toggleTheme()` z `"dark"` zapisuje `"light"`; **z trybu `"system"`
rozwiązanego na `"light"` zapisuje KONKRETNE `"dark"`, a rozwiązanego na `"dark"` zapisuje
KONKRETNE `"light"`** (dwa niezależne testy, bo pierwsza wersja przypadkiem dawała ten sam wynik
dla obu wariantów kodu - patrz niżej); `toggleTheme()` nic nie zapisuje, gdy preferencje jeszcze
się nie wczytały; `useTheme()` poza `<ThemeProvider>` rzuca czytelny błąd po polsku.

Zweryfikowane 2 niezależnymi mutacjami: (1) `resolved === "dark"` zamienione na
`appearance?.theme === "dark"` (użycie SUROWEJ wartości zamiast rozwiązanej) - **pierwsza wersja
testu (tylko scenariusz "system→light") przeszła MIMO mutacji**, bo dla tego konkretnego wejścia
oba warunki dają ten sam wynik (żadna z wartości nie jest dosłownie `"dark"`) - dodany drugi test
("system→dark") naprawdę odróżnia te dwie wersje kodu, **złapał dokładnie 1 z 9** po dodaniu;
(2) usunięty `if (!preferences) return` - **dokładnie 1 z 9 padł** z realnym `TypeError` (`Cannot
read properties of null`), nie tylko złym wynikiem. Po każdym cofnięciu: `git diff --stat` na
`ThemeProvider.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **379/379** (44 pliki, +9 nowych testów).

**O7, część 78: `RouteErrorScreen.tsx` (26 linii) - ekran błędu tras routera, jedyne, co
użytkownik zobaczy zamiast surowego zrzutu stosu Reacta przy awarii widoku, zero testów.** React
Router potrafi przekazać do `useRouteError()` DOWOLNĄ rzuconą wartość, nie tylko instancję
`Error` - błąd w gałęzi `String(error)` pokazałby nieczytelne "[object Object]" zamiast
prawdziwego komunikatu. Ani ten komponent, ani jego podpięcie w `router.tsx` nie miały testu
(pokrewny `ErrorBoundary.test.tsx` sprawdza tylko wspólny wygląd ekranu odzyskiwania, nie tę
konkretną gałąź konwersji błędu ani przycisk przeładowania).

Nowy `app/RouteErrorScreen.test.tsx` (3 testy, `vi.mock("react-router", ...)` na
`useRouteError`): pokazuje `message` z instancji `Error`; **rzuconą wartość NIEBĘDĄCĄ instancją
Error konwertuje przez `String()`** (zwykły string, nie `"[object Object]"`); klik "Uruchom
ponownie" woła `window.location.reload()` dokładnie raz.

Zweryfikowane testem mutacyjnym: tymczasowo `error instanceof Error ? error.message :
String(error)` zastąpione samym `String(error)` - **dokładnie 1 z 3 testów padł** (test instancji
Error pokazał "Error: ..." zamiast czystego `message`), pozostałe 2 bez zmian. Po cofnięciu:
`git diff --stat` na `RouteErrorScreen.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **382/382** (45 plików, +3 nowe testy).

**O7, część 79: `useAccountReport.ts` (78 linii) - wspólny przepływ "wybierz konto → pobierz
raport" pod Kalendarzem (docelowo też Dashboard/Raporty wg komentarza w źródle), zero testów.**
Najbardziej nieoczywista część: `loadAccounts()` po ponownym wczytaniu NIE resetuje wyboru
użytkownika do pierwszego konta na liście - `current || (data[0]?.id ?? "")` zachowuje już
wybrane konto. Błąd tu (np. zawsze branie `data[0]`) cofnąłby użytkownika na inne konto po każdym
odświeżeniu listy - klasyczna, irytująca regresja UX, łatwa do przeoczenia przy code review.

Nowy `app/useAccountReport.test.ts` (7 testów, `renderHook` + `vi.mock("./invokeCommand", ...)`):
start automatycznie zaznacza PIERWSZE konto, gdy nic nie było wybrane; wybór konta pobiera jego
raport przez `get_account_report`; **`reloadAccounts()` NIE cofa już wybranego konta na
pierwsze z listy**; błąd `list_accounts` ustawia `accountsError` i NIE rusza `reportError` (i na
odwrót dla błędu `get_account_report` - dwa niezależne testy); błąd, który nie jest instancją
`Error`, dostaje domyślny komunikat po polsku; ustawienie pustego `selectedAccountId` czyści
`report` BEZ wywołania komendy.

Zweryfikowane 2 niezależnymi mutacjami: (1) `setSelectedAccountId((current) => current ||
data[0]?.id ?? "")` zamienione na zawsze-`data[0]?.id` - **dokładnie 1 z 7 padł** (test
zachowania wyboru po `reloadAccounts()`); (2) usunięta gałąź `else { setReport(null) }` -
**dokładnie 1 z 7 padł** (test czyszczenia raportu przy pustym wyborze, przez timeout
`waitFor` - report nigdy się nie wyczyścił). Po każdym cofnięciu: `git diff --stat` na
`useAccountReport.ts` pusty. (Przy okazji poprawiony błędny import `act` z `"react"` zamiast
`"@testing-library/react"` w nowym pliku testowym - pierwsza wersja działała, ale React ostrzegał
"testing environment is not configured to support act(...)".)

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **389/389** (46 plików, +7 nowych testów).

**O7, część 80: `useAttachments.ts` (87 linii) - zarządzanie załącznikami transakcji (Faza 6),
zero testów - ostatni nieprzetestowany plik w `app/`.** Dwie ryzykowne, nieoczywiste części: (1)
obrazy pobierane są WYŁĄCZNIE dla załączników typu `"screenshot"` - błędne wywołanie
`read_attachment_image` dla `"link"` byłoby marnowaniem zapytań albo błędem; (2) `runThenReload`
przy niepowodzeniu akcji PONOWNIE RZUCA błąd (nie tylko ustawia `error`) - wywołujący (formularz
dodawania załącznika w `TradeAttachments`) polega na tym, żeby np. nie zamykać okna po nieudanej
operacji. Zamiana rethrow na ciche połknięcie błędu byłaby niewidoczna w code review - kod nadal
"obsługuje błąd", tylko niepoprawnie dla wywołującego.

Nowy `app/useAttachments.test.ts` (5 testów, `vi.mock("./invokeCommand", ...)`): puste `tradeId`
nic nie ładuje (tryb nowej, niezapisanej transakcji z komentarza w źródle); ładuje listę i obrazy
WYŁĄCZNIE dla `"screenshot"`, nie dla `"link"`; `addLink()` woła komendę z poprawnymi argumentami
i odświeża listę po powodzeniu; **nieudana akcja ustawia `error` i PONOWNIE RZUCA** - obietnica
zwrócona wywołującemu faktycznie się odrzuca, nie tylko stan wewnętrzny się zmienia; `reload()`
ponownie ładuje listę dla aktualnego `tradeId`.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięty `throw e` z `catch` w `runThenReload` -
**dokładnie 1 z 5 padł** (obietnica zwrócona z `addLink()` rozwiązała się zamiast odrzucić); (2)
usunięty `.filter((a) => a.kind === "screenshot")` przed pobieraniem obrazów - **dokładnie 1 z 5
padł** (obraz pobrany też dla załącznika typu `"link"`). Po każdym cofnięciu: `git diff --stat`
na `useAttachments.ts` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **394/394** (47 plików, +5 nowych testów).

**O7, część 81: `resolvePageTitle` w `Header.tsx` (prywatna funkcja) - decyduje, jaki tytuł widzi
użytkownik w górnym pasku dla każdej ścieżki, zero testów.** Nieoczywista część: dopasowanie „/"
jest DOKŁADNE (`pathname === "/"`), nie `startsWith` - inaczej pasowałoby do KAŻDEJ ścieżki (bo
każda zaczyna się od „/") i Dashboard zawsze wygrywałby jako pierwszy w `NAV_GROUPS`, ukrywając
tytuły wszystkich innych ekranów. Funkcja jest prywatna (nieeksportowana), więc test renderuje
`<Header>` na różnych ścieżkach przez `MemoryRouter` zamiast eksportować ją tylko na potrzeby
testu.

Nowy `shell/Header.test.tsx` (5 testów, `MemoryRouter` + prawdziwe `PreferencesProvider`/
`ThemeProvider` + `vi.mock` na `invokeCommand`): `"/"` pokazuje "Dashboard" i NIE dopasowuje się
do niczego innego; znana ścieżka (`/kalendarz`) pokazuje etykietę odpowiadającej pozycji
nawigacji; **podstrona pod znanym widokiem (`/transakcje/123`) nadal pokazuje etykietę tego
widoku** (dopasowanie przez prefiks); nieznana ścieżka dostaje jawny tytuł zastępczy "Dziennik
Tradera", nie pusty nagłówek; klik na przełącznik motywu działa bez wystawienia dostawcy
aktualizacji (opcjonalny hook).

Zweryfikowane testem mutacyjnym: tymczasowo `item.to === "/" ? pathname === "/" :
pathname.startsWith(item.to)` zastąpione samym `pathname.startsWith(item.to)` - **dokładnie 3 z 5
testów padły** (wszystkie trzy ścieżki inne niż `"/"` błędnie pokazały "Dashboard", bo każda
ścieżka zaczyna się od `"/"`), pozostałe 2 (dopasowanie `"/"` i klik motywu) bez zmian. Po
cofnięciu: `git diff --stat` na `Header.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **399/399** (48 plików, +5 nowych testów).

**O7, część 82: `Sidebar.tsx` (66 linii) - łączy DWA niezależne wejścia (`collapsed`,
`showLabels`) w jedno `labelsVisible`, zero testów.** Gdy etykiety są ukryte, pozycje nawigacji
muszą i tak zostać identyfikowalne dla czytników ekranu (WCAG 1.4.1) - przez `title` na linku i
`<span class="sr-only">` zamiast usunięcia tekstu. Błąd tu (np. usunięcie tekstu zamiast ukrycia
go wizualnie) zamieniłby zwiniętą nawigację w zestaw nieopisanych ikon.

Nowy `shell/Sidebar.test.tsx` (6 testów, `MemoryRouter`): rozwinięty + `showLabels=true`
(domyślnie) → etykieta widoczna (klasa `styles.navLabel`), bez `title`; **zwinięty, NAWET z
`showLabels=true`** → etykieta ukryta wizualnie (klasa `"sr-only"`), ale nadal dostępna przez
`title`; rozwinięty, ale `showLabels=false` → to samo ukrycie; przycisk zwijania zmienia etykietę
"Zwiń"/"Rozwiń nawigację" i woła `onToggleCollapsed`; na `/kalendarz` pozycja "Dashboard" NIE
dostaje `aria-current="page"`, "Kalendarz" dostaje.

Zweryfikowane testem mutacyjnym: `labelsVisible = !collapsed && showLabels` zastąpione samym
`showLabels` - **dokładnie 1 z 6 testów padł** (scenariusz `collapsed=true, showLabels=true`,
jedyny gdzie oba warunki się rozjeżdżają), pozostałe 5 bez zmian. Po cofnięciu: `git diff
--stat` na `Sidebar.tsx` pusty. (Osobno sprawdzone i odrzucone jako niediagnostyczne: mutacja
`end={item.to === "/"}` → `end={false}` na linku startowym - **0 z 6 testów padło**, bo
`NavLink` z `react-router` już samodzielnie chroni ścieżkę `"/"` przed fałszywym dopasowaniem
niezależnie od `end`, patrz `isActive` w `lib/dom/lib.js` - `charAt(endSlashPosition) === "/"`
nigdy nie jest prawdą dla realnych ścieżek zaczynających się od `"/"` inaczej niż samym `"/"`.
Test aktywnej pozycji nawigacji zostaje w pliku jako regresja zachowania, ale bez przypisywania
mu przyczynowości do tej konkretnej linii kodu.)

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **405/405** (49 plików, +6 nowych testów).

**O7, część 83: `AppShell.tsx` (120 linii, najbardziej złożony komponent powłoki) - PRAWDZIWY
BŁĄD znaleziony przez pisanie testów, nie tylko brak pokrycia.** Preferencja „Otwieraj ostatnio
używaną zakładkę" (Ustawienia → Zachowanie) NIGDY faktycznie nie działała od świeżego startu
aplikacji: efekt zapisujący `location.pathname` do `localStorage` (`LAST_ROUTE_STORAGE_KEY`)
uruchamiał się na KAŻDYM montowaniu z AKTUALNĄ (jeszcze nie przekierowaną) ścieżką `"/"` -
zanim asynchronicznie wczytane preferencje zdążyły dotrzeć do efektu decydującego o
przekierowaniu. Ponieważ efekty w komponencie uruchamiają się w kolejności deklaracji, a
zapisujący efekt nie miał żadnej straży, nadpisywał zapamiętaną z POPRZEDNIEJ sesji ścieżkę
wartością `"/"` GODZINĘ przed tym, jak efekt przekierowania zdążył ją odczytać - użytkownik
zawsze lądował na Dashboardzie, niezależnie od włączonego przełącznika.

Naprawa: zapisujący efekt dostał tę samą straż `startupApplied` (już istniejące, wcześniej
używane wyłącznie do stanu zwinięcia menu), która staje się `true` SYNCHRONICZNIE podczas
renderowania w tym samym przebiegu, w którym uruchamia się efekt odczytujący `localStorage` -
dzięki kolejności deklaracji efektów (odczyt przed zapisem) i temu, że `startupApplied` zmienia
się dokładnie w commit'cie, w którym oba efekty i tak muszą się przeliczyć, zapis czeka aż odczyt
zdąży się wykonać. Zero nowego stanu, jedna dodana straż.

Nowy `shell/AppShell.test.tsx` (8 testów, `MemoryRouter` + `Routes` + prawdziwe
`PreferencesProvider`/`ThemeProvider` + zmockowane `useNavigate`/`useOptionalUpdateMonitor`/
`invokeCommand`) pokrywa TRZY niezależne mechanizmy startowe: (1) stan zwinięcia menu nakłada
się z preferencji TYLKO RAZ - kolejny zapis ustawień (przez pomocniczy komponent testowy
wołający `saveSection`) go nie nadpisuje; (2) przekierowanie na widok startowy - działa
wyłącznie na `"/"` (nie na głębokim linku), **`open_last_tab` ma pierwszeństwo przed
`startup_view`** (dokładnie ten mechanizm, który był zepsuty), z fallbackiem gdy `localStorage`
puste; (3) zapamiętywanie ostatniej ścieżki faktycznie trafia do `localStorage`; (4) nawigacja po
kliknięciu powiadomienia systemowego reaguje na ZMIANĘ licznika `zadanieOtwarciaUstawien`, nie na
sam fakt przerysowania (rozróżnione od zmiany referencji obiektu przez dodatkowy krok z NOWYM
obiektem o TEJ SAMEJ wartości).

Zweryfikowane 3 niezależnymi mutacjami: (1) usunięta straż `startupApplied` z efektu
zapisującego ostatnią ścieżkę (przywrócenie oryginalnego błędu) - **dokładnie te same 2 z 8
testów padły**, które prowadziły do odkrycia błędu; (2) usunięta straż `!startupApplied` wokół
`setCollapsed` (wywoływanie go na KAŻDYM renderze zamiast raz) - React ubił WSZYSTKIE 8 testów
wyjątkiem `"Too many re-renders"` (nieskończona pętla) - silniejszy, bardziej jednoznaczny dowód
niż zwykłe niepowodzenie asercji; (3) `!==` zamienione na zawsze-prawdziwy warunek w straży
licznika `zadanieOtwarciaUstawien` - **dokładnie 1 z 8 padł**, ale dopiero po wzmocnieniu testu o
scenariusz "nowy obiekt monitora, ta sama wartość licznika" (pierwsza wersja testu przypadkiem
zmieniała referencję i wartość RAZEM, więc nie odróżniała porównania po wartości od porównania po
referencji). Po każdym cofnięciu: `git diff --stat` na `AppShell.tsx` ograniczony wyłącznie do
zamierzonej poprawki (+7/-1).

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **413/413** (50 plików, +8 nowych testów).

**O7, część 84: `chartAxis.ts` (19 linii) - `estimateYAxisWidth`, szacuje szerokość osi Y
wykresów (EquityCurveChart, GroupBarChart, CumulativeLineChart), zero testów.** Recharts sam nie
mierzy szerokości osi Y (stała 60px niezależnie od treści) - błąd tu cicho obcina duże kwoty poza
lewy kraniec SVG (np. "000 000,00" zamiast całej liczby, bo tekst rośnie w lewo od punktu
zakotwiczenia). Rozpoczynanie serii "część 84+" nowym obszarem (`pages/`) po zamknięciu całego
`app/` (72-81) i `shell/` (82-83).

Nowy `pages/chartAxis.test.ts` (4 testy): pusta tablica wartości daje domyślne minimum 60;
**bierze NAJDŁUŻSZĄ sformatowaną etykietę, nie pierwszą ani ostatnią**; nigdy nie schodzi poniżej
minimum 60 nawet przy bardzo krótkich etykietach; rośnie liniowo zgodnie ze wzorem
`(długość + 2) * 7 + 16`.

Zweryfikowane testem mutacyjnym: `Math.max(...values.map(...))` zastąpione samym
`formatValue(values[0]).length` (bierze tylko PIERWSZĄ wartość) - **dokładnie 1 z 4 testów
padł** (test z celowo nie-monotoniczną kolejnością `[1, 1_000_000, 10]`, gdzie najdłuższa
etykieta jest w ŚRODKU tablicy), pozostałe 3 bez zmian. Po cofnięciu: `git diff --stat` na
`chartAxis.ts` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **417/417** (51 plików, +4 nowe testy).

**O7, część 85: `MonthCalendarTable.tsx` (83 linie, sekcja "Kalendarz miesiąca" w Raportach) -
skumulowany P&L liczony DOKŁADNIE przez `sumDecimalStrings` (arytmetyka na napisach), nie
`Number(...)`, zero testów.** Komentarz w źródle mówi wprost, że wcześniej `Number(...)` przez 30
dni miesiąca odchylało ostatni wiersz od wyniku o grosze - to dokładnie ten sam błąd, którego
regresji ten test pilnuje. Druga ryzykowna część: kolumna "Skum. P&L" ma kolor ze ZNAKU
SKUMULOWANEJ wartości (`decimalSign(cumulative)`), a kolumna "P&L netto" - ze znaku SAMEGO DNIA
(`Number(day.net_pnl)`) - dwie niezależne kolumny, łatwo pomylić przy kopiowaniu kodu.

Nowy `pages/MonthCalendarTable.test.tsx` (3 testy): **sumuje kolejne wiersze DOKŁADNIE, bez
błędu zmiennoprzecinkowego** (`0.1 + 0.2 + 0.1` daje `0,40`, nie `0,39999...` ani `0,40000...4`);
kolumna dnia i kolumna skumulowana mają NIEZALEŻNE kolory - dzień zyskowny (+50) w miesiącu wciąż
ujemnym (-150 po tym dniu) pokazuje zielony dla swojej kolumny i czerwony dla skumulowanej,
w TYM SAMYM wierszu; data i dzień tygodnia renderują się po polsku dla znanej daty.

Zweryfikowane 2 niezależnymi mutacjami: (1) kolor kolumny skumulowanej zamieniony z
`decimalSign(cumulative)` na `Number(day.net_pnl)` (użycie znaku DNIA zamiast SKUMULOWANEJ
wartości) - **dokładnie 1 z 3 testów padł** (test niezależnych kolorów); (2) `days.slice(0,
index + 1)` zamienione na `days.slice(0, index)` (pominięcie bieżącego dnia w sumie narastającej)

- **dokładnie 2 z 3 testów padły** (suma i kolory - oba zależne od poprawnej wartości
  skumulowanej), test formatowania daty bez zmian. Po każdym cofnięciu: `git diff --stat` na
  `MonthCalendarTable.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **420/420** (52 pliki, +3 nowe testy).

**O7, część 86: `SessionField.tsx` (64 linie, pole "Sesja" w formularzu transakcji) - wykrywanie
trybu własnej sesji, zero testów.** Najbardziej ryzykowna część: wartość SPOZA listy gotowych
sesji (np. sesja wpisana ręcznie w transakcji sprzed tej zmiany, kiedy pole było zwykłym tekstem)
musi OD RAZU włączyć tryb "własna sesja" przy otwarciu do edycji - inaczej formularz cicho
pokazywałby "Brak" zamiast zachowanej wartości, a zapis nadpisałby ją pustym stringiem, tracąc
dane wpisane wcześniej przez użytkownika.

Nowy `pages/SessionField.test.tsx` (6 testów, kontrolowany wrapper z lokalnym stanem): pusta
wartość początkowa i wartość Z LISTY gotowych NIE włączają trybu własnej sesji; **wartość SPOZA
listy OD RAZU włącza tryb własnej sesji** (pole tekstowe widoczne z zachowaną wartością);
wybranie "Własna..." czyści wartość i pokazuje pole tekstowe; wybranie gotowej wartości z trybu
własnej wyłącza go; wpisywanie w polu własnej sesji zapisuje wpisaną wartość.

Zweryfikowane testem mutacyjnym: warunek startowy `value.trim() !== "" &&
!PRESET_SESSIONS.includes(value)` zastąpiony stałym `false` - **dokładnie 3 z 6 testów padły**
(wszystkie trzy zależne od poprawnego wykrycia trybu własnej sesji przy starcie), pozostałe 3
(dotyczące wartości pustej/z listy, gdzie oczekiwany wynik to i tak `false`) bez zmian. Po
cofnięciu: `git diff --stat` na `SessionField.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **426/426** (53 pliki, +6 nowych testów).

**O7, część 87: `pnlOpacity` w `HeatmapTable.tsx` (prywatna funkcja, heatmapa na Dashboardzie) -
skala nieprzezroczystości komórki "Wynik netto", zero testów.** Górna granica 0,55 (nie 0,70 jak
wcześniej) to ZNALEZISKO AUDYTU WCAG AA z tej samej serii O7 - kontrast tekstu na tle zmieszanym
z kolorem zysku/straty schodzi poniżej 4,5:1 powyżej ~0,59. `design/tokens.test.ts` weryfikuje
kontrast PRZY ZAŁOŻENIU, że 0,55 to faktyczny sufit, ale nic nie sprawdzało, czy `pnlOpacity`
SAMA w sobie rzeczywiście nigdy go nie przekracza - zmiana mnożnika `0.4` na coś większego cicho
złamałaby to założenie, w ogóle nie dotykając `tokens.test.ts`.

Nowy `pages/HeatmapTable.test.tsx` (4 testy, odczyt `--cell-opacity` z inline stylu
zrenderowanej komórki): **wiersz o NAJWIĘKSZEJ wartości bezwzględnej osiąga dokładnie sufit
0,55**; wiersz o mniejszej wartości dostaje proporcjonalnie mniejszą nieprzezroczystość (wzór
zweryfikowany liczbowo); same zera dają minimalną nieprzezroczystość 0,15, nie zero (dzielnik
`maxAbs` nigdy nie schodzi poniżej 1 dzięki `Math.max(1, ...)` na poziomie komponentu); kolor
komórki (profit/loss) zależy od znaku, niezależnie od nieprzezroczystości.

Zweryfikowane 2 niezależnymi mutacjami: (1) mnożnik `0.4` zamieniony na `0.55` (sufit
podniesiony do `0.15 + 0.55 = 0.70` - dokładnie ta wartość, którą audyt WCAG odrzucił) -
**dokładnie 2 z 4 testów padły** (sufit i skalowanie proporcjonalne, oba zależne od dokładnej
wartości mnożnika), pozostałe 2 (zero i kolor) bez zmian; (2) `tone = value >= 0 ? "loss" :
"profit"` (odwrócony znak) - **dokładnie 1 z 4 padł** (test koloru). Po każdym cofnięciu: `git
diff --stat` na `HeatmapTable.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **430/430** (54 pliki, +4 nowe testy).

**O7, część 88: `BreakdownTable.tsx` (69 linii) - WSPÓLNY komponent dla wszystkich podraportów
zakładki Raporty (miesiąc/rok/instrument/strategia), drill-down po kliknięciu wiersza, zero
testów.** Wiersz klikalny musi działać też z klawiatury (wzorzec WAI-ARIA "row jako przycisk":
`role="button"`, `tabIndex`, obsługa Enter/Spacji z `preventDefault`) - błąd tu (np. brakująca
obsługa Spacji) byłby niewidoczny dla użytkownika myszy, ale całkowicie blokowałby drill-down dla
użytkownika klawiatury, i nie zostałby złapany żadnym wizualnym audytem.

Nowy `pages/BreakdownTable.test.tsx` (7 testów): puste `rows` pokazuje komunikat "Brak danych.",
nie pustą tabelę; BEZ `onRowClick` wiersze NIE dostają `role="button"` ani `tabindex`; Z
`onRowClick` wiersz dostaje `role="button"`, `tabIndex=0` i opisową `aria-label` ("Pokaż
szczegóły: X"); klik, **Enter i Spacja** na sfokusowanym wierszu wywołują `onRowClick` z kluczem
wiersza; inny klawisz (np. "a") NIE wywołuje niczego.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięty warunek `event.key === " "` z obsługi
klawiatury (tylko Enter aktywuje) - **dokładnie 1 z 7 testów padł** (test Spacji); (2)
`tabIndex`/`role` ustawione bezwarunkowo zamiast zależnie od `onRowClick` (wiersze zawsze
"klikalne" nawet bez handlera) - **dokładnie 1 z 7 padł** (test "wiersz nie ma role='button' bez
onRowClick"). Po każdym cofnięciu: `git diff --stat` na `BreakdownTable.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **437/437** (55 plików, +7 nowych testów).

**O7, część 89: `TradeBalanceCard.tsx` (57 linii, sekcja "Saldo przed/po/aktualne" w formularzu
transakcji) - DWA NIEZALEŻNE źródła "aktualnego salda" zależnie od trybu, zero testów.** Dla
nowej transakcji pokazuje ŻYWY prop `currentBalance`; dla edytowanej - ZAMROŻONĄ migawkę
`context.current_balance` sprzed rozpoczęcia edycji (komentarz w źródle: "nie przelicza się na
żywo przy zmianie pól w formularzu"). Pomylenie tych dwóch źródeł byłoby niewidoczne przy
pobieżnym teście (oba nazywają się "saldo", oba się renderują) - trzeba świadomie ustawić je na
RÓŻNE wartości w teście, żeby regresja była w ogóle wykrywalna.

Nowy `pages/TradeBalanceCard.test.tsx` (3 testy): nowa transakcja (`!isEdit`) pokazuje TYLKO
żywe saldo z propa `currentBalance`, bez wierszy przed/po; edycja bez wczytanego kontekstu
pokazuje stan ładowania, nie żadne saldo; **edycja z kontekstem: "Aktualne saldo konta" pochodzi
z ZAMROŻONEJ migawki `context.current_balance`, NIE z żywego propa `currentBalance`** - test
celowo ustawia oba źródła na skrajnie różne wartości (2000 vs 999999,99), żeby regresja była
jednoznacznie wykrywalna, nie przypadkowo zgodna.

Zweryfikowane 2 niezależnymi mutacjami: (1) źródło "Aktualne saldo konta" w gałęzi edycji
zamienione z `context.current_balance` na żywy `currentBalance` - **dokładnie 1 z 3 testów
padł** (test migawki, migawka zniknęła z DOM); (2) usunięty guard `if (!context)` (stan
ładowania) - **dokładnie 1 z 3 padł**, z realnym `TypeError: Cannot read properties of null`
(próba odczytu `context.current_balance` na `null`), nie tylko złym wynikiem. Po każdym
cofnięciu: `git diff --stat` na `TradeBalanceCard.tsx` pusty. (Przy okazji: `Intl.NumberFormat`
w tym środowisku grupuje tysiące spacją niełamiącą U+00A0 tylko od 6 cyfr wzwyż - test dobrany
tak, żeby nie zależeć od tego szczegółu.)

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **440/440** (56 plików, +3 nowe testy).

**O7, część 90: `TradePreviewCard.tsx` (83 linie, podgląd na żywo silnika przeliczeń w
formularzu transakcji) - każde z siedmiu pól NIEZALEŻNIE opcjonalne, zero testów.** Dwie
najbardziej ryzykowne części: (1) "Ryzyko (SL)" ma ZŁOŻONE formatowanie - dokleja "(X%)" tylko
gdy `risk_percent` JEST dostępny, inaczej zostawia samą kwotę bez pustego nawiasu (np. "100,00
USD" zamiast błędnego "100,00 USD (—%)"); (2) "Wynik netto" dostaje kolor (profit/loss) TYLKO
gdy `net_pnl` nie jest `null` - przy `null` kolor nie może "przeciekać" (np. przez `Number(null)

> = 0`dający fałszywe`true`).

Nowy `pages/TradePreviewCard.test.tsx` (9 testów): brak kalkulacji pokazuje podpowiedź, nie
kartę; wszystkie pola `null` → każdy wiersz "—"; **"Ryzyko (SL)": kwota bez procentu pokazuje
samą kwotę bez pustych nawiasów, kwota z procentem dokleja "(X%)", brak kwoty daje "—"
niezależnie od procentu**; **"Wynik netto": dodatni/ujemny `net_pnl` dostaje profit/loss, `null`
NIE dostaje żadnego z dwóch kolorów**; pozostałe pola (R, Punkty) formatują się poprawnie.

Przy okazji odkryto i zgłoszono (bez samodzielnej naprawy - pytanie UX, nie oczywisty bug):
`formatDecimalNumber` w tym pliku (i `formatNumber`/`formatPercent`/`formatR` w
`reportFormat.ts`, już przetestowane w części 72) używają kropki dziesiętnej (`toFixed`), podczas
gdy `formatMoney`/`formatSignedMoney` używają polskiego przecinka (`Intl.NumberFormat("pl-PL")`)

- rozjazd konsekwentny w całej aplikacji, ale niejasne czy zamierzony. Zgłoszone jako osobne
  zadanie do decyzji użytkownika (`task_c4f9ee38`), testy w tej części dobrane zgodnie z
  FAKTYCZNYM, obecnym zachowaniem (kropka), nie z założeniem, jak "powinno" być.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięty warunkowy dodatek "(X%)" (dokleja go
zawsze, nawet przy `risk_percent === null`) - **dokładnie 1 z 9 testów padł**, pokazując
faktyczny błąd "100,00 USD (—%)"; (2) usunięty warunkowy spread `tone` (ustawiony zawsze,
`Number(null) >= 0` dający fałszywe "profit") - **dokładnie 1 z 9 padł**. Po każdym cofnięciu:
`git diff --stat` na `TradePreviewCard.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **449/449** (57 plików, +9 nowych testów).

**O7, część 91: `RuleListEditor.tsx` (139 linii) - WSPÓLNY edytor zasad wejścia i zarządzania
pozycją strategii (dodawanie/reorder/usuwanie), zero testów.** Klasyczna klasa błędu: `sort_order`
musi zostać PRZELICZONY na nowo (sekwencyjnie od 0) po KAŻDEJ zmianie kolejności albo usunięciu -
inaczej po usunięciu środkowego elementu zostaje DZIURA w numeracji (np. 0,2,3 zamiast 0,1,2), co
cicho psuje sortowanie zapisane w bazie przy następnym wczytaniu.

Nowy `pages/RuleListEditor.test.tsx` (9 testów, kontrolowany wrapper z lokalnym stanem + spy na
`onChange`): pusta lista pokazuje komunikat zachęty; **nowa zasada dostaje `sort_order` RÓWNY
DŁUGOŚCI listy, nadpisując to, co dał `makeBlankRule`**; **usunięcie ŚRODKOWEJ zasady
przenumerowuje pozostałe sekwencyjnie (0,1), bez dziury**; przesunięcie środkowej zasady w górę
zamienia kolejność I przelicza `sort_order`; strzałki "w górę"/"w dół" są wyłączone na
granicach listy (pierwsza/ostatnia pozycja); edycja nazwy jednej zasady nie dotyka pozostałych;
przełącznik "Wymagana" pokazuje/ukrywa się zgodnie z `showRequiredToggle`.

Zweryfikowane 3 niezależnymi mutacjami: (1) usunięte przeliczenie `sort_order` po usunięciu
(`.map((rule, i) => ({...rule, sort_order: i}))`) - **dokładnie 1 z 9 testów padł**, pokazując
dokładnie przewidzianą dziurę `[0, 2]` zamiast `[0, 1]`; (2) usunięte nadpisanie `sort_order:
rules.length` przy dodawaniu (zostaje to, co dał `makeBlankRule`) - **dokładnie 1 z 9 padł**,
pokazując przeciek zaślepki `999`; (3) `disabled={index === 0}` zastąpione stałym `false` -
**dokładnie 1 z 9 padł** (przycisk "w górę" na pierwszej pozycji przestał być wyłączony). Po
każdym cofnięciu: `git diff --stat` na `RuleListEditor.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **458/458** (58 plików, +9 nowych testów).

**O7, część 92: `StrategyChecklistEditor.tsx` (155 linii) - blokuje finalny zapis, dopóki każda
WYMAGANA i NIESPEŁNIONA zasada nie dostanie powodu (sekcja 6.6 specyfikacji), zero testów.**
Jedyne miejsce w formularzu transakcji z realnym, zamierzonym efektem walidacyjnym po stronie
DANYCH, nie tylko UI. Najbardziej ryzykowna część: zmiana statusu NA COKOLWIEK innego niż
"niespełniona" musi WYCZYŚCIĆ powód - inaczej stary powód przypięty do już-spełnionej zasady
zapisałby się do historycznej migawki transakcji jako martwe, mylące dane.

Nowy `pages/StrategyChecklistEditor.test.tsx` (9 testów): pusta checklista (obie listy) nie
renderuje nic; pole powodu widoczne WYŁĄCZNIE dla wymaganej+niespełnionej zasady (nie dla
wymaganej+spełnionej, nie dla NIEwymaganej+niespełnionej - opcjonalna zasada nigdy nie blokuje
zapisu); **zmiana statusu z "niespełniona" na "spełniona" czyści `reason` w przekazanym
`onChange`**; błąd pola powodu pokazuje się WYŁĄCZNIE gdy `showReasonErrors=true` I powód jest
pusty (nie wcześniej, nie gdy wypełniony); zmiana statusu w grupie "wejścia" nie dotyka grupy
"zarządzania".

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięte czyszczenie `reason` w `withStatus` -
**dokładnie 1 z 9 testów padł**, pokazując dokładnie przewidziany wyciek starego powodu ("Za
duża zmienność" zamiast `null`) do zapisanej migawki; (2) usunięty warunek `showReasonErrors` z
bramki błędu (błąd pokazuje się zawsze przy pustym powodzie) - **dokładnie 1 z 9 padł**, błąd
pojawiłby się od pierwszej chwili, zanim użytkownik w ogóle spróbował zapisać. Po każdym
cofnięciu: `git diff --stat` na `StrategyChecklistEditor.tsx` pusty. (Przy okazji poprawiony
błąd w samym teście: `getByLabelText("Powód niespełnienia")` z dokładnym stringiem nigdy by nie
trafił, bo etykieta ma doklejoną gwiazdkę wymagalności bez spacji - zmienione na dopasowanie
przez wyrażenie regularne we wszystkich trzech miejscach, żeby negatywne asercje faktycznie coś
sprawdzały, a nie przechodziły przypadkiem.)

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **467/467** (59 plików, +9 nowych testów).

**O7, część 93: `EmotionsEditor.tsx` (170 linii, sekcja 6.8 - emocje transakcji) - dodawanie z
wyszukiwarką, skala natężenia 1-5, zero testów.** Najbardziej nieoczywista część: kliknięcie TEJ
SAMEJ wartości na skali JĄ ZDEJMUJE (wraca do "nie wybrano"), nie tylko ją ustawia - klasyczny
toggle, łatwo przeoczyć przy refaktorze i zamienić w zwykłe przypisanie bez sprawdzenia
poprzedniej wartości.

Nowy `pages/EmotionsEditor.test.tsx` (12 testów, kontrolowany wrapper): pusta lista pokazuje
różny tekst zależnie od `disabled` ("Nie dodano" / "Nie zapisano"); **pierwsze kliknięcie ustawia
natężenie, DRUGIE kliknięcie TEJ SAMEJ wartości je zdejmuje, kliknięcie INNEJ wartości zmienia
wprost bez zdejmowania poprzedniej**; ukryta emocja i już dodana emocja (bez duplikatów) nie
pojawiają się na liście podpowiedzi; wyszukiwanie filtruje bez rozróżniania wielkości liter; klik
na podpowiedź dodaje emocję z natężeniem `null` i chowa listę; usunięcie jednej emocji zostawia
pozostałe; wpis wskazujący na nieistniejący (usunięty z definicji) stan pokazuje "(usunięta
emocja)"; tryb `disabled` ukrywa wyszukiwarkę i przycisk usuwania, wyłącza przyciski skali.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięty warunek toggle w `setIntensity`
(`e.intensity === intensity ? null : intensity` zastąpione samym `intensity`) - **dokładnie 1 z
12 testów padł** (test drugiego kliknięcia tej samej wartości); (2) usunięty filtr
`!selectedIds.has(s.id)` z listy podpowiedzi (bez ochrony przed duplikatami) - **dokładnie 1 z 12
padł**. Po każdym cofnięciu: `git diff --stat` na `EmotionsEditor.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **479/479** (60 plików, +12 nowych testów).

**O7, część 94: `EmotionalStatesSection.tsx` (193 linie, Ustawienia → Stany emocjonalne) -
usuwanie WŁASNYCH stanów przechodzi przez `useConfirm()`, operacja nieodwracalna, zero testów.**
Błąd tu (np. pominięte potwierdzenie) usuwałby dane bez pytania - wprost naruszałoby zasadę
projektu "nigdy nie niszcz danych bez potwierdzenia". Wbudowane stany można TYLKO ukryć, nigdy
usunąć - drugi niezależny guard.

Nowy `pages/EmotionalStatesSection.test.tsx` (6 testów, `ToastProvider` + `ConfirmProvider` +
`vi.mock` na `invokeCommand`): **anulowanie potwierdzenia NIE usuwa stanu** (`invokeCommand`
NIGDY wywołane z `delete_emotional_state`); potwierdzenie usuwa stan przez
`delete_emotional_state` z poprawnym `id`; wbudowany stan NIE ma przycisku usuwania w ogóle;
przycisk "Dodaj" wyłączony przy pustym/samych spacjach polu; Enter w polu nazwy zatwierdza
dodanie tak jak klik przycisku; klik na widocznym stanie woła `set_emotional_state_hidden` z
`hidden: true`.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięty warunek `if (!(await confirm(...)))
return;` (usuwanie zawsze przechodzi, niezależnie od odpowiedzi użytkownika) - **dokładnie 1 z 6
testów padł**, pokazując dokładnie przewidziany scenariusz: anulowanie NADAL wywołało
`delete_emotional_state`; (2) usunięty warunek `!state.is_builtin` wokół przycisku usuwania
(przycisk zawsze widoczny) - **dokładnie 1 z 6 padł**. Po każdym cofnięciu: `git diff --stat` na
`EmotionalStatesSection.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **485/485** (61 plików, +6 nowych testów).

**O7, część 95: `NewTemplateModal.tsx` (103 linie) - zakładanie pustego szablonu instrumentów,
zero testów.** Dwie nieoczywiste reguły wypełniania pól: (1) pusta "Nazwa brokera" ma spaść na
nazwę SZABLONU (nie zostać pustym stringiem zapisanym w bazie); (2) pusty "Typ konta" ma pójść
jako `null`, nie pusty string - odróżnienie "brak" od "pusty tekst" ma znaczenie przy późniejszym
filtrowaniu/wyświetlaniu.

Nowy `pages/NewTemplateModal.test.tsx` (5 testów, `ToastProvider` + `vi.mock` na `invokeCommand`):
nazwa z samych spacji pokazuje błąd walidacji i NIE woła `invokeCommand` (zupełnie pustego pola
nie da się przetestować przez realny klik - natywna walidacja HTML5 `required` blokuje wysłanie
formularza wcześniej niż komponent w ogóle dostanie szansę zareagować; spacje PRZECHODZĄ przez
`required`, dopiero wtedy widać własną walidację komponentu); **pusta "Nazwa brokera" spada na
nazwę szablonu, pusty "Typ konta" idzie jako `null`**; wypełnione pola idą po przycięciu białych
znaków, nie z fallbackiem; powodzenie woła `onCreated` ze świeżym szablonem; błąd backendu
pokazuje jego komunikat i NIE zamyka okna.

Zweryfikowane testem mutacyjnym: oba fallbacki (`|| name.trim()`, `|| null`) usunięte na raz -
**dokładnie 1 z 5 testów padł**, pokazując dokładnie przewidziany błąd (`""` zamiast nazwy
szablonu, `""` zamiast `null`), pozostałe 4 bez zmian. Po cofnięciu: `git diff --stat` na
`NewTemplateModal.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **490/490** (62 pliki, +5 nowych testów).

**O7, część 96: `TradeAuditLog.tsx` (41 linii, dziennik zmian pól transakcji) - `null` i pusta
tablica muszą dawać IDENTYCZNY efekt (nic w DOM), zero testów.** Błąd tu (np. tylko sprawdzenie
`!entries` bez `entries.length === 0`) pokazałby pusty, myloący blok "Historia zmian (0)" zamiast
nic nie renderować - komponent ma prawo nic nie pokazywać, ale nie "prawie nic".

Nowy `pages/TradeAuditLog.test.tsx` (4 testy): `entries === null` i pusta tablica wpisów NIC nie
renderują (identyczny efekt, dwa niezależne testy); pokazuje liczbę wpisów w nagłówku i zmiany
pól z wielu wpisów naraz; brak starej/nowej wartości pokazuje myślnik, nie `"null"` ani pusty
tekst.

Zweryfikowane 2 niezależnymi mutacjami: (1) `!entries || entries.length === 0` zastąpione samym
`!entries` (pusta tablica przechodzi guard) - **dokładnie 1 z 4 testów padł**, pokazując
dokładnie przewidziany błąd: pusty blok "Historia zmian (0)" zamiast `null`; (2) usunięte oba
`?? "—"` - **dokładnie 1 z 4 padł**, pokazując pusty tekst zamiast myślnika. Po każdym cofnięciu:
`git diff --stat` na `TradeAuditLog.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **494/494** (63 pliki, +4 nowe testy).

**O7, część 97: `CashOperationsModal.tsx` (213 linii) - wpłaty/wypłaty/korekty na koncie,
bezpośrednio wpływające na saldo, zero testów.** Najbardziej nieoczywista część: notatka idzie do
bazy BEZ przycięcia białych znaków, mimo że decyzja "czy w ogóle wysłać, czy `null`" opiera się
na `note.trim()` - `note.trim() ? note : null` wysyła ORYGINALNY `note`, nie przycięty. Naiwny
refaktor mógłby to "poprawić" na `note.trim()`, cicho zmieniając zapisywane dane.

Nowy `pages/CashOperationsModal.test.tsx` (6 testów, `ToastProvider` + `vi.mock` na
`invokeCommand`): `account === null` nic nie renderuje (brak okna dialogowego); nieprawidłowa
kwota pokazuje błąd i NIE woła `create_cash_operation`; kwota z przecinkiem zapisuje się
znormalizowana kropką; notatka z samych spacji zapisuje się jako `null`; **niepusta notatka
zapisuje się BEZ przycięcia otaczających spacji**; po zapisie czyści pola kwoty/notatki i woła
`onOperationAdded`.

Zweryfikowane 2 niezależnymi mutacjami: (1) `note: note.trim() ? note : null` zmienione na
`note.trim() ? note.trim() : null` (przycięta wartość) - **dokładnie 1 z 6 testów padł**,
pokazując dokładnie przewidziany błąd ("premia" zamiast " premia "); (2) usunięty warunek
`!isValidDecimalString(amount)` - **dokładnie 1 z 6 padł**, nieprawidłowa kwota przeszła bez
błędu. Po każdym cofnięciu: `git diff --stat` na `CashOperationsModal.tsx` pusty. (Sprawdzone i
odrzucone jako niereprezentatywne dla realnego kodu: `normalizeDecimalInput(amount) ?? amount` -
skoro walidacja przed tym wierszem to `isValidDecimalString = normalizeDecimalInput !== null`,
fallback do surowego `amount` jest nieosiągalny w praktyce - nie testowany osobno.)

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **500/500** (64 pliki, +6 nowych testów).

**O7, część 98: `CloseTradeModal.tsx` (193 linie) - skupiona akcja "zamknij pozycję", zero
testów.** Cena wyjścia sprawdzana DWOMA niezależnymi warstwami: wspólnym
`validateTradeFormFormat` (format liczby, dzielony ze zwykłym formularzem transakcji, już
przetestowanym w `tradeForm.test.ts`) i WŁASNYM dodatkowym `!exitPrice.trim()` - wspólny
walidator celowo POMIJA puste/samo-spacjowe pole (`value.trim() && ...`, bo w zwykłym
formularzu cena wyjścia bywa opcjonalna), ale przy zamykaniu pozycji jest OBOWIĄZKOWA, stąd druga
warstwa specyficzna dla tego modalu.

Nowy `pages/CloseTradeModal.test.tsx` (5 testów, `ToastProvider` + `vi.mock` na `invokeCommand`):
`trade === null` nic nie renderuje; **same spacje w cenie wyjścia pokazują WŁASNY komunikat
modalu** ("Podaj cenę wyjścia..."), **nieliczbowa cena wyjścia pokazuje komunikat WSPÓLNEGO
walidatora formatu** ("Cena wyjścia musi być liczbą...") - dwa różne teksty z dwóch różnych
warstw, oba blokujące zapis; powodzenie woła `update_trade` z poprawnym `id` i
`expectedUpdatedAt` (optymistyczna kontrola współbieżności), potem `onClosed()` I `onClose()` w
tej kolejności; błąd backendu pokazuje jego komunikat i NIE woła żadnego z dwóch callbacków.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięta własna straż `!exitPrice.trim()` - same
spacje przeszły dalej i uderzyły w zamockowany backend, pokazując "nieoczekiwana komenda" zamiast
własnego komunikatu - **dokładnie 1 z 5 testów padł**; (2) usunięte wywołanie `onClose()` po
sukcesie (zostaje samo `onClosed()`) - **dokładnie 1 z 5 padł**. Po każdym cofnięciu: `git diff
--stat` na `CloseTradeModal.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **505/505** (65 plików, +5 nowych testów).

**O7, część 99: `ImportBrokerModal.tsx` (188 linii) - kreator importu CSV brokera, zero testów.**
Dwie łatwe do przeoczenia granice: (1) anulowanie natywnego okna wyboru pliku (`open()` z
`@tauri-apps/plugin-dialog` zwraca `null`) musi zostawić modal w spoczynku, bez wywołania
`preview_broker_import` - inaczej podgląd próbowałby się wczytać dla `sourcePath: null`; (2)
tabela podglądu obcina się na DOKŁADNIE 50 wierszach z licznikiem reszty - błąd o jeden w tę czy
w drugą stronę jest klasyczny i niewidoczny bez testu na granicznej liczbie (50 vs 51 wierszy).

Nowy `pages/ImportBrokerModal.test.tsx` (6 testów, mock `invokeCommand` +
`@tauri-apps/plugin-dialog`): anulowanie okna NIE woła `preview_broker_import`, nie pokazuje
podglądu, "Importuj" zostaje wyłączony; nazwa pliku wyciąga się poprawnie z pełnej ścieżki
zarówno Windows (`\`) jak i Unix (`/`); **dokładnie 50 wierszy pokazuje wszystkie bez licznika
"więcej", 51 wierszy pokazuje tylko pierwsze 50 z licznikiem "...i 1 więcej."**; wariant `MINI`
dostaje odznakę, inny wariant myślnik.

Zweryfikowane 2 niezależnymi mutacjami: (1) `preview.rows.slice(0, 50)` zmienione na `slice(0,
51)` - **dokładnie 1 z 6 testów padł**, pokazując dokładnie przewidziany błąd o jeden (52 wiersze
w DOM zamiast 51 licząc nagłówek); (2) usunięta straż `!path || Array.isArray(path)` po
anulowaniu wyboru pliku - **dokładnie 1 z 6 padł**, `preview_broker_import` wywołane z
`sourcePath: null`. Po każdym cofnięciu: `git diff --stat` na `ImportBrokerModal.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **511/511** (66 plików, +6 nowych testów).

**O7, część 100: `ImportMt5TradesModal.tsx` (279 linii) - kreator importu historii MT5, zero
testów.** Dwie ryzykowne części dotąd niesprawdzone: (1) "Do zaimportowania" liczy PRZECIĘCIE
dwóch niezależnych warunków (`instrument_id` rozpoznany I `!already_imported`) - pozycja
rozpoznana, ale już zaimportowana, NIE liczy się jako "do zaimportowania"; przycisk "Importuj"
musi zostać wyłączony, gdy ta liczba wynosi 0, NAWET gdy podgląd istnieje; (2) zmiana konta
docelowego musi wyczyścić WSZYSTKIE poprzednie dane (plik, podgląd, wynik) - inaczej podgląd
policzony dla jednego konta mógłby zostać zaimportowany na inne, zupełnie inne konto.

Nowy `pages/ImportMt5TradesModal.test.tsx` (5 testów, mock `invokeCommand` +
`@tauri-apps/plugin-dialog`): przycisk wyboru pliku wyłączony, dopóki konto nie jest wybrane; **po
uzyskaniu podglądu, zmiana konta chowa podgląd i nazwę pliku**; **wiersz rozpoznany, ale już
zaimportowany, NIE liczy się do "Do zaimportowania"**; "Importuj" wyłączony, gdy "Do
zaimportowania" wynosi 0 mimo istniejącego podglądu; status wiersza rozpoznanego I już
zaimportowanego pokazuje "już zaimportowana", nie "gotowa" (kolejność sprawdzania warunków ma
znaczenie).

Zweryfikowane 2 niezależnymi mutacjami: (1) `r.instrument_id && !r.already_imported` zastąpione
samym `r.instrument_id` (już zaimportowane też liczone jako "do zaimportowania") - **dokładnie 2
z 5 testów padły** (oba testy liczące "Do zaimportowania", zależne od dokładnej wartości); (2)
`handleAccountChange` okrojony do samego `setAccountId` (bez czyszczenia pliku/podglądu/wyniku) -
**dokładnie 1 z 5 padł**, stary plik i podgląd zostały widoczne po zmianie konta. Po każdym
cofnięciu: `git diff --stat` na `ImportMt5TradesModal.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **516/516** (67 plików, +5 nowych testów).

**O7, część 101: `makeBarShape` (kształt słupka `GroupBarChart`) - kolor NIEZALEŻNY od znaku dla
metryk "neutral" (win rate, liczba transakcji), zero testów.** `tone="neutral"` MUSI ignorować
znak wartości - 20% win rate nie jest "stratą" tylko dlatego, że ktoś by pomylił dodatnią liczbę
z zyskiem. Druga ryzykowna część: Recharts daje słupkom poniżej zera UJEMNĄ wysokość, a SVG
odmawia narysowania `<rect>` z ujemną szerokością/wysokością (błąd spec., element się PO PROSTU
NIE RENDERUJE) - trzeba znormalizować do dodatniej wysokości i przesunąć `y` o różnicę, inaczej
słupki strat cicho znikają z wykresu.

Przy okazji: `makeBarShape` był prywatną funkcją zagnieżdżoną w `GroupBarChart.tsx` - wyjęty do
nowego `pages/barShape.tsx` (mirror wzorca `chartAxis.ts`/`chartTheme.ts` w tym samym katalogu),
zamiast eksportować z pliku komponentu, co odpaliłoby ostrzeżenie eslint
`react-refresh/only-export-components` (Fast Refresh traci stan przy edycji pliku eksportującego
funkcję obok komponentu). Testowanie pełnego `GroupBarChart` przez Recharts w jsdom jest znane z
niestabilności (`ResponsiveContainer` polega na `ResizeObserver`/layout, których jsdom nie ma) -
`chartTheme.test.ts` już ustalił konwencję testowania czystych funkcji wprost, nie renderowania
całego wykresu.

Nowy `pages/barShape.test.tsx` (5 testów, renderowanie zwróconego `<rect>` w gołym `<svg>`):
`tone="profit-loss"` koloruje wg znaku (zysk/strata); **`tone="neutral"` z UJEMNĄ wartością
NADAL dostaje neutralny kolor serii, nie kolor straty**; dodatnia wysokość zostaje bez zmian;
**ujemna wysokość: `y` przesunięty o różnicę, `height` znormalizowane do `|height|`**.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięta gałąź `tone === "neutral"` (kolor zawsze wg
znaku) - **dokładnie 1 z 5 testów padł**, pokazując dokładnie przewidziany błąd: ujemna wartość
neutralna dostała `var(--color-loss)`; (2) usunięta normalizacja ujemnej wysokości (`normalizedY
= y`, `normalizedHeight = height`) - **dokładnie 1 z 5 padł**. Po każdym cofnięciu: `git diff` na
`barShape.tsx` ograniczony wyłącznie do zamierzonych zmian.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto (ostrzeżenie Fast
Refresh zniknęło po przeniesieniu), `pnpm exec prettier --check` czysto, `pnpm test -- --run`
**521/521** (68 plików, +5 nowych testów).

**O7, część 102: `computeCumulativeSeries` (suma narastająca `CumulativeLineChart`) - liczona przez
`Number(...)` w pętli, zero testów.** Ten sam wzorzec błędu binarnej zmiennoprzecinkowości co przy
`MonthCalendarTable` (część 85): `net_pnl` przychodzi z Rusta jako napis właśnie po to, żeby nie
przechodzić przez `Number`, ale logika sumowania żyła wprost w ciele komponentu Recharts, sumując
`Number(narastajaco) + Number(row.net_pnl)` w pętli - kilkaset grup i ostatni punkt wykresu
odchyla się od salda konta o grosze, bez żadnego sygnału, że coś jest nie tak.

Wyjęta do nowego `pages/cumulativeSeries.ts` (ten sam wzorzec ekstrakcji co `barShape.tsx` w
części 101 - czysta funkcja obok komponentu Recharts, żeby dało się ją testować bez renderowania
całego wykresu w jsdom). `computeCumulativeSeries` liczy sumę narastającą przez `sumDecimalStrings`
(BigInt) w kolejności podanych grup, konwersja na `number` jest ostatnim krokiem wyłącznie do
rysowania. `CumulativeLineChart.tsx` zredukowany do `const data = computeCumulativeSeries(rows);`.

Nowy `pages/cumulativeSeries.test.ts` (4 testy): pusta tablica daje pustą serię; **suma
`0.1 + 0.2 + 0.1` daje dokładnie `[0.1, 0.3, 0.4]`** (klasyczny błąd zmiennoprzecinkowy dałby
`0.30000000000000004`); zachowane etykiety i kolejność wejściowych grup; ujemne wartości cofające
sumę poniżej zera.

Zweryfikowane mutacją: `sumDecimalStrings([narastajaco, row.net_pnl]) ?? narastajaco` zastąpione
`String(Number(narastajaco) + Number(row.net_pnl))` - **dokładnie 1 z 4 testów padł** (test
precyzji `0.1+0.2+0.1`, otrzymane `0.30000000000000004` zamiast `0.3`), pozostałe 3 (puste dane,
kolejność etykiet, wartości ujemne) nie są dość precyzyjne, żeby złapać błąd zmiennoprzecinkowy.
Po cofnięciu: wszystkie 4 testy zielone, `git diff` na `cumulativeSeries.ts` ograniczony wyłącznie
do zamierzonej zmiany.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **525/525** (69 plików, +4 nowe testy).

**O7, część 103: `TopTradesTable` (sekcja "TOP 5" raportu miesięcznego) - zero testów.**
`opened_at` przychodzi z Rusta jako `string | null` (transakcja może nie mieć jeszcze zapisanej
daty otwarcia) - brak obsługi `null` w `formatOpenedAt` wysypałby `new Date(null)` na widoczne
użytkownikowi "Invalid Date" zamiast czytelnego "—". Druga część: kolor komórki P&L zależy od
znaku `Number(row.net_pnl)`, niezależnie od `formatSignedMoney` użytego do samego tekstu.

Nowy `pages/TopTradesTable.test.tsx` (4 testy): pusta lista pokazuje komunikat, nie pustą tabelę;
**`opened_at === null` pokazuje "—", nie "Invalid Date"**; `side` "buy"/"sell" pokazuje "BUY"/
"SELL"; dodatni `net_pnl` dostaje klasę `profit`, ujemny klasę `loss`.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięty `if (!value) return "—";` z `formatOpenedAt`
(zawsze `new Date(value ?? "")`) - **dokładnie 1 z 4 testów padł**, pokazując dokładnie
przewidziany błąd: wiersz pokazał "Invalid Date"; (2) klasa koloru zawsze `styles.profit`
(usunięty warunek znaku) - **dokładnie 1 z 4 padł**, komórka straty dostała klasę zysku. Po
każdym cofnięciu: `git diff --stat` na `TopTradesTable.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **529/529** (70 plików, +4 nowe testy).

**O7, część 104: `StatCard` (kafelek KPI na Dashboardzie i w raportach) - zero testów.** Dwie
nieoczywiste z samego JSX rzeczy: (1) `to` przełącza CAŁY kafelek między `<Link>` (klikalny,
prowadzi do danych źródłowych KPI) a zwykłym `<div>` - bez `to` kafelek nie powinien wyglądać ani
zachowywać się jak link; (2) `tone` dokłada klasę `profit`/`loss` do samej WARTOŚCI (`<span>`), nie
do całej karty.

Nowy `pages/StatCard.test.tsx` (5 testów, `MemoryRouter` dla wariantu z `to`, wzorzec z
`Sidebar.test.tsx`): bez `to` renderuje zwykły `div`, nie `link`; z `to` renderuje `link` z
poprawnym `href`; `tone="profit"`/`"loss"` dokłada klasę do wartości; `emphasis="primary"` dokłada
klasę do całej karty.

Zweryfikowane 2 niezależnymi mutacjami: (1) usunięta gałąź `if (to) return <Link>...` (zawsze
`<div>`) - **dokładnie 1 z 5 testów padł** (wariant z `to`, `getByRole("link")` nie znalazł
elementu); (2) `tone === "loss" && styles.loss` zastąpione `false && styles.loss` - **dokładnie
1 z 5 padł**. Po każdym cofnięciu: `git diff --stat` na `StatCard.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **534/534** (71 plików, +5 nowych testów).

**O7, część 105: `TradeAttachments` (sekcja "Wykres i załączniki") - tryb oczekujący dla NOWEJ
transakcji, zero testów.** Dla niezapisanej transakcji (`tradeId === undefined`) komponent trzyma
załączniki lokalnie w `pending`/`onPendingChange`, zamiast wołać `invokeCommand` bezpośrednio -
trafiają na serwer dopiero po udanym `create_trade`. Dwie nieoczywiste reguły tego trybu: (1) link
musi zaczynać się od `https://` (ta sama walidacja co `domain::attachment::is_valid_https_url` w
backendzie, tu tylko dla natychmiastowej informacji zwrotnej - autorytatywna jest ta przy zapisie);
(2) usuwanie w trybie oczekującym NIE pyta o potwierdzenie (w odróżnieniu od zapisanej transakcji,
gdzie usunięcie to nieodwracalna komenda backendu) - `useConfirm()` jest wołane bezwarunkowo przy
renderze (więc testy i tak muszą owinąć w `ConfirmProvider`), ale w gałęzi oczekującej nigdy nie
jest wywoływane.

Nowy `pages/TradeAttachments.test.tsx` (6 testów, `ToastProvider` + `ConfirmProvider`, mock
`invokeCommand` jako pusty stub - `useAttachments("")` świadomie nic nie pobiera dla pustego
tradeId): pusta lista pokazuje podpowiedź; link bez `https://` pokazuje błąd i NIE wywołuje
`onPendingChange`; poprawny link `https://` dodaje wpis przez `onPendingChange`; usunięcie w
trybie oczekującym filtruje `pending` BEZ pytania o potwierdzenie; przesunięcie elementu w dół
zamienia kolejność; pierwszy element ma wyłączony przycisk "Przesuń wyżej".

Zweryfikowane 4 niezależnymi mutacjami: (1) warunek `https://` zastąpiony `if (false)` - **dokładnie
1 z 6 testów padł** (walidacja linku); (2) `disabled={index === 0}` zastąpione `disabled={false}` -
**dokładnie 1 z 6 padł** (przycisk "wyłączony"); (3) usunięty `next.splice` w `handleMove`
(kolejność bez zmian) - **dokładnie 1 z 6 padł**; (4) `pendingItems.filter(...)` w `handleDelete`
zastąpione samym `pendingItems` (usuwanie nic nie usuwa) - **dokładnie 1 z 6 padł**. Po każdym
cofnięciu: `git diff --stat` na `TradeAttachments.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **540/540** (72 pliki, +6 nowych testów).

**O7, część 106: `InstrumentFormModal` (parametry instrumentu MT5) - zero testów.** Trzy
nieoczywiste rzeczy w tym dużym formularzu: (1) pętla walidacji w `handleSubmit` sprawdza WSZYSTKIE
pola dziesiętne (podstawowe + zaawansowane) NIEZALEŻNIE od tego, czy sekcja zaawansowana jest w
danej chwili rozwinięta (`showAdvanced`) - pole schowane, ale niepoprawne, wciąż blokuje zapis; (2)
`dec()` normalizuje przecinek na kropkę OSOBNO dla każdego z ~30 pól liczbowych przed wysyłką -
przecinek trafiający do `Decimal::from_str` w Ruście wywaliłby parsowanie; (3) `factory_index !=
null` przełącza dolny przycisk między "Przywróć wartości fabryczne" (instrument z katalogu MT5) a
"Usuń" (instrument własny) - nigdy oba naraz. Przy okazji potwierdzony w praktyce ustalony w tej
bazie kodu sposób na obejście natywnej blokady `required` dla pustych pól: pojedyncza spacja
przechodzi natywną walidację, ale wciąż pada na własnej `isValidDecimalString`.

Nowy `pages/InstrumentFormModal.test.tsx` (6 testów, `ToastProvider` + `ConfirmProvider`): błędny
"Point" blokuje zapis komunikatem TEGO KONKRETNEGO pola, nie woła backendu; przecinek w polu
dziesiętnym trafia do `create_instrument` jako kropka; instrument fabryczny pokazuje "Przywróć
wartości fabryczne" i NIE pokazuje "Usuń" (i odwrotnie dla instrumentu własnego); "Usuń" pyta o
potwierdzenie - "Anuluj" NIE woła `delete_instrument`; "Anuluj" po wejściu w edycję odrzuca
wpisaną wartość, w podsumowaniu wraca oryginalna.

Zweryfikowane 3 niezależnymi mutacjami: (1) `isValidDecimalString(...)` zastąpione `if (false)`
(walidacja nigdy nie blokuje) - **dokładnie 1 z 6 testów padł** (i ujawniło przy okazji brak
`afterEach(() => invokeCommand.mockReset())` we własnym pliku testowym - bez tego mock zostawiał
wywołania między testami, co fałszywie psuło NIEPOWIĄZANY test przez odczyt cudzego wywołania;
dopisane, zgodnie z ustalonym wzorcem z `CashOperationsModal.test.tsx`); (2) `dec()` zredukowane do
`return value` (bez normalizacji) - **dokładnie 1 z 6 padł**; (3) `isFactory` na sztywno `false` -
**dokładnie 1 z 6 padł**. Po każdym cofnięciu: `git diff --stat` na `InstrumentFormModal.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **546/546** (73 pliki, +6 nowych testów).

**O7, część 107: `TradeInspector` (panel szczegółów obok tabeli, Split View + Inspector) - zero
testów.** Cztery nieoczywiste reguły: (1) wewnętrzny `Row` chowa CAŁY wiersz (etykieta + wartość),
gdy wartość jest `null` LUB pustym stringiem - inaczej lista pęczniałaby od pustych "Interwał: "
dla każdej transakcji bez interwału; (2)-(3) sekcje "Częściowe zamknięcia" i "Notatki" renderują
się TYLKO gdy jest co pokazać (`plan_before ?? conclusion` - wystarczy JEDNA z dwóch notatek, nie
obie); (4) "Edytuj" jest wyłączony dla transakcji z ustawionym `deleted_at` (widoczna w koszu, ale
nieedytowalna) - wciąż da się ją podejrzeć, tylko nie zmienić.

Nowy `pages/TradeInspector.test.tsx` (10 testów): `net_pnl === null` pokazuje "Brak danych" bez
klasy profit/loss; dodatni/ujemny wynik dostaje klasę profit/loss; pole `null` chowa wiersz, pole
z danymi pokazuje; **pusty string (nie `null`) też chowa wiersz**; brak częściowych zamknięć -
sekcja nie renderuje się wcale; obecne - nagłówek pokazuje liczbę; brak obu notatek - sekcja
Notatki nie renderuje się; **sama jedna notatka wystarczy**; "Edytuj" wyłączony/aktywny wg
`deleted_at`.

Zweryfikowane 4 niezależnymi mutacjami: (1) usunięty warunek `value === ""` z `Row` (zostawiony
tylko `value === null`) - **dokładnie 1 z 10 testów padł** (dedykowany test pustego stringa -
pierwsza wersja testów tego NIE łapała, dopisany dopiero po tym, jak mutacja przeszła bez
żadnego niepowodzenia, mimo istniejącego już testu na `null`); (2) `zamkniecia.length > 0`
zastąpione `true` (sekcja zawsze widoczna, nawet dla 0) - **dokładnie 1 z 10 padł**; (3)
`plan_before ?? conclusion` zastąpione `plan_before && conclusion` (wymaga OBU notatek) -
**dokładnie 1 z 10 padł**; (4) `disabled={Boolean(trade.deleted_at)}` zastąpione `disabled={false}`

- **dokładnie 1 z 10 padł**. Po każdym cofnięciu: `git diff --stat` na `TradeInspector.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **556/556** (74 pliki, +10 nowych testów).

**O7, część 108: `ColorPicker` (selektor koloru strategii) - zero testów komponentu.** Czysta
matematyka konwersji HSV/HEX ma własne testy w `colorMath.test.ts` od dawna - tu brakowało testów
samego komponentu i jego stanu. Kluczowa, nieoczywista zasada: kolor NIE trafia do formularza w
trakcie wybierania - `onChange` woła się WYŁĄCZNIE po kliknięciu "Zatwierdź", nigdy podczas
przeciągania suwaka barwy czy pisania w polu HEX. "Anuluj" porzuca szkic, a KOLEJNE otwarcie panelu
startuje od `value` obowiązującego w formularzu (przez `useEffect` na `[open, value]`), nie od
porzuconego szkicu - inaczej "pobawienie się" kolorem i wycofanie zostawiłoby ślad przy następnym
otwarciu.

Nowy `ui/components/ColorPicker/ColorPicker.test.tsx` (6 testów): przycisk pokazuje aktualny kolor
formularza przed otwarciem panelu; zmiana suwaka barwy NIE woła `onChange` - dopiero "Zatwierdź";
"Anuluj" zamyka panel BEZ wołania `onChange`, mimo wpisanej zmiany w polu HEX; **ponowne otwarcie
po "Anuluj" wraca do koloru formularza, nie do porzuconego szkicu**; niepoprawny tekst HEX zostaje
w polu tekstowym, ale NIE zmienia podglądu koloru; pusta `sampleLabel` pokazuje zastępczy tekst
"Nazwa strategii".

Zweryfikowane 3 niezależnymi mutacjami: (1) "Anuluj" dodatkowo wołające `onChange(draftHex)` (symulacja
przypadkowego zatwierdzenia przy anulowaniu) - **dokładnie 1 z 6 testów padł**; (2) warunek
`if (open)` w resetującym `useEffect` zastąpiony `if (false)` (brak resetu przy otwarciu) -
**dokładnie 1 z 6 padł**; (3) `handleHexInput` wywołujące `setHsv` bezwarunkowo, nawet dla
niepoprawnego tekstu (fallback do `FALLBACK` zamiast zachowania poprzedniego koloru) - **dokładnie
1 z 6 padł**. Po każdym cofnięciu: `git diff --stat` na `ColorPicker.tsx` pusty.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` **562/562** (75 plików, +6 nowych testów).

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

## Nowa funkcja: import transakcji z historii MT5 (2026-07-24) — 🚧 w toku (backend gotowy)

Życzenie użytkownika w trakcie audytu O7: możliwość dodawania transakcji przez import historii
z terminala MT5 ("Historia" → prawy klik → "Zapisz jako Raport"), zamiast wyłącznie ręcznego
wpisywania. Doprecyzowane pytaniami: kierunek to IMPORT (z MT5 do Dziennika, nie odwrotnie),
format - xlsx (użytkownik dostarczył też wersję .html tego samego raportu, ale xlsx ma
porządniejszą strukturę typowanych komórek i został wybrany jako jedyny obsługiwany format v1).

**Analiza prawdziwego pliku użytkownika (`ReportHistory-125592334.xlsx`, 1306 pozycji) ujawniła
strukturę raportu**: trzy sekcje w jednym arkuszu - "Pozycje" (jeden wiersz na ZAMKNIĘTĄ pozycję,
już z parą otwarcie/zamknięcie - dokładnie to, czego potrzebuje `TradeInput`), "Zlecenia" (surowe
zlecenia rynkowe/limit, nieużywane) i "Transakcje" (surowe wypełnienia + operacje `balance` typu
wpłata/wypłata, też nieużywane). Zweryfikowano matematycznie: kolumna "Zysk" w sekcji "Pozycje" to
WYŁĄCZNIE zysk brutto (suma 1306 wierszy = -4119,72), a "Zysk Netto Ogółem" z podsumowania
(-4836,12) = suma Zysku + Prowizji + Swapu - potwierdza, że `commission`/`swap` w MT5 to już
ujemne koszty, odwrotna konwencja niż `TradeInput` tej aplikacji (dodatni koszt odejmowany przy
liczeniu `net_pnl`) - stąd import neguje obie wartości przy wczytaniu.

**Znalezisko krytyczne dla całego importu**: prawdziwy plik MT5 zapisuje WSZYSTKIE części XML
swojego xlsx (`.rels`, `sharedStrings.xml`, arkusz) w UTF-16LE z BOM, mimo że OOXML domyślnie
zakłada UTF-8 - `calamine` (biblioteka do czytania xlsx) się na tym wywalał ("Unexpected end of
xml"). Bez wykrycia tego na PRAWDZIWYM pliku (nie syntetycznej fikstury), cała funkcja
wyglądałaby na działającą w testach, a nie działałaby na żadnym prawdziwym eksporcie MT5 -
sprawdzone bajt-po-bajcie (`FF FE 3C 00` zamiast zwykłego `3C 3F 78 6D 6C`). Naprawione własną
funkcją re-kodującą: otwiera plik jako zwykłe archiwum zip, dekoduje każdą część zaczynającą się
od BOM UTF-16LE z powrotem na UTF-8, pakuje nowe archiwum w pamięci - dopiero to podaje się
`calamine`. Test regresyjny na tę dokładną sytuację (`dekoduje_czesci_xml_zapisane_w_utf16_z_bom`)
buduje fiksturę i re-koduje ją do UTF-16 programowo, żeby nie trzeba było commitować binarnego
pliku ani prawdziwych danych użytkownika.

**Architektura zgodna z zasadą "Rust liczy pieniądze"**: import NIE przenosi wartości "Zysk"
z MT5 wprost - parsuje tylko surowe dane wejściowe (cena/wolumen/czas/kierunek/prowizja/swap)
i tworzy `TradeInput` dokładnie tak jak ręczne wpisanie transakcji, wołając ISTNIEJĄCY
`TradesService::create` - silnik `trade_calculations` liczy `gross_pnl`/`net_pnl` sam, z parametrów
ROZPOZNANEGO instrumentu. Świadomie pomija S/L i T/P z MT5 (ostatnia wartość przy zamknięciu mogła
być przesunięta trailing stopem w stronę zysku, co złamałoby walidację "SL musi być po stronie
ryzyka").

Zbudowane (backend, `apps/desktop/src-tauri`):

- `domain/mt5_import.rs` - czysty, testowalny parser sekcji "Pozycje" (`parse_positions`) + funkcja
  re-kodująca UTF-16→UTF-8. 5 testów, w tym regresja na prawdziwy błąd UTF-16 i fikstura budowana
  programowo przez `rust_xlsxwriter` (już zależność projektu, żadnego nowego pliku binarnego).
- `application/mt5_import.rs` - `Mt5ImportService`: dopasowanie symbolu brokera (np. "XAUUSDs") do
  instrumentu przez `source_symbol` w SZABLONIE przypisanym do konta (bez szablonu dopasowanie jest
  niemożliwe z definicji), wykrywanie powtórnego importu przez znacznik `"Import MT5 #<ticket>"`
  zapisywany w `management_notes` (świadomie bez migracji schematu bazy o nowe pole).
- `commands/mt5_import.rs` - `preview_mt5_import`/`import_mt5_trades`, ten sam wzorzec
  podgląd-przed-zapisem co `preview_broker_import`.
- Nowa zależność: `calamine` (czytanie xlsx) - dodana świadomie zamiast ręcznego parsowania OOXML,
  `zip`/`rust_xlsxwriter` już były zależnościami projektu.

Zweryfikowane na PRAWDZIWYM pliku użytkownika (test tymczasowy, usunięty przed commitem - nie
trafia do repo żaden prywatny plik ani ścieżka): **1306 pozycji sparsowanych poprawnie**,
dokładnie tyle ile plik deklaruje w podsumowaniu ("Wszystkie Transakcje: 1306.000000").

Weryfikacja: `cargo test` 433/433, `cargo clippy --all-targets -- -D warnings` czyste (poza
4 wcześniej istniejącymi, niezwiązanymi ostrzeżeniami dead_code + 1 `large_enum_variant`,
zgłoszonymi osobno w tle - `task_c91d280f`), `cargo fmt --check` czyste.

**Frontend dokończony (2026-07-24) - ✅ funkcja kompletna.** Nowy `ImportMt5TradesModal.tsx`
(wzorem `ImportBrokerModal.tsx`) z przyciskiem "Importuj z MT5" na `TransactionsPage.tsx`, obok
"Dodaj transakcję". Świadoma decyzja użytkownika w trakcie budowy: panel zostaje w Historii
transakcji (nie w Eksport i kopie/Ustawienia, jak rozważano chwilę wcześniej), a wybór KONTA
DOCELOWEGO jest jawnym, pierwszym krokiem kreatora (własny `<Select>` wewnątrz modala, wypełniony
listą kont ze strony) - transakcje z importu muszą trafić na świadomie wskazane konto, nie na
cokolwiek akurat wybrane w filtrze strony. Podgląd pokazuje: liczbę rozpoznanych pozycji, ile
gotowych do zaimportowania, ile już wcześniej zaimportowanych, listę nierozpoznanych symboli -
nic nie zapisuje się przed kliknięciem "Importuj".

**Przy okazji naprawiony pre-istniejący błąd wizualny zgłoszony przez użytkownika (zrzut ekranu
z bardzo szerokiego okna):** pasek `.header` na `TransactionsPage` (filtry + przyciski) używał
`justify-content: space-between` bez żadnego ograniczenia szerokości strony - na szerokim oknie
filtry i OBA przyciski akcji (będące osobnymi dziećmi tego samego kontenera) rozjeżdżały się
równomiernie po całej szerokości ekranu, wyglądając jak nierówno rozstawione zęby. Naprawione
dwiema zmianami w `TransactionsPage.module.css`: (1) `.page` dostał `max-width: 87.5rem` - tabela
pod spodem i tak nie potrzebuje więcej miejsca; (2) nowa klasa `.headerActions` grupuje oba
przyciski w jeden flex-kontener z małym odstępem, więc `space-between` działa już tylko między
DWIEMA grupami (filtry / przyciski), nie między trzema osobnymi elementami.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
275/275 - wszystkie czyste. Port 1430 zajęty przez serwer użytkownika (potwierdzone realnym
`LISTENING`/`ESTABLISHED` w `netstat`, nie tylko martwym `SYN_SENT`) - zgodnie z zasadą sesji NIE
dotknięty, weryfikacja wizualna zostawiona użytkownikowi na jego własnym uruchomionym oknie.

## Domyślny motyw zmieniony na jasny (2026-07-24)

Życzenie użytkownika: motyw jasny jako domyślny zamiast ciemnego (dosłownie: "jest po prostu
obłędny"). Zmiana w jednym miejscu - `#[default]` na wariancie `ThemeMode::Light` zamiast `Dark`
w `apps/desktop/src-tauri/src/domain/preferences.rs`. To jedyne źródło prawdy: frontend
(`ThemeProvider.tsx`/`PreferencesProvider.tsx`) zawsze czyta wartość z załadowanych preferencji,
nie ma osobnej, zduplikowanej stałej do zmiany.

Zaktualizowane 4 testy, które literalnie zakładały ciemny jako domyślny (dwa w
`domain/preferences.rs`, dwa w `application/preferences.rs`) - w tym poprawiony test atomowości
zapisu sekcji (`niepoprawna_wartosc_odrzuca_caly_zapis_sekcji`), który przez zbieg okoliczności
ustawiał `incoming.theme` na wartość IDENTYCZNĄ jak nowy domyślny stan, co uczyniłoby asercję
bezsensowną (nie odróżniałaby "zapis się nie wykonał" od "zapis się wykonał, ale dał tę samą
wartość") - naprawione ustawieniem `incoming.theme` na wartość RÓŻNĄ od stanu startowego.

Weryfikacja: `cargo test` 433/433, `cargo clippy --all-targets -- -D warnings` czyste (poza
wcześniej zgłoszonym, niezwiązanym dead code - `task_c91d280f`), `cargo fmt --check` czyste.

## Naprawiony błąd: Kalendarz/Raporty grupowały transakcje wg UTC, nie wg lokalnej strefy (2026-07-24)

Zgłoszenie użytkownika po imporcie historii MT5: "kalendarz nie czyta tak jak powinien". Realny
błąd, nie coś specyficznego dla importu - `domain::trade_stats::compute_calendar` i WSZYSTKIE
inne rozbicia czasowe (miesięczne/roczne/kwartalne/dzień tygodnia/przedział 4-godzinny) liczyły
dzień/miesiąc/rok WPROST na `DateTime<Utc>`, bez konwersji do strefy lokalnej - to była
ŚWIADOMA, udokumentowana wcześniej w kodzie decyzja ("aplikacja nie ma ustawienia strefy
czasowej"). Transakcja zamknięta np. 00:30 czasu lokalnego (Polska, UTC+1/+2) to w UTC wciąż
POPRZEDNI dzień - trafiała więc do złego dnia w Kalendarzu i złego miesiąca/roku w Raportach.
Import MT5 (setki transakcji o różnych porach dnia w ciągu wielu miesięcy) uwidocznił błąd,
który przy ręcznie wpisywanej, rzadkiej historii prawie nigdy nie występował.

**Potwierdzone z użytkownikiem przed naprawą** (pytanie o zakres): naprawić WSZĘDZIE spójnie, nie
tylko w Kalendarzu - inaczej dzień pokazany w Kalendarzu mógłby nie pasować do miesiąca w
Raporcie miesięcznym/rocznym (nowa niespójność zamiast starej).

Naprawione w 3 plikach:

- `domain/trade_stats.rs` - nowa funkcja `zamkniecie_lokalnie()` (konwersja do `chrono::Local`)
  używana przez `compute_calendar`/`compute_monthly_breakdown`/`compute_calendar_month_breakdown`/
  `compute_yearly_breakdown`/`compute_day_of_week_breakdown`/`compute_four_hour_breakdown`/
  `compute_quarterly_breakdown`. Świadomie NIE dotknięte: `compute_equity_curve` i sortowanie -
  tam liczy się dokładny znacznik czasu (UTC), nie kalendarzowy dzień.
- `domain/export_filter.rs` - filtr eksportu po roku/miesiącu otwarcia (`opened_at`) też liczył
  wprost na UTC.
- `application/reports.rs` - `matches_dimensions` (filtr raportu po roku/miesiącu zamknięcia) i
  `period_bounds` (granice `[start, end)` okresu dla salda/filtra) - obie strony tej samej monety:
  bez naprawy `period_bounds`, granica "1 marca" wypadałaby o 22:00/23:00 UTC dnia poprzedniego,
  więc pierwsza godzina lokalnego 1 marca trafiałaby jeszcze do lutego.

Dodane 2 testy regresyjne w `trade_stats.rs` na dokładnie ten graniczny przypadek (transakcja
23:30 UTC 30 czerwca → 1 lipca lokalnie w CEST; 23:30 UTC 31 grudnia → styczeń następnego roku
w CET) - potwierdzone jako REALNIE wykrywające błąd (maszyna testowa jest w tej samej strefie
czasowej co użytkownik - Europa Środkowa - więc to nie jest test niezależny od strefy, tak samo
jak sama poprawka nie jest niezależna od strefy).

Przy okazji znaleziona, ale NIE naprawiona w tym samym kroku (osobny, niezwiązany problem):
`export_filter.rs` filtruje po `opened_at`, a `reports.rs::matches_dimensions` po `closed_at` -
dokumentacja `export_filter.rs` mówi wprost "to samo zawężenie co Raporty", więc to prawdopodobnie
NIEZAMIERZONA niespójność pól, nie kwestia strefy czasowej - zgłoszone jako osobne zadanie w tle.

Weryfikacja: `cargo test` 435/435 (+2 nowe), `cargo clippy --all-targets -- -D warnings` czyste
(poza wcześniej zgłoszonym dead code), `cargo fmt --check` czyste.

## Nowa funkcja: podgląd transakcji dnia w Kalendarzu (2026-07-24)

Życzenie użytkownika przy okazji zgłoszenia błędu Kalendarza: dzień w Kalendarzu pokazuje tylko
zagregowany wynik i liczbę transakcji, bez możliwości zobaczenia, KTÓRE to transakcje.

Zbudowane: `DayTradesModal.tsx` (nowy, wzorem innych modali podglądu w projekcie) - tabela
transakcji danego dnia (instrument, kierunek, wolumen, godzina otwarcia/zamknięcia, wynik netto
kolorowany przez `formatSignedMoney`), wyłącznie do odczytu. `CalendarPage.tsx` dociąga pełną
listę transakcji konta (`list_trades`) i grupuje je wg dnia zamknięcia W LOKALNEJ STREFIE
CZASOWEJ (`new Date(...).getFullYear/getMonth/getDate()` - domyślnie lokalne w JS), dokładnie tym
samym kluczem dnia co komórki kalendarza z `report.calendar` (który po naprawie wyżej też liczy
lokalnie po stronie Rust) - bez tego dopasowanie dnia rozjeżdżałoby się między poprawką a tą
nową funkcją.

Komórka dnia z transakcjami jest teraz klikalna i dostępna z klawiatury (`role="button"`,
`tabIndex`, `onKeyDown` Enter/Spacja, `:hover`/`:focus-visible`/`:active` - ten sam wzorzec co
klikalne wiersze `TransactionsPage`/`BreakdownTable` z wcześniejszego audytu O7); dni BEZ
transakcji zostają zwykłymi, nieinteraktywnymi kartami.

Zweryfikowane w przeglądarce fałszywym mostkiem Tauri: kliknięcie dnia z 2 transakcjami (+100
i -30, suma +70 zgodna z komórką) otworzyło modal z poprawną tabelą obu transakcji; potwierdzone
też osobno, atomowym skryptem, że Tab+Enter (nie tylko klik myszą) otwiera modal. Zero błędów
konsoli.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
278/278 - wszystkie czyste.

## Audyt wizualny formatowania tekstu/danych w całej aplikacji (2026-07-24, w toku)

Życzenie użytkownika: pełny audyt formatowania (nachodzenie/ucinanie/zawijanie tekstu,
rozjeżdżające się kolumny, niespójne odstępy/nagłówki, długie nazwy/wartości, puste dane, duże
liczby, oba motywy, skalowanie, różne szerokości okna) - ze wspólnym systemem formatowania
zamiast punktowych napraw, szczególna uwaga na 5 raportów, ale bez pomijania reszty aplikacji.
Śledzone jako lista zadań (20 pozycji: 1 baseline + 5 raportów + 13 pozostałych ekranów +
1 finalna regresja z tabelą PASS/FAIL).

**Baseline (zadanie 1, zamknięte):** przejrzane istniejące konwencje - `Table.wrapper` już ma
`overflow-x: auto`, `.numeric` już ma `tabular-nums`+prawe wyrównanie, `formatMoney`/
`formatSignedMoney` już używają `Intl.NumberFormat("pl-PL")`. Brakowało jednak sposobu na
obcinanie długich wartości z pełną treścią w tooltipie - gotowy komponent `Tooltip` istniał, ale
nie był używany NIGDZIE w aplikacji. Zbudowany nowy `TruncatedText` (obcina wielokropkiem TYLKO
gdy tekst faktycznie nie mieści się, pokazuje pełną wartość w `Tooltip` na hover/focus) - to jest
teraz JEDNO miejsce do użycia wszędzie, gdzie wartość może być dowolnie długa.

**Raport miesięczny (zadanie 2, zamknięte) - 2 realne znaleziska:**

1. Sekcja "Podsumowanie jakościowe" (najlepszy/najgorszy dzień/strategia/instrument) renderowała
   surowe etykiety bez obcinania w siatce kart o `minmax(11rem, 1fr)` - klasyczna pułapka CSS
   Grid (`min-width: auto` elementu siatki nie pozwala mu zejść poniżej szerokości NIEOBCIĘTEJ
   treści). Naprawione: `TruncatedText` na wszystkich 6 wartości + `min-width: 0` na `.leaderCard`
   w `ReportsPage.module.css` (współdzielony przez wszystkie podraporty).
2. **Wykresy słupkowe "Wynik wg strategii"/"Wynik wg instrumentu" (`GroupBarChart.tsx`) - długie
   nazwy własnych strategii/instrumentów WYSTAWAŁY POZA obszar wykresu.** Znalezisko potwierdzone
   pomiarem w przeglądarce (`getBoundingClientRect()` na prawdziwym renderze, nie domysłem):
   Recharts sam zawija długi tekst etykiety na kilka linii (`<tspan>`, zgodnie z udokumentowaną
   zasadą "nigdy nie obcinaj etykiety kategorii"), ale istniejąca logika `axisHeight`/`margin.left`
   skalowała się TYLKO wg LICZBY kategorii (np. 31 dni miesiąca), nie wg DŁUGOŚCI etykiety - przy
   MAŁEJ liczbie kategorii z DŁUGĄ nazwą własną (typowe dla ręcznie nazwanej strategii) zawinięty,
   obrócony blok tekstu przecinał się z kartą pod spodem (zmierzone: 20-29px przecięcia w pionie,
   21px w poziomie). Naprawione dodaniem NIEZALEŻNEGO wymiaru skalowania (`hasLongLabels`, próg
   18 znaków najdłuższej etykiety): `axisHeight` 50→110 i nowy `margin.left` 0→32 - zweryfikowane
   iteracyjnie w przeglądarce (edycja + pomiar + kolejna edycja), po poprawce ZERO przecięć
   w żadnym kierunku dla 3 etykiet testowych (jedna 78-znakowa).

Pozostałe elementy raportu miesięcznego sprawdzone i BEZ problemu: `TopTradesTable`/
`MonthCalendarTable` (już w scrollowalnym `Table.wrapper`, wartości formatowane/bounded),
`StatCard` (wartości to zawsze formatowane liczby, bounded length), `reportFormat.ts` (null/NaN
obsłużone czytelnym „—", bez ryzyka crasha na pustych danych).

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
278/278 - wszystkie czyste. Zero błędów konsoli w obu testach przeglądarkowych.

**Raport roczny (zadanie 3, zamknięte) - zastosowany ten sam wzorzec `TruncatedText` na
"Liderzy roku" (najlepsza/najgorsza strategia/instrument) - `min-width:0` na `.leaderCard` już
naprawiony wspólnie dla wszystkich podraportów w części wyżej. "Najlepszy/najgorszy miesiąc/
kwartał" (w `StatCard`, nie w `.leaderCard`) świadomie NIE dostały `TruncatedText` - etykiety
miesiąca/kwartału są z definicji bounded (nazwa miesiąca + rok, "Q1".."Q4"), nie treść tworzona
przez użytkownika. `CumulativeLineChart` sprawdzony i pominięty - jedyne użycie to ten sam
podraport z etykietami miesięcy, ten sam niski poziom ryzyka.

**Znalezisko krytyczne przy weryfikacji na żywo - `TruncatedText` z części 2 (raport miesięczny)
BYŁ NIEFUNKCJONALNY mimo przechodzących testów jednostkowych.** Zmierzone realnie w przeglądarce
(`getBoundingClientRect`/`scrollWidth` vs `clientWidth` na prawdziwym renderze, nie w JSDOM):
`Tooltip.wrapper` (`display: inline-flex`) IGNOROWAŁ szerokość odziedziczoną z rodzica i rósł do
pełnej treści dziecka - więc obcięty tekst (`.truncate`, poprawnie `max-width: 100%`) wracał do
PEŁNEJ szerokości w momencie owinięcia w `Tooltip` (co dzieje się zawsze, gdy tekst faktycznie
jest za długi - czyli w DOKŁADNIE tych przypadkach, dla których cały komponent powstał). Testy
jednostkowe tego nie złapały, bo JSDOM nie liczy prawdziwego layoutu (`scrollWidth`/`clientWidth`
są tam ręcznie mockowane, nie mierzone) - to nie był błąd w logice wykrywania obcięcia, tylko
w CSS, który JSDOM z definicji nie weryfikuje. Naprawione w jednym miejscu, źródłowo: dodane
`max-width: 100%; min-width: 0;` do `Tooltip.module.css .wrapper` - naprawia WSZYSTKIE dotychczasowe
i przyszłe użycia `TruncatedText` (w tym już zacommitowane w raporcie miesięcznym), nie tylko
raport roczny. Zweryfikowane ponownie na żywo po poprawce: `scrollWidth`/`clientWidth` poprawnie
różne (654px/147px), wielokropek faktycznie widoczny.

**Wniosek metodologiczny zapisany do pamięci sesji:** dla komponentów łączących CSS truncation
z innym istniejącym komponentem (`Tooltip`), sama zielona suita testów jednostkowych NIE
wystarcza - `scrollWidth`/`clientWidth` w JSDOM są iluzją (mockowaną wartością testu, nie
prawdziwym layoutem), więc test może przechodzić, mimo że prawdziwe CSS nigdy by tego nie
osiągnęło. Realna weryfikacja w przeglądarce (fałszywy mostek + pomiar geometrii) jest
obowiązkowa dla każdego nowego komponentu opartego na obcinaniu/przepełnieniu tekstu.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
278/278 - wszystkie czyste. Zero błędów konsoli.

**Raport porównania kont (zadanie 4, zamknięte).** `LeaderCard` (komponent lokalny tego
podraportu) renderował `{nazwa konta} · {wartość}` bez obcięcia - nazwa konta jest tak samo
tworzona przez użytkownika jak nazwa strategii/instrumentu, ten sam ryzyko. Naprawione
`TruncatedText`. Główna tabela porównania (14 kolumn) i wykresy (`GroupBarChart`, już naprawiony
wcześniej dla długich etykiet) sprawdzone bez dodatkowych problemów - tabela w scrollowalnym
`Table.wrapper`, jak reszta.

Zweryfikowane w przeglądarce fałszywym mostkiem (2 konta, jedno z 78-znakową nazwą): wszystkie
6 kart lidera poprawnie obcięte (`scrollWidth` 560-644px vs `clientWidth` 160px), zero błędów
konsoli.

Weryfikacja: `pnpm typecheck`, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm test`
278/278 - wszystkie czyste.

**Raport instrumentu i Raport strategii (zadania 5-6, zamknięte) - BEZ zmian kodu, oba czyste
przez ponowne użycie już naprawionych komponentów wspólnych.** Żaden z nich nie ma sekcji
"leaderboard" (kart o stałej szerokości) - tylko `StatCard` (wartości bounded) i `GroupBarChart`
(już naprawiony wcześniej dla długich etykiet - "Wynik wg konta"/"Wynik wg instrumentu" pokazują
nazwy tworzone przez użytkownika jako słupki, więc korzystają z tej samej poprawki `hasLongLabels`
bez żadnej dodatkowej zmiany). Nagłówek `<h3>` z nazwą wybranego instrumentu/strategii zawija się
naturalnie jako zwykły tekst, bez ryzyka przełamania układu.

Zweryfikowane w przeglądarce fałszywym mostkiem OBA raporty osobno (60-znakowa nazwa instrumentu,
57-znakowa nazwa strategii) - poprawne renderowanie z realnymi (fałszywymi) danymi, zero błędów
konsoli w obu.

**Dashboard (zadanie 7, zamknięte) - BEZ zmian kodu.** Karty statystyk (`StatCard`, wartości
bounded), wykresy (`GroupBarChart`, już naprawiony), rankingi Instrument/Strategia/Konto (surowe
nazwy, ale w scrollowalnym `Table.wrapper` - ten sam zaakceptowany wzorzec co `TopTradesTable`),
heatmapy dnia tygodnia/godzin (`HeatmapTable`, etykiety bounded - nazwy dni/przedziałów godzin,
nie treść tworzona przez użytkownika) - żadna sekcja nie ma karty o stałej szerokości (brak
`.leaderCard` na tym ekranie), więc nie ma tu ryzyka analogicznego do raportów.

Zweryfikowane w przeglądarce fałszywym mostkiem (57-znakowa nazwa strategii w rankingu i na
wykresie): poprawne renderowanie wszystkich sekcji (karty, krzywa kapitału, 5 wykresów, 3
rankingi, 2 heatmapy, rozkład wyników), zero przecięć w geometrii etykiety wykresu "Wynik wg
strategii", zero błędów konsoli.

**Historia transakcji - lista, formularz, panel szczegółów (zadanie 8, zamknięte) - 3 realne
znaleziska, ten sam wzorzec błędu co w krytycznym znalezisku raportu rocznego, ale bez udziału
`Tooltip`/`TruncatedText` tym razem.** `TradeInspector.module.css .symbol` (nazwa symbolu w
nagłówku panelu szczegółów) miała `overflow: hidden; text-overflow: ellipsis;` BEZ
`white-space: nowrap` - `text-overflow: ellipsis` nie ma żadnego efektu na tekście, który wolno
zawinąć na kilka linii (przeglądarka zawija zamiast obcinać, `scrollWidth` nigdy nie przekracza
`clientWidth`). Zweryfikowane na żywo w przeglądarce (mostek fałszywy + resize okna do 1600×900,
żeby uciec z jednokolumnowego trybu awaryjnego panelu przy `@media (max-width: 75rem)`): PRZED
poprawką `scrollWidth === clientWidth` mimo 45-znakowego symbolu testowego (błąd potwierdzony
pomiarem, nie domysłem), PO dodaniu `white-space: nowrap` poprawnie `clientWidth: 298,
scrollWidth: 471, truncated: true`.

Po znalezieniu identycznego wzorca w `TradeInspector`, zamiast czekać na przypadkowe odkrycie
kolejnych wystąpień, wykonany systematyczny przegląd CAŁEGO frontendu: `grep -rln
"text-overflow: ellipsis" src --include="*.css"` (9 plików). Znalezione i naprawione 2 kolejne
identyczne przypadki tego samego brakującego `white-space: nowrap`:

1. `TradeFormModal.module.css .workflowAccount` - nazwa wybranego konta w nagłówku formularza
   nowej transakcji (`TradeFormModal.tsx:753`), tworzona przez użytkownika, może być dowolnie
   długa.
2. `Sidebar.module.css .navLabel` - etykiety nawigacji bocznej. Niski poziom ryzyka w praktyce
   (etykiety są stałe i krótkie, nie treść użytkownika), ale obiektywnie martwa deklaracja CSS -
   naprawiona dla spójności i poprawności.

Przy okazji tego samego sweepu naprawiony też trzeci przypadek POZA zakresem "Historia
transakcji", ale tym samym mechanizmem: `SettingsPage.module.css .menuLabel` (etykiety menu
Ustawień) - dodane od razu, żeby nie zostawiać znanego błędu w kodzie do osobnego zadania.

Pozostałe 5 plików z listy grep (`EmotionsEditor.module.css`, `TradeAttachments.module.css`,
`CommandPalette.module.css`, `ColorPicker.module.css`, `TruncatedText.module.css`) sprawdzone i
już POPRAWNE - `white-space: nowrap` obecny przy każdym `text-overflow: ellipsis`, bez zmian.

Pozostała część zakresu zadania 8 sprawdzona bez dodatkowych problemów: `CloseTradeModal.tsx`,
`PartialClosesEditor.tsx`, `TradeAttachments.tsx` - same pola formularza i listy o ograniczonej/
formatowanej treści (kwoty, wolumeny, etykiety załączników), brak wzorca "karty o stałej
szerokości" (`.leaderCard`) ani innych podatnych na to samo obcięcie-bez-efektu.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec prettier --check` czysto na
wszystkich 4 dotkniętych plikach, `pnpm test -- --run` 278/278. Żywa weryfikacja w przeglądarce
wykonana dla `.symbol` (dowód wzorca błędu); pozostałe 3 to identyczna jednolinijkowa poprawka
tego samego, już potwierdzonego mechanizmu CSS - pominięta powtórna weryfikacja na żywo jako
zbędna (port 1430 zajęty przez prawdziwą sesję użytkownika, nie do ruszania).

## Naprawa: liczby dziesiętne pokazywały surowe zera z bazy w całej aplikacji (2026-07-24)

Zgłoszenie użytkownika: specyfikacje instrumentów (i inne surowe wartości `Decimal`) pokazywały
się z zapisu w bazie ze sztucznymi zerami wypełniającymi skalę (np. `0.000100000000` zamiast
`0,0001`), a liczby "okrągłe" powinny mieć widoczne dokładnie 2 miejsca po przecinku (np. `1,00`).
Wyraźnie sprecyzowane jako dotyczące CAŁEJ aplikacji (kalkulator, raporty, eksport/import,
historia transakcji), nie tylko ekranu instrumentów.

**Przyczyna:** `rust_decimal::Decimal::from_str` zachowuje skalę DOKŁADNIE taką, z jaką sparsował
wejście - realny plik brokera (`Vantage_instrumenty.csv`, użyty do testu) eksportuje WSZYSTKIE
pola liczbowe z 10 miejscami po przecinku (`point`, `tick_size`, `contract_size`, `swap_long` itd.),
więc po imporcie baza trzyma tę samą skalę na zawsze, dopóki coś tego nie sformatuje do
wyświetlenia. Frontend w kilku miejscach interpolował te wartości WPROST, bez żadnego formatera.

**Rozwiązanie:** nowa współdzielona funkcja `formatDecimal()` w `app/decimal.ts` - obcina zera
POWYŻEJ 2 miejsc po przecinku (bez utraty cyfr znaczących), ale nigdy nie schodzi poniżej 2 miejsc.
Limit górny ustawiony na 10 miejsc (nie 8, jak we wcześniejszym lokalnym `formatLot` z kalkulatora)

- dobrany na podstawie REALNYCH danych z pliku Vantage: pola `tick_value_profit`/`tick_value_loss`
  bywają naprawdę precyzyjne do 10 miejsc (przeliczony kurs krzyżowy, nie zera z wypełnienia), więc
  niższy limit ucinałby przez zaokrąglenie prawdziwe cyfry, nie tylko sztuczne zera.

Naprawione (surowe interpolacje zamienione na `formatDecimal`):

1. `InstrumentFormModal.tsx` - podsumowanie tylko-do-odczytu istniejącego instrumentu (`point`,
   `trade_tick_size`, `trade_tick_value`, `tick_value_profit`, `tick_value_loss`, `contract_size`,
   `volume_min/max/step`) - to jest DOKŁADNIE ekran, o którym mówił użytkownik.
2. `KalkulatorPozycjiPage.tsx` - lokalny `formatLot` (już poprawny wzorzec min2/max) scalony ze
   wspólną funkcją; naprawione dotąd surowe `stop_loss_price`, `contract_size`, `trade_tick_size`,
   `tick_value_loss` w bloku specyfikacji instrumentu i w tekście do skopiowania.
3. `TradeInspector.tsx` - `volume`, `entry_price`, `exit_price`, `stop_loss`, `take_profit`,
   `pnl_points`, `pnl_r`, etykieta lota częściowego zamknięcia.
4. `TransactionsPage.tsx` i `DayTradesModal.tsx` - kolumna "Wolumen" w tabelach transakcji.
5. `ImportMt5TradesModal.tsx` i `ImportBrokerModal.tsx` - podgląd importu (kolumny wolumen/
   kontrakt) - dotyczy też importu XLSX z MT5, nie tylko CSV brokera.
6. `PartialClosesEditor.tsx` - podsumowanie lot początkowy/zamknięty/pozostały (arytmetyka
   dokładna z `decimal.ts` już wcześniej poprawna, teraz też spójnie sformatowana do wyświetlenia).

Świadomie NIE ruszone: edytowalne pola `TextField` (surowy tekst użytkownika podczas wpisywania -
przeformatowanie na każde naciśnięcie klawisza zepsułoby pisanie), `TradePreviewCard.tsx` (ma
własny, celowo INNY wzorzec - stała precyzja 2/1 miejsc dla ryzyka/RR/punktów, to wartości
policzone, nie surowe specyfikacje), oraz rzeczywisty zapis plików eksportu (dane, nie prezentacja).

Zweryfikowane na PRAWDZIWYCH danych z pliku brokera dostarczonego przez użytkownika
(`Vantage_instrumenty.csv`): `0.0000100000` → `0,00001`, `100000.0000000000` → `100 000,00`,
`0.6133276089` (prawdziwa precyzja, nie zera) → `0,6133276089` bez utraty cyfr.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto na dotkniętych
plikach, `pnpm exec prettier --check` czysto, `pnpm test -- --run` 283/283 (5 nowych testów
`formatDecimal` + zaktualizowane asercje `PartialClosesEditor.test.tsx` pod nowy, poprawny format).

## Naprawa: błąd ESLint w `UpdateMonitorProvider.tsx` z Celu 1.8 (część 3) (2026-07-24)

Przy okazji pełnego `pnpm exec eslint .` (całościowy przegląd, nie tylko dotknięte pliki) znaleziony
1 realny błąd w już ZACOMMITOWANYM kodzie (część 3 Celu 1.8 - wtyczka powiadomień): `zaplanujNastepne`
(harmonogram, sam siebie odnawia przez rekurencję w `setTimeout`) odwoływał się do samego siebie
przez domknięcie do własnej zmiennej `const` - bezpieczne w praktyce (wywołanie rekurencyjne
następuje dopiero PO zakończeniu przypisania, `setTimeout` woła je asynchronicznie później), ale
odrzucane przez linter jako "dostęp do zmiennej przed jej deklaracją".

Naprawione przez `ref` (`zaplanujNastepneRef`), zapisywany w `useEffect` bez tablicy zależności
(NIE wprost w ciele komponentu - to osobny błąd lintera, mutacja refa podczas renderu), a odczytywany
przez rekurencyjne wywołanie wewnątrz `setTimeout`. Zachowanie harmonogramu bez zmian - to czysto
strukturalna poprawka pod linter, zweryfikowana istniejącymi testami (`UpdateMonitorProvider.test.tsx`,
17/17 bez zmian).

Weryfikacja: `pnpm exec eslint .` na całym projekcie teraz 0 błędów (tylko niegroźne, od dawna
istniejące ostrzeżenia `react-refresh/only-export-components`), `pnpm exec tsc --noEmit -p .`
czysto, `pnpm exec prettier --check` czysto, `pnpm test -- --run` 283/283.

**Kalendarz (zadanie 9, zamknięte) - 2 znaleziska.**

1. `.dayPnl` (kwota wyniku dnia + waluta) i `.dayCount` ("N transakcji") w `CalendarPage.module.css`
   nie miały `white-space: nowrap` - spacja między kwotą a kodem waluty (`formatSignedMoney` sklejа
   je spacją) jest prawidłowym miejscem zawinięcia bez tej deklaracji. Przy węższym oknie komórka
   z dłuższą kwotą mogłaby zawinąć się na 2 linie, robiąc jeden wiersz siatki miesiąca wyższy niż
   sąsiednie - ten sam mechanizm co poprzednie znaleziska audytu, tu zapobiegawczo (obcięcie
   wielokropkiem zamiast zawinięcia), plus `min-width: 0` na `.dayCell` (klasyczna pułapka CSS Grid
   - patrz `ReportsPage.module.css` wcześniej w tym audycie).
2. Licznik transakcji dnia miał tylko DWIE polskie formy odmiany ("1 transakcja" / reszta
   "transakcji") - "2 transakcje" pokazywało się błędnie jako "2 transakcji". Naprawione nową
   funkcją `tradeCountLabel()` z pełną polską odmianą liczebnikową (1 / 2-4 poza 12-14 / reszta).
   Poza ścisłym zakresem "problemów z formatowaniem" z promptu, ale to samo miejsce audytu i tania,
   bezpieczna poprawka priorytet niski, zrobiona przy okazji.

Reszta ekranu sprawdzona bez problemu: `.monthLabel` ma `min-width` (nie `max-width`) więc długie
nazwy miesięcy („Październik 2026") swobodnie rosną bez zawijania; `DayTradesModal` (już częściowo
naprawiony wcześniej w tej sesji - `size="wide"`, `formatDecimal` na wolumenie) ma kontrolowany,
przewijany `.previewTable` (`max-height` + `overflow: auto`).

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` 283/283. Bez weryfikacji na żywo w przeglądarce - port 1430
zajęty przez prawdziwą sesję użytkownika przez cały czas tego zadania (`netstat` potwierdzone
LISTENING+ESTABLISHED), a mój własny serwer podglądu używa TEGO SAMEGO portu (`.claude/launch.json`)

- zgodnie ze standing instrukcją audyt oparty wyłącznie o przegląd kodu.

**Konta - lista i modale (zadanie 10, zamknięte) - 1 znalezisko, ale we WSPÓLNYM komponencie.**
`ReadOnlyField` (`ui/components/ReadOnlyField/ReadOnlyField.module.css`) - siatka etykieta→wartość
używana w AccountDetailsModal, KalkulatorPozycjiPage, TradeBalanceCard i TradePreviewCard - miała
`grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr))` BEZ `min-width: 0` na `.row` (klasyczna
pułapka CSS Grid, ta sama co `.leaderCard` w raportach wcześniej w tym audycie) i BEZ
`overflow-wrap: anywhere` na `.value` - podczas gdy siostrzany, osobny komponent `TradeInspector`'s
`.value` MIAŁ już oba te zabezpieczenia. Naprawione dopisaniem obu brakujących właściwości - jedna
poprawka w jednym miejscu naprawia od razu 4 ekrany na raz (w tym 2, które dopiero czekają w
kolejce audytu: Kalkulator pozycji - zadanie 18).

Reszta zakresu sprawdzona bez problemu: `AccountsPage` (nazwa konta w scrollowalnej tabeli - ten
sam zaakceptowany wzorzec co rankingi), `AccountDetailsModal.module.css` (`.templateName` już miało
`min-width: 0`), `AccountFormModal`/`CashOperationsModal` (zwykłe formularze, pola `TextField`/
`Select` z własnym `min-width: 0`), natywny `<select>` (wewnętrzne renderowanie rozwijanej listy
i przycinanie tekstu zamkniętego pola to zachowanie przeglądarki, poza zasięgiem CSS aplikacji -
świadomie pominięte, tak jak wszędzie indziej w aplikacji).

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` 283/283. Bez weryfikacji na żywo - port 1430 nadal zajęty
przez sesję użytkownika.

**Strategie - lista, modale, checklisty (zadanie 11, zamknięte) - BEZ zmian kodu.** Przejrzane:
`StrategiesPage` (tagi w `flex-wrap`, nazwa w scrollowalnej tabeli - zaakceptowane wzorce), `RuleListEditor`
(pola edytowalne dziedziczą `min-width: 0` z `TextField`/`Select`), `StrategyChecklistEditor`
(`.itemName` w `.row` bez wymuszonego `white-space: nowrap` - tekst zasady swobodnie zawija się na
słowach zamiast łamać układ, to pożądane zachowanie, nie błąd), `ColorPicker` (sprawdzone dokładnie:
`.colorField` w gridzie `StrategyFormModal` bez `min-width: 0` WYGLĄDA jak znana pułapka, ale nie
jest nią - jedyna zawsze-widoczna treść wyzwalacza to swatch + krótki kod HEX, a cały panel wyboru
koloru jest `position: absolute`, więc nie liczy się do minimalnej szerokości rodzica; `.previewLabel`
w środku panelu już wcześniej miał poprawne obcięcie). Świadomie NIE wprowadzona żadna zmiana - to
prawdziwy PASS, nie przeoczenie.

Weryfikacja: `pnpm test -- --run` 283/283 (bez zmian kodu w tym zadaniu, testy uruchomione dla
pewności po przeglądzie).

**Instrumenty i szablony brokerów (zadanie 12, zamknięte) - jedyne znalezisko już naprawione
wcześniej w zadaniu 23 (surowe zera w podglądzie instrumentu w `InstrumentFormModal`).** Reszta
zakresu przejrzana bez dodatkowych problemów: `InstrumentsPage` (filtry/nagłówek już mają
`flex-wrap: wrap`, wyszukiwarka ma rozsądną stałą szerokość, technicalSymbol/opis w scrollowalnej
tabeli), `SzablonyInstrumentowPage` (`.nameText { white-space: nowrap }` to świadomy wybór - bez
próby obcięcia wielokropkiem, więc żadnego "cichego no-op" - po prostu przewija się poziomo razem
z resztą tabeli, ten sam zaakceptowany wzorzec; `.importFileName`/`.fileName` mają `word-break:
break-all` dla długich ścieżek plików), `NewTemplateModal`, `ImportBrokerModal`/`ImportMt5TradesModal`
(kontrolowane, przewijane podglądy importu).

Weryfikacja: `pnpm test -- --run` 283/283 (bez nowych zmian kodu w tym zadaniu).

**Interwały i Stan emocjonalny (zadanie 13, zamknięte) - BEZ zmian kodu.** `IntervalsSection`/
`EmotionalStatesSection` (współdzielony `EmotionalStatesSection.module.css`) - `.name` bez
wymuszonego `white-space: nowrap`, więc długa własna nazwa interwału/stanu swobodnie zawija się na
słowach zamiast łamać wiersz (ten sam bezpieczny wzorzec co `.itemName` w `StrategyChecklistEditor`,
sprawdzony w zadaniu 11). `EmotionsEditor` (edytor emocji osadzony w karcie transakcji) już
WCZEŚNIEJ, przed tym audytem, miał wzorcowo poprawne `.name`/`.suggestion` (pełne `min-width:0` +
`overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`, z komentarzem tłumaczącym
dlaczego) - potwierdzone ponownym, dokładnym przeczytaniem, bez potrzeby żadnej zmiany.

Weryfikacja: `pnpm test -- --run` 283/283 (bez zmian kodu w tym zadaniu).

**Zasady handlu (zadanie 14, zamknięte) - 2 znaleziska.**

1. `{visibleRules.length} pytań` w `ZasadyHandluPage.tsx` był STAŁYM tekstem bez ŻADNEJ odmiany -
   "1 pytań" i "2 pytań" byłyby błędne (powinno być "1 pytanie", "2 pytania"). To DRUGI przypadek
   dokładnie tego samego braku odmiany liczebnikowej co licznik transakcji dnia w Kalendarzu
   (zadanie 9) - skoro to już nie pojedynczy przypadek, wydzielona wspólna funkcja `pluralPl()`
   do nowego pliku `app/pluralize.ts` (1/2-4/reszta, z pełną odmianą 11-14 jako wyjątku) zamiast
   kopiowania tej samej logiki po raz drugi. `CalendarPage.tsx` przepisany na korzystanie z
   tej samej funkcji (usunięta duplikacja).
2. `.answer`/`.question` w `ZasadyHandluPage.module.css` - `white-space: pre-wrap` na odpowiedzi
   zachowuje wpisane enter/spacje, ale samo w sobie NIE zawija pojedynczego długiego tokenu bez
   spacji (np. wklejony URL) - dodane `overflow-wrap: anywhere` na oba, żeby taki token zawinął się
   zamiast wypychać kartę pytania poza szerokość panelu.

Reszta ekranu sprawdzona bez problemu: `.categoryName`/`.categorySummary` bez wymuszonego nowrap
(bezpieczne naturalne zawijanie, ten sam wzorzec co wcześniej), karty pytań w kontrolowanym
układzie kolumnowym.

Nowy plik `app/pluralize.ts` przetestowany osobno (6 testów: forma 1/2-4/11-14 jako wyjątek/22-24
wracające do drugiej formy/inna trójka form).

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` 289/289 (6 nowych testów `pluralPl`).

**Eksport i kopie - DataPage (zadanie 15, zamknięte) - BEZ zmian kodu.** Cały ekran to statyczny
polski tekst opisowy + przyciski + jeden `Select` - brak tabel, brak surowych wartości Decimal,
brak treści o zmiennej długości pochodzącej od użytkownika. `.sectionDescription` ma `max-width:
60ch` (czytelna długość wiersza), `.buttonRow` ma `flex-wrap: wrap`. Prawdziwy PASS.

Weryfikacja: `pnpm test -- --run` 289/289 (bez zmian kodu w tym zadaniu).

**Kosz (zadanie 16, zamknięte) - TRZECI przypadek tego samego braku odmiany liczebnikowej.**
`KoszPage.tsx` miał aż 5 komunikatów toastów/potwierdzeń ze stałym "elementów" niezależnie od
liczby ("Przywrócono 1 elementów", "usunięto trwale 2 elementów" zamiast "1 element"/"2 elementy") -
naprawione wszystkie przez `pluralPl()` (ten sam plik `app/pluralize.ts` z zadania 14). Jeden
przypadek wymagał odmiany PRZYMIOTNIKA razem z rzeczownikiem ("zaznaczony element" / "zaznaczone
elementy" / "zaznaczonych elementów") - funkcja przyjmuje dowolne 3 formy jako stringi, więc
obsłużyła to bez zmian w samej funkcji. Dodany też brakujący rzeczownik w komunikacie błędu
zbiorczego opróżniania kosza ("Nie udało się usunąć 2:" → "Nie udało się usunąć 2 elementów:",
z poprawną odmianą dopełniacza po zaprzeczonym czasowniku - w polskim przeczenie wymusza dopełniacz
niezależnie od liczby, stąd forma "few" i "many" są tu celowo takie same: "elementów" dla obu).

Reszta ekranu sprawdzona bez problemu: `item.dependency_note` to tekst generowany W CAŁOŚCI przez
backend (Rust `format!()`, nie wolny tekst użytkownika) - niskie ryzyko, `.dependencyCell` ma
kontrolowany `max-width`; `item.label` w standardowej, scrollowalnej tabeli.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` 289/289.

**Ustawienia - wszystkie sekcje (zadanie 17, zamknięte) - 4 znaleziska w `settings/DataSection.tsx`,
reszta bez zmian.**

1. `Usuniętych zostanie {N} niezapisanych szkiców` - CZWARTY przypadek braku odmiany liczebnikowej
   (po Kalendarzu, Zasadach handlu, Koszu) - naprawiony przez `pluralPl()`.
2. `Wyczyszczono {N} szkiców` - ten sam brak, ta sama naprawa.
3. Liczniki w sekcji "Stan danych" (konta/transakcje/strategie/załączniki) pokazywały surowe liczby
   całkowite bez separatora tysięcy (np. "12453" zamiast "12 453"), niespójnie z resztą aplikacji i
   z sąsiadującym polem "Rozmiar bazy", które już używało `Intl.NumberFormat`. Dodana nowa lokalna
   `formatCount()` (ten sam wzorzec co już istniejące `formatBytes()` w tym samym pliku).
4. `.updateNotes` (notatki wydania aktualizacji) w `SettingsPage.module.css` miał `white-space:
pre-wrap` bez `overflow-wrap: anywhere` - pojedynczy długi token bez spacji (np. link w notatkach
   wydania) mógłby wypchnąć kartę. Ten sam wzorzec naprawy co `.answer` w Zasadach handlu (zadanie 14).

Reszta ekranu (współdzielony `SettingRow` używany przez WSZYSTKIE sekcje preferencji, `PreferenceSections.tsx`
w całości, `UpdatesInfoSection`, menu zakładek) sprawdzona bardzo dokładnie i już POPRAWNA -
`SettingRow.module.css` ma wzorcowo poprawną pułapkę Grid (`minmax(0, 1fr)` z jawnym komentarzem
tłumaczącym dlaczego) plus container query na wąskie okno; `.stats` w Danych już miało `min-width: 0`
na elementach siatki. Żadnych dodatkowych zmian nie było potrzeba.

Weryfikacja: `pnpm exec tsc --noEmit -p .` czysto, `pnpm exec eslint` czysto, `pnpm exec prettier
--check` czysto, `pnpm test -- --run` 289/289.

**Kalkulator pozycji (zadanie 18, zamknięte) - BEZ nowych zmian, główna naprawa już w zadaniu 23.**
Surowe zera w specyfikacji instrumentu (`contract_size`/`trade_tick_size`/`tick_value_loss`) i w
`stop_loss_price` naprawione wcześniej (`formatDecimal`). Dodatkowy przegląd struktury CSS pod kątem
RESZTY listy kontrolnej (nie tylko liczb) potwierdza, że `KalkulatorPozycjiPage.module.css` już ma
wzorcowo poprawną obronę przed pułapką CSS Grid (`minmax(0, ...)` z jawnym komentarzem "utrwalona
pułapka CSS Grid w tym projekcie") na obu siatkach (`.layout`, `.grid`) plus załamania responsywne
przy 60rem i 40rem. `ReadOnlyField` użyty tu dwukrotnie już naprawiony w zadaniu 10 (korzysta z tej
samej poprawki automatycznie). `.warning`/`.explain` to zdania generowane przez backend (nie wolny
tekst użytkownika) - niskie ryzyko, zgodnie z tą samą zasadą co `dependency_note` w Koszu.

Weryfikacja: `pnpm test -- --run` 289/289 (bez nowych zmian kodu w tym zadaniu).

**Powłoka aplikacji - Sidebar, Header, CommandPalette (zadanie 19, zamknięte) - BEZ nowych zmian.**
`Sidebar.navLabel` już naprawiony w zadaniu 8; `.brandName`/`.groupLabel` mają stałą, znaną z góry
treść (nazwa aplikacji, nazwy grup nawigacji) - bezpieczne nawet bez pełnego trio obcięcia.
`CommandPalette.itemLabel` już był wzorcowo poprawny (potwierdzone ponownym czytaniem - pełne
`min-width:0`+`overflow:hidden`+`text-overflow:ellipsis`+`white-space:nowrap`). `Header` pokazuje
wyłącznie stałe etykiety nawigacji. `AppShell.module.css .main` ma już udokumentowaną naprawę
DOKŁADNIE tego samego rodzaju błędu na poziomie CAŁEJ aplikacji (`min-width: 0` na osi krzyżowej
głównego kolumnowego flexa, z obszernym komentarzem o wcześniej znalezionym błędzie ucinania bez
scrolla) - fundament, na którym stoi reszta audytu, już od dawna poprawny.

Weryfikacja: `pnpm test -- --run` 289/289 (bez zmian kodu w tym zadaniu).

## Finalna regresja + tabela PASS/FAIL (zadanie 20, zamknięte)

**Tabela PASS/FAIL - każdy ekran audytu wizualnego formatowania, żaden nie pominięty:**

| #   | Ekran                                            | Status                                           | Znaleziska                                                                                  |
| --- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | Baseline (wspólny system formatowania)           | PASS                                             | Zbudowany `TruncatedText`, wykorzystano istniejące `Table.wrapper`/`.numeric`/`formatMoney` |
| 2   | Raport miesięczny                                | PASS (2 poprawki)                                | Obcinanie liderów jakościowych + skalowanie długich etykiet wykresu                         |
| 3   | Raport roczny                                    | PASS (1 poprawka + 1 krytyczne)                  | Liderzy roku + `Tooltip.wrapper` defekt (naprawiał WSZYSTKIE użycia `TruncatedText`)        |
| 4   | Raport porównania kont                           | PASS (1 poprawka)                                | `LeaderCard` bez obcinania                                                                  |
| 5   | Raport instrumentu                               | PASS bez zmian                                   | Ponowne użycie już naprawionych komponentów                                                 |
| 6   | Raport strategii                                 | PASS bez zmian                                   | Ponowne użycie już naprawionych komponentów                                                 |
| 7   | Dashboard                                        | PASS bez zmian                                   | Brak `.leaderCard` na tym ekranie                                                           |
| 8   | Historia transakcji                              | PASS (4 poprawki)                                | Brakujący `white-space: nowrap` w 4 plikach (systematyczny sweep całego frontendu)          |
| 9   | Kalendarz                                        | PASS (2 poprawki)                                | Obcięcie wyniku dnia zamiast zawinięcia + odmiana liczebnikowa transakcji                   |
| 10  | Konta                                            | PASS (1 poprawka we wspólnym komponencie)        | `ReadOnlyField` - pułapka CSS Grid, naprawia od razu 4 ekrany                               |
| 11  | Strategie                                        | PASS bez zmian                                   | W tym dokładnie zweryfikowana pozorna pułapka w `ColorPicker` (nieszkodliwa)                |
| 12  | Instrumenty i szablony brokerów                  | PASS bez zmian                                   | Naprawa już w zadaniu 23                                                                    |
| 13  | Interwały i Stan emocjonalny                     | PASS bez zmian                                   | `EmotionsEditor` już wzorcowo poprawny                                                      |
| 14  | Zasady handlu                                    | PASS (2 poprawki)                                | Odmiana liczebnikowa pytań (wydzielona `pluralPl()`) + obcięcie długich odpowiedzi          |
| 15  | Eksport i kopie (DataPage)                       | PASS bez zmian                                   | Statyczny tekst, brak tabel                                                                 |
| 16  | Kosz                                             | PASS (5 poprawek)                                | 5 komunikatów bez odmiany liczebnikowej                                                     |
| 17  | Ustawienia (wszystkie sekcje)                    | PASS (4 poprawki)                                | 2× odmiana liczebnikowa szkiców, separator tysięcy, obcięcie notatek aktualizacji           |
| 18  | Kalkulator pozycji                               | PASS bez nowych zmian                            | Naprawa już w zadaniu 23                                                                    |
| 19  | Powłoka aplikacji                                | PASS bez zmian                                   | `Sidebar` już naprawiony w zadaniu 8, `AppShell.main` fundament już poprawny                |
| -   | Formatowanie liczb dziesiętnych (całą aplikacja) | PASS (zadanie 23, osobne zgłoszenie użytkownika) | Nowa `formatDecimal()`, naprawione 10 plików, zweryfikowane na realnym pliku brokera        |

**Podsumowanie liczbowe:** 19/19 ekranów PASS, zero FAIL. Łącznie znalezionych i naprawionych ~30
konkretnych defektów formatowania w ~25 plikach, plus 2 nowe współdzielone narzędzia (`formatDecimal`,
`pluralPl`) zapobiegające powrotowi tych samych klas błędów. Żadna kalkulacja, agregacja ani logika
biznesowa nie została dotknięta - wyłącznie prezentacja.

**Finalna regresja całej aplikacji (dokładne komendy CI z `.github/workflows/ci.yml`, nie gołe
odpowiedniki - zgodnie z ustaloną zasadą tego projektu):**

- `pnpm lint` (`eslint .`) - 0 błędów (10 niegroźnych, od dawna istniejących ostrzeżeń `react-refresh`)
- `pnpm format:check` (`prettier --check .`) - przy okazji znalezione i naprawione 2 realne pliki
  (`PROGRESS.md`, `MACIERZ_AUDYTU_REDESIGN_O.md`) z niepoprawnym formatowaniem Markdown (wyłącznie
  odstępy/łamanie list - zero zmiany treści, zweryfikowane `git diff -w`); pozostałe 8 ostrzeżeń to
  pliki w `.claude/worktrees/` - potwierdzone jako `git`-ignorowane (`git ls-files` nie zwraca nic),
  więc CI robiące świeży checkout nigdy ich nie zobaczy
- `pnpm typecheck` - czysto
- `pnpm test` (`vitest run`, cały monorepo) - 289/289
- `cargo fmt --check` (src-tauri) - czysto
- `cargo clippy --all-targets -- -D warnings` (src-tauri) - **5 błędów, ale WSZYSTKIE
  przedawnione/niezwiązane z tą sesją** (martwy kod: `as_seconds`, `PLATFORMA`, `wpis_windows` +
  duży wariant enuma `DbState`) - potwierdzone `git log` na dotkniętych plikach: ostatnie commity to
  wcześniejsza praca nad Blokiem O/motywem, NIE ten audyt (który nie dotknął ani jednego pliku
  `.rs`). Zgodnie z wcześniejszym ustaleniem z użytkownikiem, ten dług już czeka w osobnym,
  wcześniej zgłoszonym zadaniu (`task_c91d280f`) - świadomie NIE naprawiane tutaj, żeby nie mieszać
  zakresów
- `cargo test` (src-tauri) - 435/435 - to jest WŁAŚCIWA weryfikacja braku regresji obliczeniowej;
  zero zmian w kalkulacjach/agregacjach, potwierdzone przechodzącym kompletem testów logiki
  biznesowej bez żadnej modyfikacji

## Zasady pracy przy tym planie

- Commit małymi krokami, po polsku, push po każdym commicie.
- Nie oznaczać pozycji jako gotowej bez testów i przechodzącego lint/typecheck.
- Nie budować instalatora bez wyraźnej zgody użytkownika.
