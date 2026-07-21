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
- Wspólne, autorytatywne źródło salda konta (`domain::balance`) - saldo początkowe + wpłaty/
  wypłaty/korekty + suma netto zamkniętych transakcji nie w koszu. Karta "Aktualne saldo" na
  Dashboardzie oraz karta salda przed/po/aktualne na karcie transakcji (chronologiczne, licząc
  narastająco po operacjach gotówkowych i zamknięciach transakcji, z deterministycznym remisem
  po id przy identycznych znacznikach czasu).
- Tryb tylko-do-odczytu domyślnie na karcie edytowanej transakcji, z przyciskiem "Edytuj"
  odblokowującym pola i akcjami "Anuluj"/"Zapisz zmiany" - pokazuje zawsze prawdziwe zapisane
  dane, nigdy zapomniany lokalny szkic (szkic proponowany do wczytania dopiero po wejściu w
  edycję, za potwierdzeniem).
- Wykrywanie konfliktu wersji przy zapisie transakcji - odrzuca zapis (zamiast po cichu
  nadpisać) jeśli transakcja zmieniła się od czasu jej wczytania (np. w innym oknie albo przez
  szybkie zamknięcie pozycji).
- Lokalny dziennik zmian pól transakcji - każda zapisana edycja z realnie zmienionymi polami
  trafia do dziennika (pole, stara i nowa wartość), widoczny jako zwijana "Historia zmian" na
  karcie transakcji; edycje bez realnych zmian nie tworzą wpisu.
- Emocje w 3 momentach transakcji (przed/w trakcie/po) - wielokrotny wybór stanu emocjonalnego,
  natężenie 1-5, notatka i jawna flaga "Nie uzupełniono" dla każdego momentu osobno. Zarządzana
  lista stanów emocjonalnych (12 wbudowanych startowych) w Ustawieniach - wbudowane stany można
  tylko ukryć, własne stany użytkownika można też usunąć w całości.
- Zasady wejścia i zarządzania pozycją strategii jako zarządzane listy (nazwa, opis, wymagana/
  opcjonalna - tylko wejście, aktywna/archiwalna, kolejność) zamiast wolnego tekstu - dodawanie,
  reorder, archiwizacja bez usuwania, trwałe usunięcie, odrzucenie zduplikowanych nazw wśród
  aktywnych zasad.
- Checklist zasad strategii na karcie transakcji - migawka budowana świeżo przy wyborze innej
  strategii, zachowana bez zmian gdy strategia się nie zmienia (nawet po edycji jej definicji).
  Zasady wejścia oceniane jako Spełniona/Niespełniona/Nie dotyczy, zarządzania jako Wykonana/
  Niewykonana/Nie dotyczy - niespełniona wymagana zasada nie blokuje zapisu, tylko oznacza
  naruszenie planu.
- Zarządzana lista interwałów (`domain::interval`) - sześć wbudowanych (M1/M5/M15/M30/H1/H4,
  tylko ukrycie i reorder) + własne interwały użytkownika (dodanie, przemianowanie, ukrycie,
  archiwizacja/przywrócenie). Ekran "Interwały" w Ustawieniach.
- Zakładka "Raporty" z 5 podraportami (Miesięczny, Roczny, Porównanie kont, Instrument,
  Strategia) i wspólnym, lepkim paskiem filtrów (konto/instrument/strategia/interwał/rok/
  miesiąc/kierunek/"Wyczyść") - jeden silnik metryk (`get_filtered_report`) używany przez
  wszystkie naraz. Nowe metryki w `domain::trade_stats`: średni czas trwania transakcji,
  maksymalne obsunięcie kapitału (drawdown), rozbicie miesięczne/roczne/wg dnia tygodnia.
- Nowe metryki w `domain::trade_stats`: łączna prowizja, rozbicie wg 4-godzinnych przedziałów/
  kierunku (BUY/SELL)/kwartału/miesiąca kalendarzowego (zawsze 12, zero-fill)/interwału,
  kalendarz konkretnego miesiąca dzień po dniu, TOP-N najlepszych/najgorszych transakcji,
  histogram rozkładu wyniku netto (6 przedziałów).
