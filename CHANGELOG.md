# Changelog

Format zgodny z [Keep a Changelog](https://keepachangelog.com/), wersjonowanie [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Fundament repozytorium: monorepo pnpm, TypeScript ścisły, ESLint + Prettier, Tauri 2 +
  React 19 + Vite 8.
- Globalny error boundary i ekran bezpiecznego startu.
- Pierwsza komenda diagnostyczna backendu (`get_app_status`).
- Skrypty deweloperskie Windows (`start-dev.ps1`, `start-dev.bat`).
- Dokumentacja decyzji architektonicznych (`docs/adr`).
- Schemat SQLite (konta, operacje finansowe, instrumenty, strategie, transakcje, wykonania,
  notatki, załączniki, dziennik zmian) i transakcyjny silnik migracji z automatyczną kopią
  bazy przed aktualizacją oraz kontrolą integralności.
- Repozytorium kont (CRUD + archiwizacja/przywracanie) jako pierwszy przetestowany pionowy
  przekrój warstw domain/application/infrastructure.
- System wizualny: tokeny (paleta, typografia Inter lokalnie, odstępy, ruch), biblioteka
  komponentów (Button, IconButton, TextField, Select, Checkbox, Switch, Tag, Badge, Tooltip,
  Modal, Toast, EmptyState, Skeleton, ErrorState), zwijana pogrupowana nawigacja, routing.
- Startowa biblioteka 11 instrumentów CFD/Forex, operacje finansowe (wpłaty/wypłaty/korekty)
  z saldem konta liczonym autorytatywnie w Rust.
- Ekrany Kont i Instrumentów: pełny CRUD z archiwizacją/aktywacją, modal operacji
  finansowych z historią, komponent Table.
- Strategie użytkownika: CRUD + duplikowanie + archiwizacja/przywracanie, lista startuje
  pusta.
- Silnik przeliczeń transakcji (ryzyko, RR planowane, przewidywany zysk na podstawie TP,
  wynik brutto/netto, R zrealizowane, punkty) jako czysta funkcja w Rust, bez zależności od
  bazy danych.
- Pełny cykl życia transakcji: szkic → otwarcie → zamknięcie/anulowanie, soft-delete do
  kosza i przywracanie, migawki instrumentu/strategii zamrażane przy zapisie, opcjonalna
  ręczna korekta wyniku z wymaganym uzasadnieniem.
- Formularz transakcji z podglądem wyniku na żywo, autosave szkicu lokalnie (localStorage)
  i ostrzeżeniem przed zamknięciem z niezapisanymi zmianami; osobna, skupiona akcja
  zamknięcia otwartej pozycji.
- Komponent `Textarea` w bibliotece UI.
- Silnik statystyk transakcji (win rate, profit factor, expectancy, krzywa kapitału,
  kalendarz P&L, rozbicie wg strategii/instrumentu) jako czyste funkcje w Rust.
- Dashboard z prawdziwymi metrykami i wykresem krzywej kapitału (własny SVG, bez
  zewnętrznej biblioteki), kalendarz P&L z nawigacją miesięczną, raporty z rozbiciem wg
  strategii/instrumentu, filtry (status/kierunek/wyszukiwanie) na liście transakcji.
- Eksport transakcji do CSV/XLSX (pełne dane) i PDF (zwięzły raport z podsumowaniem).
- Kopia zapasowa `.dtjbackup` (archiwum ZIP z manifestem i sumą kontrolną SHA-256) oraz
  przywracanie z pełną weryfikacją integralności przed zastosowaniem i automatyczną kopią
  bezpieczeństwa aktualnej bazy.
- Natywne okna zapisu/otwarcia pliku (`tauri-plugin-dialog`) do wyboru lokalizacji
  eksportów i kopii zapasowych.
- Produkcyjna autoaktualizacja: `tauri-plugin-updater` + `tauri-plugin-process`, podpis
  Ed25519, dystrybucja przez GitHub Releases, workflow GitHub Actions budujący i publikujący
  wydania (`docs/adr/0005-autoaktualizacja.md`). Cichy check przy starcie + pełny przepływ
  sprawdź/pobierz/zainstaluj/uruchom ponownie w Ustawieniach.
- Opcjonalna podpowiedź (`hint`) w komponencie `Select`, tym samym wzorcem co w `TextField`.
- Fabryczny katalog dokładnie 350 instrumentów (Forex, metale, indeksy i ich odmiany -MINI,
  kryptowaluty, towary, soft commodities, akcje, NDF, instrumenty syntetyczne) z pełnym,
  wersjonowanym zestawem 47 parametrów obliczeniowych na instrument (`instrument_versions`) i
  preferencjami widoczności/kolejności (`instrument_preferences`) - wygenerowany programowo z
  jawnych danych źródłowych, nigdy ręcznie przepisywany.
- Ekran "Zarządzaj instrumentami": wyszukiwarka, filtr kategorii i widoczności, zaznaczanie
  zbiorcze z akcjami pokaż/ukryj, przywracanie domyślnej widoczności (EURUSD/XAUUSD/DJI30/
  NAS100/D40EUR/BTCUSD), zmiana kolejności widocznych instrumentów, edycja parametrów tworząca
  nową wersję zamiast nadpisywania historii, przywracanie wartości fabrycznych.
- Rozróżnienie waluty wyniku instrumentu od waluty rachunku w silniku przeliczeń - transakcja
  przechowuje edytowalny kurs przeliczeniowy zamiast cichego przybliżenia przy niezgodności.
- Trwałe usuwanie instrumentów własnych (spoza fabrycznego katalogu) - zablokowane dla
  instrumentów fabrycznych (można je tylko ukryć) i dla instrumentów już użytych w transakcji.

### Changed

- Waluta konta ograniczona do enuma USD/EUR/GBP (domyślnie USD) zamiast dowolnego trzyliterowego
  kodu — konta założone przed tym ograniczeniem zachowują swoją walutę bez cichej migracji,
  edycja pozwala ją świadomie zmienić na jedną z trzech obsługiwanych.
- Silnik przeliczeń transakcji (`domain::trade_calculations`) liczy liczbę ticków z
  `TradeTickSize` (nie z `Point`, teraz wyłącznie prezentacyjnym) i stosuje osobną wartość ticka
  dla zysku i straty, zamiast jednej uśrednionej wartości na lot.
- Migawka instrumentu zapisywana w transakcji (`instrument_spec_snapshot`) niesie teraz pełny
  zestaw parametrów wersji zamiast czterech uproszczonych pól.

### Removed

- Panel "Dane i kopie" z Ustawień (odsyłacz do `/dane`) — sama strona Eksport i kopie zostaje
  bez zmian, usunięta została tylko zapowiedź w Ustawieniach.
- Prowizoryczna startowa biblioteka 11 instrumentów z Celu 1.4 - zastąpiona fabrycznym katalogiem
  350 instrumentów (migracja usuwa stare wiersze tylko tam, gdzie żadna transakcja się już do
  nich nie odwołuje).

### Fixed

- Ręcznie liczone placeholdery SQL w zapytaniu wstawiającym wersję instrumentu (47 pól)
  rozjeżdżały się z listą kolumn - zastąpione programowym generowaniem listy placeholderów.

- Zakleszczenie mutexa w `SqliteAccountRepository::create` (brakujące zwolnienie blokady przed
  wywołaniem `self.get()`).
- Kolizja kluczy React między modalami na stronie Kont (oba domyślnie `key="closed"`).
- Ucinanie prawej kolumny w formularzu transakcji (3-kolumnowe rzędy pól, np. Prowizja/Swap/
  Dodatkowe opłaty) — elementy siatki CSS Grid domyślnie mają `min-width: auto`, więc nie
  mogły się skurczyć poniżej naturalnej szerokości treści `<input>`/`<select>` i wychodziły
  poza szerokość modala. Naprawione przez `min-width: 0` (+ `width: 100%`) na `TextField`,
  `Select` i `Textarea` w bibliotece UI — naprawia to każdy przyszły formularz w siatce
  wielokolumnowej, nie tylko formularz transakcji.