- `compute_period_balance` (`domain::balance`) - saldo początkowe/końcowe, wpłaty/wypłaty netto,
  zwrot % i maksymalne obsunięcie dla dowolnego okresu (miesiąc/rok/cały czas), względem salda
  początkowego tego okresu.
- Przebudowane raporty Roczny i Miesięczny (18 KPI każdy, po 5 wykresów, leaderboard najlepszych/
  najgorszych elementów, kalendarz miesiąca dzień po dniu, TOP-5 najlepszych/najgorszych
  transakcji), Porównanie kont (leaderboard + tabela z wierszem "Łącznie" + 4 wykresy), Raport
  Symbolu i Raport Strategii jako dedykowane zakładki (zastąpiły wspólny szablon) oraz Dashboard
  (pełny pasek filtrów, 8 KPI, 5 wykresów, rankingi TOP-5, dwie mapy cieplne dzień/godzina, tabela
  rozkładu wyniku) - wszystko na jednym, współdzielonym silniku `FilteredReport`.
- Nowe komponenty wykresów/tabel: `SimplePieChart`, `CumulativeLineChart`, `MonthCalendarTable`,
  `TopTradesTable`, `HeatmapTable`; wspólny hook `useReportFilter` wydzielony z logiki Raportów i
  reużyty przez Dashboard.
- Opcja "Wszystkie konta (porównanie)" w polu "Konto" na Dashboardzie - podstawia pełny widok
  porównania kont (leaderboard, tabela, 4 wykresy) w miejsce zwykłych KPI jednego konta.
- Lista startowa "Start pracy" na Dashboardzie chowa się automatycznie, gdy istnieje co najmniej
  jedna strategia i jedna transakcja - nie tylko po ręcznym zamknięciu.
- Uniwersalny Kosz (nowa pozycja nawigacji "Kosz") - jedno miejsce z listą wszystkich
  zarchiwizowanych kont, usuniętych transakcji, zarchiwizowanych strategii i własnych interwałów,
  z filtrem typu, wyszukiwarką, notatkami o zależnościach (np. "Używana w 2 transakcjach"),
  Przywróć/Usuń trwale (pojedynczo i zbiorczo) oraz "Opróżnij kosz" (automatyczna kopia zapasowa
  przed trwałym czyszczeniem wszystkiego). Nowa metoda `delete_permanently` na czterech
  repozytoriach domenowych (konta, transakcje, strategie, interwały), które wcześniej nie miały
  żadnego sposobu na trwałe usunięcie - tylko archiwizację/miękkie usuwanie.
- Załączniki na transakcji - nowa sekcja "Wykres i załączniki" na karcie transakcji: wiele zdjęć
  wykresu (wybór z dysku, przeciągnij-i-upuść, wklejenie ze schowka) z miniaturami, pełnym
  podglądem, edytowalnym opisem i zmianą kolejności, oraz linki (nazwa + adres, wyłącznie
  `https://`, otwierane w zewnętrznej przeglądarce po potwierdzeniu). Bezpieczeństwo: format
  obrazu rozpoznawany z rzeczywistej zawartości pliku (nie rozszerzenia), limit 15 MB, ochrona
  przed dowiązaniami symbolicznymi i path traversal (pliki kopiowane do zarządzanego katalogu
  pod nazwą UUID + SHA-256 w bazie). Kopia zapasowa `.dtjbackup` zawiera teraz też zdjęcia
  (weryfikacja sumy każdego pliku przed przywróceniem); trwałe usunięcie transakcji/konta/
  załącznika czyści fizyczne pliki dopiero po udanej operacji na bazie.
- Nowa zakładka "Zasady handlu" - osobisty regulamin tradera, niezależny od zasad konkretnej
  strategii: 6 startowych kategorii z 40 pytaniami-szablonami (odpowiedzi zawsze puste na
  starcie), zwijane karty kategorii, tryb odczytu z przyciskiem "Edytuj", dodawanie własnych
  kategorii i pytań, zmiana kolejności, ukrywanie, archiwizacja pytań do Kosza, wykrywanie
  duplikatów po normalizacji tekstu (z propozycją scalenia zamiast blokady dla bardzo
  podobnych) oraz "Przywróć szablon" nienaruszający odpowiedzi ani własnych pytań.
- Załączniki można dodawać już przy TWORZENIU nowej transakcji (nie tylko na zapisanej) -
  zbierane lokalnie w formularzu z podglądem i pełną edycją, zapisywane automatycznie razem
  z transakcją po kliknięciu "Zapisz"; zamknięcie formularza z niezapisanymi załącznikami
  wymaga potwierdzenia.

### Changed

- Etykieta "TPowne" zmieniona na "Zyskowne" we wszystkich raportach.
- Pasek filtrów Raportów/Dashboardu (`ReportFilterBar`) skompaktowany i pogrupowany w dwa rzędy
  ("Zakres": konto/rok/miesiąc/"Wyczyść", "Filtry": instrument/strategia/interwał/kierunek) - nowy
  wariant `compact` komponentu `Select`, mniej zajmowanej wysokości ekranu.
- Wykresy słupkowe/liniowe z wieloma kategoriami (np. 31 dni miesiąca) zajmują pełną szerokość
  siatki (nowy prop `fullWidth` na `ChartCard`) zamiast wąskiej połowy, żeby zmieściły się
  wszystkie etykiety osi X naraz - każda kategoria ma swoją widoczną etykietę (żadna nie jest
  pomijana/skracana), przy wielu kategoriach etykiety są tylko bardziej przekrzywione i mniejsze.
- Pasek filtrów Raportów pokazuje tylko pola sensowne dla aktywnego podraportu: "Miesiąc" ukryty
  w Raporcie Rocznym, "Konto" ukryty w Porównaniu kont (ten raport zawsze porównuje wszystkie
  konta - pole nie miałoby żadnego efektu).
- Krzywa kapitału (Dashboard, Raporty) narysowana teraz przez Recharts (gradient, tooltip z
  datą i wynikiem) zamiast dotychczasowego ręcznego SVG.

- Waluta konta ograniczona do enuma USD/EUR/GBP (domyślnie USD) zamiast dowolnego trzyliterowego
  kodu — konta założone przed tym ograniczeniem zachowują swoją walutę bez cichej migracji,
  edycja pozwala ją świadomie zmienić na jedną z trzech obsługiwanych.
- Silnik przeliczeń transakcji (`domain::trade_calculations`) liczy liczbę ticków z
  `TradeTickSize` (nie z `Point`, teraz wyłącznie prezentacyjnym) i stosuje osobną wartość ticka
  dla zysku i straty, zamiast jednej uśrednionej wartości na lot.
- Migawka instrumentu zapisywana w transakcji (`instrument_spec_snapshot`) niesie teraz pełny
  zestaw parametrów wersji zamiast czterech uproszczonych pól.
- Status transakcji (Szkic/Otwarta/Zamknięta) nie jest już polem wybieranym przez użytkownika -
  wyliczany wyłącznie z obecności danych, identycznie przy zapisie i odczycie.
- Precyzja czasu do sekund w polach otwarcia/zamknięcia transakcji (wcześniej tylko minuty).
- Pole "Interwał" na transakcji zamienione z wolnego tekstu na wybór z zarządzanej listy -
  transakcja przechowuje odniesienie (`interval_id`) + zamrożoną migawkę etykiety z momentu
  zapisu, tym samym wzorcem co migawka instrumentu/strategii.

### Removed

- Panel "Dane i kopie" z Ustawień (odsyłacz do `/dane`) — sama strona Eksport i kopie zostaje
  bez zmian, usunięta została tylko zapowiedź w Ustawieniach.
- Prowizoryczna startowa biblioteka 11 instrumentów z Celu 1.4 - zastąpiona fabrycznym katalogiem
  350 instrumentów (migracja usuwa stare wiersze tylko tam, gdzie żadna transakcja się już do
  nich nie odwołuje).
- Zakładka/pole Tagi z formularza transakcji, filtrów i wyszukiwania - dane tagów zapisane przed
  tą zmianą pozostają nietknięte na historycznych transakcjach.
- Sekcja "Zasady wyjścia" z formularza i aktywnego modelu strategii - stary wolny tekst (razem
  z zawartością zasad wejścia/zarządzania sprzed strukturalizacji) zachowany wyłącznie do
  wglądu, nie w aktywnym UI.

### Fixed

- Przycisk "Edytuj" i "Zapisz zmiany" na karcie transakcji zajmowały to samo miejsce w stopce
  (prawy, główny przycisk) - szybkie podwójne kliknięcie w "Edytuj" trafiało drugim kliknięciem
  już w nowo podstawiony przycisk zapisu, zapisując transakcję natychmiast, bez żadnej realnej
  zmiany i bez szansy na edycję. Naprawione krótką blokadą zapisu (500 ms) tuż po wejściu w
  tryb edycji.
- Lokalny szkic transakcji zapisany przed dodaniem nowego pola do formularza (np. emocji) mógł
  wywalić formularz przy pierwszym otwarciu po aktualizacji - wczytany szkic jest teraz zawsze
  scalany z pustym szablonem, więc brakujące pole dostaje poprawną pustą wartość zamiast `undefined`.
- Ręcznie liczone placeholdery SQL w zapytaniu wstawiającym wersję instrumentu (47 pól)
  rozjeżdżały się z listą kolumn - zastąpione programowym generowaniem listy placeholderów.
- Słupki wykresów wyniku poniżej zera (Raporty) nie renderowały się wcale - własny `shape` na
  `<Bar>` przekazywał Recharts-owi ujemną wysokość prosto do `<rect>`, a SVG odmawia narysowania
  elementu z ujemną wysokością/szerokością. Naprawione normalizacją (`Math.abs` + przesunięcie
  `y`) przed narysowaniem.
- Karty "Najlepszy dzień"/"Najgorszy dzień" w Raporcie Miesięcznym pokazywały surową datę ISO
  ("2026-03-05") zamiast czytelnego formatu polskiego.
- Pasek filtrów Raportów: dodanie `flex-basis` do klasy pola trafiało na sam `<select>`, którego
  rodzicem jest kolumnowy kontener flex (wrapper etykiety+pola) - `flex-basis` zinterpretowany
  jako wysokość, nie szerokość, rozjeżdżał każdy select do kwadratu 120×120px.
- Wykres "Liczba transakcji per miesiąc" (Dashboard) formatował liczbę transakcji jako kwotę
  pieniężną ("5,00" zamiast "5"), a automatyczne tyki osi Y potrafiły wygenerować wartości
  dziesiętne (np. "2,25") dla wielkości, która z definicji jest liczbą całkowitą.
- `pnpm eslint` liczył tysiące błędów typów z izolowanego katalogu roboczego zadania w tle
  (`.claude/worktrees/**`, bez zainstalowanych zależności) - dodano go do `ignores` w
  `eslint.config.js`.
- Etykiety osi Y na krzywej kapitału i wykresach słupkowych/liniowych obcinały się przy dużych
  kwotach (widoczne było tylko np. "000 000,00" z całej liczby) - sztywna szerokość osi Y nie
  skalowała się z długością sformatowanej treści. Naprawione dynamicznym szacowaniem szerokości
  na podstawie najdłuższej etykiety w danych (`pages/chartAxis.ts`).

- Zakleszczenie mutexa w `SqliteAccountRepository::create` (brakujące zwolnienie blokady przed
  wywołaniem `self.get()`).
- Kolizja kluczy React między modalami na stronie Kont (oba domyślnie `key="closed"`).
- Ucinanie prawej kolumny w formularzu transakcji (3-kolumnowe rzędy pól, np. Prowizja/Swap/
  Dodatkowe opłaty) — elementy siatki CSS Grid domyślnie mają `min-width: auto`, więc nie
  mogły się skurczyć poniżej naturalnej szerokości treści `<input>`/`<select>` i wychodziły
  poza szerokość modala. Naprawione przez `min-width: 0` (+ `width: 100%`) na `TextField`,
  `Select` i `Textarea` w bibliotece UI — naprawia to każdy przyszły formularz w siatce
  wielokolumnowej, nie tylko formularz transakcji.
