# PROMPT GŁÓWNY — NOWY DZIENNIK TRADERA `.EXE` + APLIKACJA INTERNETOWA

> Skopiuj do agenta cały dokument bez skracania. Ten dokument jest kompletną specyfikacją nowego produktu. Agent nie otrzyma starej aplikacji, jej kodu ani pliku `.exe`.

## 1. Twoja rola

Od tej chwili działasz jednocześnie jako główny architekt oprogramowania, starszy programista TypeScript/React, Rust/Tauri, backend/PostgreSQL, specjalista od synchronizacji offline-first, bezpieczeństwa aplikacji, UX/UI, testów automatycznych, CI/CD oraz wydawania aplikacji Windows.

Masz zaprojektować, zaimplementować, przetestować i przygotować do wydania **całkowicie nowy Dziennik Tradera**. Nie tworzysz kolejnego prototypu ani samej makiety. Dostarczasz działający produkt zbudowany od czystego repozytorium.

Produkt musi powstać jednocześnie jako:

1. aplikacja desktopowa dla Windows instalowana z pliku `Setup.exe` i działająca również bez internetu;
2. aplikacja internetowa dostępna przez przeglądarkę;
3. instalowalna aplikacja PWA;
4. jeden spójny produkt wykorzystujący wspólny kod domenowy, komponenty oraz design system;
5. system bezpiecznie synchronizujący dane pomiędzy wersją desktopową i internetową.

## 2. Nienegocjowalne zasady komunikacji

1. **Wszystkie odpowiedzi do użytkownika pisz po polsku.** Dotyczy to planów, aktualizacji postępu, pytań, opisów błędów, raportów, podsumowań, instrukcji i dokumentacji użytkownika.
2. Używaj angielskiego tylko w identyfikatorach kodu, nazwach bibliotek, protokołach, komendach i miejscach, w których wymaga tego technologia.
3. Informuj krótko po zakończeniu konkretnego kamienia milowego. Nie zasypuj użytkownika technicznym monologiem.
4. Nie pytaj ponownie o decyzje rozstrzygnięte w tej specyfikacji.
5. Pytanie do użytkownika wolno zadać wyłącznie przy rzeczywistej blokadzie: brak danych dostępowych, wybór płatnego dostawcy, certyfikatu podpisu kodu, domeny albo działanie mogące usunąć dane.
6. Nie udawaj ukończenia funkcji. Wyraźnie rozróżniaj: makietę, implementację, testy, wydanie testowe i gotowość produkcyjną.
7. Nie deklaruj „gotowe”, dopóki odpowiednie kryteria odbioru oraz testy nie przejdą.
8. Nie skracaj, nie zastępuj i nie ignoruj tego dokumentu. Umieść jego kopię w repozytorium jako `docs/specyfikacja-produktu.md`.
9. Prowadź `docs/stan-projektu.md`, `docs/decyzje-architektoniczne.md`, `CHANGELOG.md` oraz listę niespełnionych kryteriów. Po utracie lub kompresji kontekstu najpierw ponownie odczytaj te pliki.
10. Jeśli zauważysz sprzeczność, wadliwą decyzję techniczną albo ryzyko utraty danych, masz obowiązek je wskazać i zaproponować bezpieczne rozwiązanie.

## 3. Kontekst i granice projektu

- Projekt powstaje całkowicie od zera. Nie próbuj edytować, dekompilować ani kopiować starej aplikacji.
- Stara aplikacja była niestabilna, posiadała wadliwy updater, problemy z polskimi znakami, niespójne wersjonowanie, niepełne operacje bazodanowe i pozorną obsługę wielu walut. Tych błędów nie wolno powtórzyć.
- Nazwa robocza produktu: **Dziennik Tradera**. Nazwę, ikonę i dane wydawcy trzymaj w jednej konfiguracji, aby można je było później bezpiecznie zmienić.
- Aplikacja jest prywatna. Korzysta z niej właściciel oraz osoby przez niego zaproszone.
- Publiczna samodzielna rejestracja ma być wyłączona.
- Wszystkie dane użytkowników muszą być od siebie odizolowane.
- **Nie dodawaj strategii Japan Attack.**
- **Nie dodawaj żadnej domyślnej strategii, szablonu strategii ani przykładowej strategii.**
- Nowe konto ma pustą listę strategii. Każdy użytkownik sam tworzy strategie, którymi handluje.
- Nie dodawaj demonstracyjnych transakcji do produkcyjnej bazy. Dane demonstracyjne mogą istnieć wyłącznie w testach i Storybooku, nigdy po pierwszym uruchomieniu użytkownika.
- Aplikacja i wszystkie komunikaty widoczne dla użytkownika mają być po polsku oraz zapisane prawidłowo w UTF-8.

## 4. Sto autonomicznie rozstrzygniętych pytań i odpowiedzi

Poniższe decyzje zastępują serię 100 pytań A/B/C/D. Traktuj je jako wiążące wymagania.

1. **Co obejmuje pierwszy etap? — odpowiedź C.** Wszystkie 16 sensownych modułów znanych z poprzedniej aplikacji, ale każdy zaprojektowany i napisany całkowicie od zera, naprawiony, połączony z resztą systemu i rzeczywiście działający: Dashboard, Transakcje, Konta, Operacje finansowe, Smart Kalendarz, Raporty, Eksporty, Strategie, Zasady, Notatki i statusy, Analiza emocjonalna, Screenshoty, Asystent AI, Kopie zapasowe, Kosz oraz Ustawienia. Nie kopiuj ich starej implementacji ani wyglądu.
2. **Jaki produkt budujemy?** Jedną aplikację produktową dostępną jako Windows `.exe`, strona internetowa i PWA.
3. **Czy kopiujemy starą aplikację?** Nie; budujemy czyste repozytorium i nową architekturę.
4. **Jak łączą się wersje desktopowa i internetowa?** Tryb hybrydowy offline-first z automatyczną synchronizacją po odzyskaniu internetu.
5. **Czy desktop ma działać bez internetu?** Tak, po wcześniejszym zalogowaniu wszystkie podstawowe funkcje mają działać lokalnie.
6. **Czy web ma działać offline?** Tak, jako PWA z lokalną bazą, kolejką zmian i ograniczonym trybem offline.
7. **Czy dane mają być wspólne między urządzeniami?** Tak, w ramach jednego prywatnego konta użytkownika.
8. **Co w przypadku konfliktu synchronizacji?** Żadnej cichej utraty danych; konflikt ma zostać zachowany i pokazany w Centrum synchronizacji.
9. **Jaki jest język aplikacji?** Polski jako jedyny język wersji pierwszej.
10. **Jaki jest język komunikacji agenta?** Zawsze polski.
11. **Jaki system desktopowy obsługujemy najpierw?** Windows 10 i 11, architektura x64.
12. **Czy przewidujemy macOS?** Architektura nie może go blokować, ale macOS nie należy do pierwszego etapu.
13. **Jaki ma być dostęp do aplikacji internetowej?** Wyłącznie dla zaproszonych użytkowników po zalogowaniu.
14. **Czy istnieje publiczna rejestracja?** Nie.
15. **Jakie role są potrzebne?** `owner/admin` i `user`; administrator zarządza zaproszeniami oraz dostępem, ale nie czyta cudzych danych tradingowych bez jawnie zaprojektowanego uprawnienia wsparcia.
16. **Czy dodajemy Japan Attack?** Nie, nazwa nie może występować w seedach, szablonach ani UI.
17. **Czy dodajemy inne strategie startowe?** Nie; lista strategii jest pusta.
18. **Jak powstaje strategia?** Użytkownik tworzy nazwę, opis, kolor, zasady, potwierdzenia, wagi, wymagane warunki i własne pola.
19. **Czy strategię można edytować?** Tak, z wersjonowaniem oraz zachowaniem historycznego snapshotu użytego w transakcji.
20. **Czy strategię można usunąć?** Najpierw archiwizacja; trwałe usunięcie tylko po potwierdzeniu i bez łamania historii.
21. **Czy instrumenty mają sztywne parametry?** Nie; parametry zależą od brokera i konta, są wersjonowane i weryfikowane.
22. **Czy można dodać własny instrument?** Tak, razem z symbolem, kategorią, walutami, tickiem, kontraktem i ograniczeniami lota.
23. **Co jeśli specyfikacja instrumentu jest niepełna?** Aplikacja nie wymyśla wyników; oznacza obliczenia jako niewiarygodne i wskazuje brakujące dane.
24. **Jakie konta obsługujemy?** Live, demo, prop/funded, challenge oraz własny typ użytkownika.
25. **Czy jedno konto ma własną walutę?** Tak.
26. **Czy wolno sumować różne waluty?** Nie bez jawnego kursu przeliczeniowego i opisania waluty raportowej.
27. **Jak obsługujemy wpłaty i wypłaty?** Jako osobne, edytowalne operacje finansowe z historią zmian.
28. **Czy obsługujemy transfer między kontami?** Tak, jako powiązaną parę operacji.
29. **Czy transakcja może mieć wiele wejść?** Tak, przez osobne nogi wejścia.
30. **Czy transakcja może mieć częściowe wyjścia?** Tak, przez osobne nogi wyjścia z ceną, wolumenem, czasem i opłatami.
31. **Czy obsługujemy wiele TP?** Tak, planowane poziomy TP oraz wykonane wyjścia są osobnymi danymi.
32. **Czy obsługujemy zmianę SL i break even?** Tak, przez historię zarządzania pozycją.
33. **Czy obsługujemy prowizję, swap i inne opłaty?** Tak, jako osobne składowe P&L.
34. **Czy wynik wpisuje użytkownik?** Głównie jest wyliczany; użytkownik może oznaczyć anulowaną, pominiętą lub wersję roboczą.
35. **Czy otwarta transakcja jest dozwolona?** Tak.
36. **Czy formularz zapisuje wersję roboczą?** Tak, automatycznie i bez blokowania użytkownika.
37. **Czy walidacja ma blokować zły zapis?** Błędy krytyczne blokują finalizację, ostrzeżenia pozwalają zapisać szkic.
38. **Jak liczymy pieniądze i ceny?** Na typach dziesiętnych, nigdy na niedokładnym `float` JavaScriptu.
39. **Jaka strefa czasowa?** Zapisy w UTC, prezentacja w strefie profilu użytkownika, domyślnie `Europe/Amsterdam` z możliwością zmiany.
40. **Czy przechowujemy pierwotną strefę transakcji?** Tak, aby raporty sesji i dni były poprawne.
41. **Jakie podstawowe statystyki pokazujemy?** Saldo, gross/net P&L, win rate, profit factor, expectancy, średni zysk/stratę, payoff, planowane i wykonane RR, drawdown, zwrot, serie i czas trwania.
42. **Jakie główne wykresy?** Krzywa kapitału, drawdown, P&L dzienny/miesięczny, rozkład wyników oraz porównania strategii i instrumentów.
43. **Jakie filtry?** Konto, okres, instrument, strategia, kierunek, wynik, tag, sesja, interwał i jakość danych.
44. **Czy filtry można zapisać?** Tak, jako prywatne widoki użytkownika.
45. **Czy jest kalendarz?** Podstawowy kalendarz wyników w końcówce etapu pierwszego; rozbudowa w etapie drugim.
46. **Czy można dołączać screenshoty?** Tak, prywatnie, z metadanymi, sumą kontrolną i kolejką przesyłania offline.
47. **Czy screenshoty można usuwać i opisywać?** Tak; usunięcie jest miękkie, a opis i etap `przed/w trakcie/po` są edytowalne.
48. **Czy istnieją notatki?** Tak, do transakcji i dnia; rozbudowane szablony notatek w etapie drugim.
49. **Czy istnieją emocje i psychologia?** Tak; działający moduł bazowy jest obowiązkowy w etapie pierwszym, a pogłębiona analityka psychologiczna powstaje w etapie drugim.
50. **Czy zasady są połączone z transakcją?** Tak, checklisty zapisują snapshot i faktyczne wykonanie, a nie są osobną martwą listą.
51. **Czy statusy są edytowalne?** Status procesu może być własny, ale wynik finansowy jest oddzielnym wyliczanym polem.
52. **Czy istnieje kosz?** Tak, z przywracaniem i okresem przechowywania.
53. **Czy operacje masowe są dostępne?** Tak, ale każda ma podgląd skutków, potwierdzenie i możliwość cofnięcia, jeśli jest to bezpieczne.
54. **Czy importujemy CSV?** Tak, przez kreator mapowania kolumn, walidację i podgląd przed zapisem.
55. **Czy importujemy dane MT5?** W etapie drugim: najpierw bezpieczny import historii, później opcjonalny konektor tylko do odczytu.
56. **Czy aplikacja otwiera pozycje u brokera?** Nie; dziennik nie wykonuje automatycznie transakcji.
57. **Czy jest AI?** Tak; w etapie pierwszym działa moduł Asystenta AI z wymiennym dostawcą, jawną konfiguracją i kontrolą prywatności, natomiast jego zaawansowane możliwości powstają w etapie drugim.
58. **Czy AI może samoczynnie wysyłać dane?** Nie; użytkownik wybiera zakres, widzi podgląd i wyraża zgodę.
59. **Gdzie przechowujemy sekrety?** Desktop: Windows Credential Manager; serwer: menedżer sekretów; nigdy repozytorium ani logi.
60. **Czy dane lokalne mają być chronione?** Tak; szyfrowane backupy są obowiązkowe, a szyfrowanie bazy desktopowej ma zostać wdrożone stabilnym i przetestowanym rozwiązaniem.
61. **Czy ruch sieciowy jest szyfrowany?** Wyłącznie HTTPS/TLS w produkcji.
62. **Czy backend używa RLS?** Tak, dla każdej tabeli użytkownika, z automatycznymi testami izolacji.
63. **Czy pliki są publiczne?** Nie; prywatny storage i krótkotrwałe podpisane adresy.
64. **Czy telemetria jest domyślna?** Nie.
65. **Czy diagnostyka jest możliwa?** Tak, lokalne zanonimizowane logi i eksport paczki diagnostycznej po zgodzie.
66. **Czy aplikacja ma autoaktualizację desktopową?** Tak, przez podpisany manifest HTTPS i podpisane artefakty Tauri.
67. **Kiedy sprawdzamy aktualizacje?** Po starcie z opóźnieniem, cyklicznie w tle oraz ręcznie w Ustawieniach.
68. **Jak instalujemy aktualizację?** Pobranie w tle, sprawdzenie podpisu i instalacja przy bezpiecznym restarcie.
69. **Co przed aktualizacją?** Spójny backup, kontrola wolnego miejsca i test zgodności migracji.
70. **Czy krytyczna aktualizacja może być wymuszona?** Tak, tylko z jasnym komunikatem, okresem przejściowym i bez utraty możliwości eksportu danych.
71. **Czy aktualizacje mają kanały?** `stable` dla użytkowników i oddzielny `beta/internal` dla właściciela.
72. **Jak aktualizuje się web/PWA?** Wykrywa nową wersję service workera, kończy lokalny zapis i proponuje bezpieczne przeładowanie.
73. **Czy wydania są wersjonowane?** Semantic Versioning, changelog i identyczny numer wersji w UI, manifeście, instalatorze i diagnostyce.
74. **Czy instalator jest podpisany?** Produkcyjne wydanie ma używać Authenticode; brak certyfikatu jest jawnie zgłoszoną blokadą wydania, a nie ukrytym ostrzeżeniem.
75. **Gdzie publikujemy aktualizacje?** Prywatne repozytorium, a podpisane pliki i manifest przez kontrolowany endpoint HTTPS, np. Cloudflare R2 z własną domeną.
76. **Czy klucz aktualizatora trafia do repo?** Tylko publiczny; prywatny klucz podpisujący jest w bezpiecznym sekrecie CI i posiada kopię awaryjną poza repozytorium.
77. **Czy jest automatyczny backup?** Tak, dzienny oraz przed migracją, importem, aktualizacją i przywróceniem.
78. **Czy backup obejmuje wszystko?** Bazę, ustawienia, pliki, manifest, wersję schematu i sumy kontrolne.
79. **Czy backup można zweryfikować przed przywróceniem?** Tak, bez modyfikowania aktualnych danych.
80. **Czy przywracanie jest atomowe?** Tak, z backupem stanu bieżącego i bezpiecznym powrotem w razie błędu.
81. **Jak wygląda design?** Nowoczesny, premium, ciemny jako domyślny, ale bez przesadnych efektów i bez kopiowania starej aplikacji.
82. **Czy jest jasny motyw?** Tak.
83. **Jakie kolory finansowe?** Zielony dla zysku, czerwony dla straty, neutralne kolory dla braku wyniku; nie opieraj znaczenia wyłącznie na kolorze.
84. **Czy interfejs ma być responsywny?** Tak, desktop, laptop, tablet i telefon.
85. **Czy dostępność jest wymagana?** Tak: klawiatura, focus, kontrast, etykiety, skalowanie i ograniczenie animacji.
86. **Czy są skróty klawiaturowe?** Tak, dla dodania transakcji, wyszukiwania, zapisu i nawigacji, z możliwością wyłączenia.
87. **Czy aplikacja ma onboarding?** Krótki onboarding konfigurujący profil, konto i pierwszy własny instrument/strategię, bez danych demo.
88. **Czy puste ekrany mają sensowne działania?** Tak, wyjaśniają kolejny krok i nie pokazują pustych dekoracyjnych kart.
89. **Czy użytkownik widzi stan synchronizacji?** Tak: online/offline, kolejka, ostatnia synchronizacja, błąd i konflikt.
90. **Czy awaria może zablokować lokalny zapis?** Nie; zmiana trafia lokalnie i czeka w kolejce, o ile lokalna baza jest sprawna.
91. **Czy migracje są wersjonowane?** Tak, forward-only, transakcyjne, testowane na kopiach wcześniejszych schematów.
92. **Czy zapis złożonej transakcji jest atomowy?** Tak, transakcja, nogi, potwierdzenia, notatki i outbox zapisują się w jednej transakcji bazodanowej.
93. **Jakie testy są obowiązkowe?** Jednostkowe, integracyjne, komponentowe, E2E, RLS, migracji, synchronizacji, backupu, aktualizacji i regresji wizualnej.
94. **Czy wolno używać bibliotek alpha/beta?** Nie w krytycznym fundamencie produkcyjnym.
95. **Jak zarządzamy zależnościami?** Najnowsze stabilne i wzajemnie zgodne wersje, przypięty lockfile, automatyczny audyt i kontrolowane aktualizacje.
96. **Czy kod ma być modularny?** Tak, wspólna domena bez zależności od UI, adaptery dla SQLite/IndexedDB/PostgreSQL i wyraźne granice funkcji.
97. **Czy funkcje zaawansowane mogą opóźniać rdzeń?** Nie; mają feature flags i wchodzą dopiero po stabilnym wydaniu etapu pierwszego.
98. **Czy użytkownik jest właścicielem danych?** Tak, pełny eksport JSON/CSV/XLSX/PDF i procedura usunięcia konta.
99. **Jak dzielimy pracę?** Dwa główne etapy z małymi, odbieralnymi kamieniami milowymi i działającą wersją po każdym z nich.
100. **Kiedy projekt jest gotowy?** Gdy istnieje działający web/PWA, podpisywalny instalator Windows, synchronizacja offline, updater, backup, testy, dokumentacja i przejście pełnej listy kryteriów odbioru.

## 5. Zalecana architektura techniczna

### 5.1 Zasady doboru technologii

- Użyj wyłącznie stabilnych wydań dostępnych w momencie tworzenia projektu.
- Przed instalacją sprawdź oficjalną dokumentację, status utrzymania, licencję i zgodność wersji.
- Nie przywiązuj projektu do numerów wersji zapisanych w tym dokumencie; przypnij wybrane kompatybilne wersje w lockfile.
- Nie używaj eksperymentalnego SDK jako rdzenia synchronizacji. W szczególności nie opieraj produkcji na SDK Tauri opisanym przez dostawcę jako alpha.
- Każdą istotną zmianę stosu opisz w ADR po polsku.

### 5.2 Monorepo

Utwórz prywatne monorepo o przykładowej strukturze:

```text
apps/
  web/                 # Vite PWA
  desktop/             # Tauri 2 + Windows installer
packages/
  app-shell/           # wspólny React UI i routing
  domain/              # encje, use-case'y, obliczenia, reguły
  ui/                  # design system i komponenty
  data-contracts/      # Zod/OpenAPI/typy synchronizacji
  data-desktop/        # adapter SQLite przez bezpieczne komendy Rust
  data-web/            # adapter IndexedDB/Dexie
  sync-engine/         # outbox, pull/push, konflikty, retry
  i18n/                # polskie komunikaty i test kompletności
  testing/             # fabryki wyłącznie testowe
supabase/
  migrations/
  functions/
  tests/
docs/
```

Zastosuj `pnpm` workspaces i, jeśli rzeczywiście usprawnia projekt, stabilne Turborepo. Nie dodawaj narzędzia tylko dla pozoru.

### 5.3 Frontend wspólny

- React + TypeScript w trybie `strict`.
- Vite dla web i współdzielonego frontendu desktopowego.
- React Router albo równoważny stabilny router z typowanymi trasami.
- TanStack Query do stanu serwerowego/synchronizacji, nie jako zamiennik lokalnej bazy.
- React Hook Form + Zod do formularzy i walidacji.
- TanStack Table z wirtualizacją dla dużej historii.
- Apache ECharts dla rozbudowanych wykresów finansowych.
- `decimal.js` lub równoważna stabilna biblioteka dziesiętna; obliczenia pieniężne nie mogą używać surowych `number` bez kontrolowanej konwersji.
- `date-fns` i IANA time zones.
- Radix UI/shadcn jako dostępne prymitywy, lecz końcowy wygląd ma być własny, nie domyślny szablon.
- Lucide jako spójny zestaw ikon.
- Zustand wyłącznie dla lekkiego stanu interfejsu, jeśli jest potrzebny.
- Service worker/Workbox przez stabilne rozwiązanie PWA kompatybilne z Vite.

### 5.4 Desktop

- Tauri 2 w najnowszej stabilnej, zgodnej wersji.
- Rust stable, sformatowany `rustfmt`, kontrolowany `clippy` bez ignorowania istotnych ostrzeżeń.
- SQLite jako lokalne źródło danych desktopu.
- Nie wystawiaj frontendowi wykonywania dowolnego SQL. Udostępniaj wąskie, typowane komendy Rust/repository.
- Migracje wersjonowane i wykonywane transakcyjnie.
- Włącz `foreign_keys`, WAL, rozsądny `busy_timeout` i kontrolę integralności.
- Użyj minimalnych Tauri capabilities, ścisłego CSP i najwęższego zakresu dostępu do plików.
- Token odświeżający oraz inne sekrety przechowuj w Windows Credential Manager.
- Przygotuj NSIS `Setup.exe`; MSI może być dodatkowym artefaktem, ale nie zastępuje wymaganego instalatora `.exe`.

### 5.5 Web/PWA

- Hostowany statyczny frontend z wersjonowanymi, hashowanymi zasobami.
- IndexedDB przez stabilny Dexie jako lokalna baza web.
- PWA ma cache'ować shell aplikacji i pozwalać na pracę po wcześniejszym logowaniu.
- Gdy token wygaśnie podczas braku internetu, użytkownik nadal może czytać i zapisywać lokalne dane; synchronizacja czeka na ponowne uwierzytelnienie.
- Aktualizacja service workera nie może przeładować strony w trakcie niezapisanego formularza.

### 5.6 Backend

Zastosuj Supabase jako praktyczny backend pierwszej wersji:

- PostgreSQL jako źródło danych zsynchronizowanych;
- Supabase Auth;
- prywatny Supabase Storage;
- Row Level Security na wszystkich tabelach użytkownika;
- Edge Functions/RPC do zaproszeń, administracji, atomowego push/pull oraz operacji wymagających sekretu;
- service-role key nigdy nie trafia do aplikacji klienckiej;
- migracje SQL są częścią repozytorium;
- pgTAP lub równoważne testy RLS i funkcji bazodanowych;
- projekt musi zachować możliwość przyszłej migracji do standardowego PostgreSQL bez utraty danych.

Frontend internetowy można hostować na Cloudflare Pages. Artefakty aktualizatora desktopowego oraz manifest mogą znajdować się w Cloudflare R2 za HTTPS i własną domeną. Jeśli użytkownik wybierze innych dostawców, zachowaj te same kontrakty bezpieczeństwa.

## 6. Synchronizacja offline-first — wymagania krytyczne

Zaimplementuj własny, mały i dobrze przetestowany protokół synchronizacji zamiast uzależniać fundament od eksperymentalnego SDK.

### 6.1 Wspólne metadane

Każda synchronizowana encja posiada co najmniej:

- `id` jako UUIDv7 lub inny porządkowalny globalnie unikalny identyfikator;
- `owner_id`;
- `created_at`;
- `updated_at`;
- `deleted_at` jako tombstone;
- `server_version`;
- `last_modified_by_device_id`.

Nie używaj zegara klienta jako jedynego źródła kolejności zmian.

### 6.2 Outbox

- Każda lokalna zmiana domenowa i odpowiadający jej rekord outbox zapisują się atomowo.
- Mutacja zawiera `mutation_id`, `device_id`, typ encji, operację, payload, `base_server_version`, czas lokalny, liczbę prób i ostatni błąd.
- Push wysyła małe partie, jest idempotentny i obsługuje ponowienia z exponential backoff oraz jitter.
- Serwer przechowuje identyfikatory zastosowanych mutacji, aby powtórzenie nie duplikowało danych.

### 6.3 Pull

- Serwer generuje monotoniczny `change_id`.
- Klient pobiera zmiany po ostatnim zatwierdzonym kursorze.
- Zastosowanie partii zmian i aktualizacja kursora są jedną lokalną transakcją.
- Tombstones są synchronizowane; ich trwałe czyszczenie następuje dopiero po bezpiecznym okresie retencji.

### 6.4 Konflikty

- Push z nieaktualnym `base_server_version` nie nadpisuje bez ostrzeżenia nowszych danych.
- Zachowaj wersję lokalną i serwerową w tabeli konfliktów.
- Centrum synchronizacji pokazuje różnice oraz działania: zachowaj lokalną, zachowaj serwerową, ręcznie połącz.
- Automatycznie scalaj tylko przypadki formalnie bezpieczne i pokryte testem.
- Konflikt załącznika, strategii lub złożonej transakcji nie może rozdzielić relacji ani pozostawić półproduktu.

### 6.5 Załączniki

- Metadane pliku synchronizuj przez bazę, binarne dane przez prywatny Storage.
- Użyj kolejki upload/download, sum SHA-256, limitów rozmiaru, walidacji MIME oraz bezpiecznych nazw.
- Nie ufaj rozszerzeniu pliku.
- W desktopie zachowaj kontrolowaną lokalną kopię.
- Usunięcie pliku ma być miękkie i później sprzątane przez serwerowe zadanie retencji.

### 6.6 Widoczność stanu

W każdej wersji pokaż dyskretny, czytelny status:

- zsynchronizowano;
- synchronizacja trwa;
- offline;
- oczekujące zmiany;
- wymagane logowanie;
- błąd możliwy do ponowienia;
- konflikt wymagający decyzji.

## 7. Model domenowy

Zaprojektuj model w sposób modularny. Minimalne encje produkcyjne:

### 7.1 Profil i urządzenia

- profil użytkownika;
- rola;
- strefa czasowa;
- waluta raportowa;
- format daty/liczb;
- preferencje wyglądu;
- urządzenia i możliwość unieważnienia sesji;
- zaproszenia zarządzane przez administratora.

### 7.2 Konta tradingowe

- nazwa;
- typ: live/demo/prop/challenge/custom;
- broker;
- waluta bazowa;
- saldo początkowe;
- data rozpoczęcia;
- strefa czasowa;
- status aktywne/archiwalne;
- opcjonalny identyfikator zewnętrzny;
- operacje: wpłata, wypłata, opłata, korekta, transfer.

Każdą zmianę salda da się wyjaśnić przez saldo początkowe, operacje oraz zamknięte wykonania. Nie zapisuj niespójnych, ręcznie nadpisywanych sald bez śladu audytowego.

### 7.3 Instrumenty i profile brokera

- symbol wyświetlany i alias brokera;
- kategoria;
- waluta bazowa/kwotowana/waluta zysku;
- liczba miejsc dziesiętnych;
- tick size i tick value;
- contract size;
- pip size;
- minimalny, maksymalny i krokowy lot;
- wersja specyfikacji;
- konto/broker, dla którego obowiązuje;
- data obowiązywania.

Możesz zaproponować neutralną wyszukiwarkę popularnych symboli, ale nie zapisuj domyślnych wartości finansowych jako prawdy bez potwierdzenia użytkownika lub importu od brokera.

### 7.4 Strategie

Pierwsze uruchomienie: **zero strategii**.

Strategia zawiera:

- nazwę, opis, kolor i opcjonalną ikonę;
- aktywna/archiwalna;
- zasady wejścia, prowadzenia i wyjścia;
- potwierdzenia z wagą i flagą `wymagane`;
- własne pola typu tekst, liczba, wybór, wielokrotny wybór, checkbox, skala i data;
- progi jakości;
- wersję;
- snapshot użyty przy transakcji.

### 7.5 Transakcja i wykonania

Rozdziel pojęcie planu/transakcji od faktycznych wykonań.

Transakcja zawiera co najmniej:

- konto, instrument, strategię lub oznaczenie szkicu;
- kierunek BUY/SELL;
- stan: szkic, planowana, otwarta, częściowo zamknięta, zamknięta, anulowana, pominięta;
- daty i strefy czasowe;
- interwał, sesję, tagi;
- pierwotny SL, historię SL i poziomy TP;
- nogi wejścia i wyjścia;
- prowizję, swap i inne opłaty;
- planowane ryzyko oraz rzeczywiste ryzyko;
- notatki i załączniki;
- snapshot strategii/checklisty;
- pole jakości danych i konkretne ostrzeżenia;
- audyt zmian.

Obliczaj między innymi:

- średnią ważoną cenę wejścia i wyjścia;
- wolumen otwarty/zamknięty;
- gross i net P&L;
- wynik zrealizowany i niezrealizowany, jeśli są dane cenowe;
- ryzyko pieniężne i procentowe;
- planowane oraz zrealizowane R;
- planowane i wykonane RR;
- punkty/pipsy zgodnie ze specyfikacją;
- czas trwania;
- saldo przed/po w prawidłowym porządku zdarzeń;
- drawdown;
- jakość wykonania checklisty.

Wszystkie wzory opisz w `docs/metodyka-obliczen.md` i przetestuj przykładami dla BUY/SELL, częściowych wyjść, prowizji, różnych walut i błędnych danych.

## 8. Funkcje etapu pierwszego — wybór C: wszystkie 16 modułów

Etap pierwszy nie jest okrojonym MVP. Ma dostarczyć używalne, stabilne i połączone ze sobą wersje wszystkich 16 modułów wymienionych w decyzji nr 1. Moduły mają powstać od zera na nowej architekturze i nowym designie. Dopuszczalne jest pozostawienie najbardziej zaawansowanych analiz oraz automatyzacji na etap drugi, ale żaden z 16 modułów nie może być w etapie pierwszym atrapą, pustym przyciskiem ani samą makietą.

### 8.1 Uwierzytelnienie i onboarding

- logowanie zaproszonego użytkownika;
- bezpieczne ustawienie/reset hasła;
- opcjonalne MFA;
- pierwszy profil, strefa czasowa i waluta raportowa;
- utworzenie pierwszego konta;
- utworzenie lub potwierdzenie instrumentu;
- utworzenie pierwszej własnej strategii;
- możliwość pominięcia strategii i zapisania szkicu, ale z widocznym ostrzeżeniem;
- brak danych demo.

### 8.2 Dashboard

- szybki start i przycisk `Dodaj transakcję`;
- saldo i P&L dla wybranego konta/waluty;
- podstawowe KPI;
- krzywa kapitału;
- drawdown;
- wynik dzienny/miesięczny;
- najlepsze strategie i instrumenty dopiero, gdy istnieją dane;
- filtr okresu i konta;
- czytelne puste stany.

### 8.3 Transakcje

- pełne CRUD z archiwizacją/koszem;
- wyszukiwanie, sortowanie, filtrowanie, paginacja/wirtualizacja;
- autosave szkicu;
- wiele wejść i wyjść;
- dynamiczne pola wynikające ze strategii;
- checklista z snapshotem;
- podgląd obliczeń przed zapisem;
- jasne rozróżnienie błędu, ostrzeżenia i informacji;
- operacja zapisu atomowa;
- brak angielskich komunikatów i mojibake.

### 8.4 Konta, operacje finansowe, instrumenty i strategie

- pełna edycja, archiwizacja i bezpieczne usuwanie;
- wpłaty, wypłaty, korekty oraz powiązane transfery między kontami;
- historia zmian kluczowych parametrów;
- wersjonowanie strategii i instrumentów;
- walidacja unikalności w obrębie użytkownika;
- brak globalnego konfliktu nazw pomiędzy różnymi użytkownikami.

Moduł Strategie na nowym koncie jest pusty. Nie wolno dodawać Japan Attack, żadnych zapisanych szablonów ani przykładowych strategii. Użytkownik tworzy własną strategię od pustego formularza.

### 8.5 Smart Kalendarz

- widok miesiąca, tygodnia i dnia;
- dzienny P&L, liczba transakcji, oznaczenie wyniku i status kompletności wpisu;
- przejście z dnia do jego transakcji, notatek, emocji i screenshotów;
- filtrowanie według konta i waluty raportowej;
- poprawne działanie w strefie czasowej profilu;
- brak niejawnego sumowania różnych walut.

### 8.6 Raporty

- KPI wymienione w tej specyfikacji;
- filtry i zapisane widoki;
- miesięczny/dzienny P&L;
- equity i drawdown;
- porównanie kont, strategii i instrumentów;
- najlepsza/najgorsza transakcja;
- brak niejawnego sumowania walut;
- jawna metodyka obliczeń.

### 8.7 Eksporty i kopie zapasowe

- CSV UTF-8 z poprawną obsługą Excela;
- XLSX;
- PDF z osadzoną czcionką obsługującą polskie znaki;
- pełny JSON/ZIP do migracji;
- desktopowy szyfrowany backup obejmujący DB, pliki, ustawienia i manifest;
- weryfikacja i podgląd backupu;
- automatyczna polityka retencji, domyślnie rozsądna i konfigurowalna;
- backup przed każdą niebezpieczną operacją.

### 8.8 Zasady

- własne zasady użytkownika bez gotowych szablonów strategii;
- grupowanie na zasady wejścia, prowadzenia pozycji, wyjścia, ryzyka i dyscypliny;
- checklisty powiązane ze strategią lub używane niezależnie;
- snapshot odpowiedzi zapisany z transakcją;
- oznaczanie spełnienia, niespełnienia oraz braku zastosowania;
- podstawowy raport przestrzegania zasad i wpływu na wynik.

### 8.9 Notatki i statusy

- notatki do transakcji i dnia oraz prywatne notatki ogólne;
- autosave, wyszukiwanie, tagi i powiązania z innymi encjami;
- własne statusy procesu, oddzielone od wyniku finansowego;
- pełna edycja, archiwizacja, kosz i przywracanie;
- bezpieczne renderowanie treści bez surowego HTML.

### 8.10 Analiza emocjonalna

- rejestr emocji przed transakcją, w jej trakcie i po zamknięciu;
- rodzaj emocji, intensywność, opis wyzwalacza i wniosek;
- własne słowniki emocji bez wymuszania domyślnych wpisów;
- podstawowe zestawienie emocji względem wyniku, dyscypliny i strategii;
- brak udawania diagnozy medycznej lub psychologicznej.

### 8.11 Screenshoty

- prywatne załączniki `przed`, `w trakcie` i `po`;
- opis, metadane, suma kontrolna, podgląd i pobieranie;
- kolejka przesyłania offline, ponowienia i czytelny stan błędu;
- miękkie usuwanie, kosz i przywracanie;
- kompresja bez niszczenia oryginału, limity i walidacja pliku.

### 8.12 Asystent AI

- rzeczywiście działający, wymienny adapter dostawcy zamiast atrapy;
- możliwość użycia lokalnego modelu na desktopie oraz opcjonalnego zdalnego dostawcy po jawnej konfiguracji;
- na webie wywołania zdalne wyłącznie przez bezpieczny backend, bez ujawniania sekretu w bundle;
- użytkownik sam wybiera transakcje/dane, widzi podgląd zakresu i każdorazowo zatwierdza wysłanie;
- analiza wpisu, wykrywanie braków, pytania coachingowe i podsumowanie wybranego okresu;
- odpowiedzi AI są sugestią, nie zmieniają automatycznie danych ani statystyk;
- przy braku skonfigurowanego dostawcy moduł pokazuje polski kreator konfiguracji, a nie fałszywą odpowiedź;
- żadne dane nie są wysyłane w tle.

### 8.13 Kosz

- jeden czytelny kosz dla obsługiwanych encji i plików;
- filtrowanie, podgląd zależności, przywracanie i bezpieczne trwałe usunięcie;
- konfigurowalny okres retencji;
- trwałe usunięcie wymaga ponownego potwierdzenia i nie może uszkodzić historii finansowej.

### 8.14 Ustawienia

- profil, strefa czasowa, waluta raportowa, motyw i dostępność;
- ustawienia lokalne, synchronizacji, backupu, retencji i aktualizacji;
- konfiguracja kanału `stable`/`beta/internal` zgodnie z rolą;
- zarządzanie urządzeniami, sesjami i opcjonalnym dostawcą AI;
- numer wersji, diagnostyka, eksport danych oraz procedura usunięcia konta;
- ustawienia należą do spójnego modelu danych i backupu, a nie do rozsianych kluczy `localStorage`.

### 8.15 Centrum synchronizacji i aktualizacji

- status kolejki;
- ostatnia synchronizacja;
- ręczne ponowienie;
- lista błędów i konfliktów;
- zarządzanie urządzeniami;
- aktualna wersja aplikacji;
- kanał aktualizacji;
- notatki wydania po polsku;
- ręczne sprawdzenie aktualizacji obok automatycznego sprawdzania.

## 9. Funkcje etapu drugiego

Po produkcyjnym przejściu etapu pierwszego rozbudowuj istniejące, działające moduły. Etap drugi nie może służyć do dopiero pierwszego uruchomienia któregokolwiek z 16 wymaganych modułów.

1. zaawansowany Smart Kalendarz, dzienny plan i review;
2. pogłębiona analityka emocji, wzorców zachowania i dyscypliny;
3. zaawansowane zależności zasad, checklist i analityki przestrzegania planu;
4. adnotacje na screenshotach i porównanie `przed/po`;
5. cele, limity dzienne i kontrolę overtradingu;
6. zaawansowane raporty sesji, godzin, dni tygodnia, jakości setupu i psychologii;
7. kreator importu CSV/XLSX;
8. import historii MT5, a później opcjonalny konektor tylko do odczytu;
9. zaawansowane możliwości Asystenta AI, pamięć wyłącznie za zgodą i kolejne wymienne adaptery;
10. analizę jakości danych i sugestie uzupełnienia braków;
11. panel właściciela do zaproszeń, unieważniania dostępu i stanu wydań;
12. ewentualną wersję macOS, dopiero po osobnej decyzji.

Funkcje etapu drugiego muszą być za feature flags i nie mogą destabilizować rdzenia.

## 10. Design i UX

Zaprojektuj całkowicie nowy wygląd. Nie kopiuj poprzedniej nawigacji, proporcji ani kart.

### Kierunek wizualny

- premium financial dashboard;
- domyślnie głęboki grafit/granat zamiast czystej czerni;
- czytelne warstwy i subtelne obramowania;
- kontrolowany kolor akcentu, domyślnie elegancki złoty lub chłodny niebieski;
- duże, czytelne liczby KPI;
- odpowiednia ilość oddechu, ale bez pustych połaci;
- czytelna hierarchia zamiast kilkunastu identycznych kart;
- oszczędne animacje 120–220 ms i respektowanie `prefers-reduced-motion`;
- brak neonowego chaosu, przesadnego glassmorphism i ozdobników kosztem danych.

### Nawigacja

- desktop: zwijany sidebar lub dobrze zaprojektowana nawigacja hybrydowa;
- mobile: dolna nawigacja dla kluczowych sekcji i menu pozostałych;
- globalna wyszukiwarka/command palette;
- łatwy powrót do Dashboardu;
- najważniejsze działanie `Dodaj transakcję` dostępne z każdego głównego ekranu.

### Język i formatowanie

- wszystkie widoczne teksty po polsku;
- pełne kodowanie UTF-8;
- test automatyczny wykrywający typowe mojibake: `Ä`, `Å`, `â€“`, `â€™` w zasobach polskiego UI;
- polskie formaty domyślne i możliwość zmiany formatowania;
- teksty trzymaj w jednym systemie zasobów, a nie rozsiane po komponentach;
- techniczne kody typu `BUY/SELL` mogą być pokazywane wraz z polskim opisem `Kupno/Sprzedaż`.

Przygotuj prototyp kluczowych ekranów w Storybooku i wykonaj regresję wizualną, ale nie zatrzymuj pracy na makietach.

## 11. Autoaktualizacje i wydawanie

### 11.1 Desktop

- Użyj oficjalnego Tauri updatera.
- Manifest i pobieranie wyłącznie przez HTTPS.
- Każdy artefakt aktualizacji musi posiadać podpis wymagany przez Tauri.
- Publiczny klucz jest w aplikacji; prywatny klucz wyłącznie w zabezpieczonym CI.
- Sprawdzenie aktualizacji po starcie nie może blokować uruchomienia ani pracy offline.
- Pobieranie ma pokazywać postęp i obsługiwać przerwanie sieci.
- Instalacja dopiero po zakończeniu zapisów, checkpoint bazy i utworzeniu zweryfikowanego backupu.
- Testuj aktualizację co najmniej `n -> n+1` wraz z migracją DB i zachowaniem danych.
- Utrzymuj kanały `stable` i `beta/internal` z oddzielnymi manifestami.
- Zaimplementuj ochronę przed downgrade'em bez jawnego trybu awaryjnego.

### 11.2 Podpis Windows

- Przygotuj pipeline Authenticode zgodny z aktualną oficjalną dokumentacją Tauri.
- Certyfikat/klucz nie trafia do repozytorium.
- Jeśli właściciel nie posiada jeszcze certyfikatu, dostarcz działający build testowy oraz konkretną polską instrukcję uzyskania i podłączenia certyfikatu; nie nazywaj wtedy wydania „produkcyjnie podpisanym”.

### 11.3 Web/PWA

- Zasoby z content hash i bezpiecznym cache-control.
- Service worker wykrywa wersję i informuje po polsku.
- Backend utrzymuje kompatybilność co najmniej z bieżącą i poprzednią stabilną wersją klienta w okresie aktualizacji.
- Migracje serwera stosuj w kolejności expand -> migrate -> contract, aby stare klienty nie przestały nagle działać.

### 11.4 CI/CD

Prywatne GitHub repo i GitHub Actions:

- lint, format, typecheck;
- testy jednostkowe/integracyjne;
- testy Rust;
- testy SQL/RLS;
- build web;
- build Windows na runnerze Windows;
- E2E;
- skan zależności i sekretów;
- SBOM dla wydania;
- podpis aktualizatora;
- Authenticode, gdy sekret/certyfikat jest skonfigurowany;
- publikacja artefaktów dopiero po przejściu bramek;
- ręczne zatwierdzenie produkcyjnego kanału `stable`.

## 12. Bezpieczeństwo i prywatność

1. Model zagrożeń w `docs/model-zagrozen.md`.
2. RLS i testy prób dostępu użytkownika A do danych użytkownika B.
3. Brak service-role key i prywatnych sekretów w bundle web/desktop.
4. Ścisłe Tauri capabilities, CSP, dozwolone domeny i zakresy systemu plików.
5. Walidacja wszystkich payloadów na kliencie i serwerze.
6. Parametryzowane zapytania; brak składania SQL z wejścia użytkownika.
7. Limity plików, MIME sniffing, losowe nazwy, checksumy i prywatny storage.
8. Ochrona przed XSS; nie renderuj surowego HTML z notatek/AI.
9. Rate limiting dla logowania, zaproszeń, sync i uploadu.
10. Maskowanie sekretów i danych tradingowych w logach.
11. Eksport diagnostyczny pokazuje użytkownikowi zakres przed utworzeniem.
12. Usunięcie konta wymaga ponownego uwierzytelnienia, okresu ochronnego i wcześniejszej możliwości eksportu.
13. Backupy szyfrowane nowoczesnym algorytmem uwierzytelnionym; klucz nie może być zapisany obok archiwum.
14. Mechanizm szyfrowania lokalnej bazy musi być stabilny, wspierany na Windows x64 i objęty testem świeżej instalacji, aktualizacji oraz odzyskania. Nie wprowadzaj kruchego „własnego szyfrowania”.

## 13. Jakość kodu i testy

### Obowiązkowe testy

- domenowe wzory P&L, RR, R, saldo, drawdown i wielowalutowość;
- wiele wejść/wyjść, częściowe zamknięcie i prowizje;
- atomowy zapis złożonej transakcji;
- rollback po wymuszonym błędzie w połowie operacji;
- outbox, ponowienia, duplikat mutation ID, kolejność pull i tombstones;
- praca offline i synchronizacja po odzyskaniu sieci;
- konflikt tej samej transakcji na web i desktop;
- izolacja RLS;
- migracje DB na fixture każdej opublikowanej wersji;
- backup, uszkodzony backup, zły klucz, brak miejsca i bezpieczne przywracanie;
- signed update `n -> n+1` na Windows;
- PWA update podczas otwartego formularza;
- polskie znaki w UI, eksporcie CSV/XLSX/PDF i backupie;
- brak strategii po utworzeniu nowego użytkownika;
- dostępność klawiaturą i podstawowe reguły WCAG;
- regresja wizualna kluczowych ekranów;
- duża historia transakcji, np. 50 000 rekordów, bez zamrażania UI.

### Narzędzia

- Vitest dla logiki TypeScript;
- Testing Library dla komponentów;
- Playwright dla web/PWA E2E i regresji wizualnej;
- stabilne rozwiązanie E2E Tauri na Windows, np. WebdriverIO + `tauri-driver`, jeśli jest oficjalnie wspierane i stabilne;
- Rust testy i testy integracyjne repository;
- pgTAP/testy Supabase dla RLS i funkcji;
- testy kontraktowe API/synchronizacji.

Nie licz samego procentu coverage jako dowodu jakości. Dla krytycznej domeny, synchronizacji, migracji i backupu wymagana jest wysoka pokrywalność scenariuszy oraz testy błędów.

## 14. Wydajność i niezawodność

- Pierwszy interaktywny ekran desktop/web na typowym sprzęcie bez nieuzasadnionych opóźnień.
- Dashboard nie pobiera całej historii, gdy wystarczy agregacja.
- Tabele wirtualizowane i zapytania indeksowane.
- Analiza planów zapytań dla raportów krytycznych.
- Operacje długie posiadają postęp, anulowanie, timeout i sensowny retry.
- UI nie może zawieszać się podczas eksportu, backupu, synchronizacji i importu.
- Crash lub utrata zasilania nie może pozostawić połowy transakcji.
- Po awarii pokaż możliwość odzyskania szkicu.
- Lokalne logi mają rotację i nie rosną bez limitu.
- Dodaj health check bazy, storage, synchronizacji i aktualizatora.

## 15. Podział realizacji na dwa główne etapy

### ETAP I — solidne fundamenty i używalny produkt

#### Kamień 0: repozytorium i decyzje

- monorepo;
- specyfikacja i ADR;
- konfiguracja środowisk;
- CI bez publikacji;
- threat model;
- definicja danych i kontraktów;
- pusty seed produkcyjny bez strategii.

**Brama:** czysty build, test przykładowy na każdej warstwie, skan sekretów, dokumentacja uruchomienia.

#### Kamień 1: wspólny shell i design system

- routing, layout responsywny, motyw ciemny/jasny;
- polski system tekstów;
- onboarding i logowanie;
- stany: loading/empty/error/offline;
- Storybook kluczowych komponentów.

**Brama:** web i Tauri uruchamiają ten sam spójny shell; testy polskich znaków i dostępności.

#### Kamień 2: dane lokalne, backend i synchronizacja

- schemat PostgreSQL/RLS;
- SQLite desktop;
- IndexedDB web;
- repository;
- outbox/push/pull;
- Centrum synchronizacji;
- konflikty;
- prywatne pliki;
- invite-only auth.

**Brama:** test automatyczny tworzy dane offline na desktopie/webie, odzyskuje sieć, synchronizuje i potwierdza brak duplikatów oraz izolację użytkowników.

#### Kamień 3: rdzeń dziennika

- konta i operacje;
- instrumenty;
- puste strategie tworzone przez użytkownika;
- transakcje z wieloma wejściami/wyjściami;
- obliczenia;
- historia, kosz i szkice;
- screenshoty podstawowe.

**Brama:** użytkownik może przejść pełną ścieżkę od pustego konta do zamkniętej, zsynchronizowanej transakcji i poprawnego salda.

#### Kamień 4: dashboard, kalendarz, raporty, eksport i backup

- dashboard;
- raporty podstawowe;
- kalendarz podstawowy;
- CSV/XLSX/PDF/JSON;
- szyfrowane backupy i restore;
- diagnostyka.

**Brama:** wyniki są zgodne z niezależnymi fixture'ami obliczeniowymi, eksporty zawierają polskie znaki, restore odtwarza wszystkie dane i pliki.

#### Kamień 5: pozostałe moduły bazowe wyboru C

- zasady i checklisty powiązane z transakcjami;
- notatki i własne statusy;
- analiza emocjonalna;
- pełny moduł screenshotów;
- działający Asystent AI z kontrolą zakresu i prywatności;
- spójny Kosz;
- kompletne Ustawienia.

**Brama:** wszystkie 16 modułów są dostępne na web/PWA i desktopie, zapisują oraz synchronizują dane zgodnie z uprawnieniami, mają obsłużone puste/błędne/offline stany i nie zawierają atrap ani nieaktywnych przycisków.

#### Kamień 6: instalator i autoaktualizacja

- NSIS Setup.exe;
- stabilny/beta manifest HTTPS;
- podpisy Tauri;
- pipeline code signing;
- aktualizacja web/PWA;
- test `n -> n+1`;
- backup i migracja przed update.

**Brama:** instalacja na czystym Windows, uruchomienie offline, aktualizacja do kolejnej wersji i zachowanie danych.

#### Kamień 7: release candidate etapu I

- pełne E2E;
- testy wydajności;
- testy bezpieczeństwa;
- instrukcja użytkownika;
- instrukcja administratora;
- lista znanych ograniczeń;
- paczka release candidate dla właściciela.

**Brama:** wszystkie kryteria etapu I spełnione; zero otwartych błędów krytycznych i wysokich związanych z utratą danych, auth, RLS, backupem, synchronizacją lub aktualizacją.

### ETAP II — funkcje zaawansowane

Realizuj dopiero po zatwierdzeniu stabilności etapu I. Każdy moduł jako osobny feature flag, migracja, testy i release beta przed stable.

Kolejność:

1. zaawansowany kalendarz i dzienne review;
2. pogłębiona analityka psychologii i emocji;
3. zaawansowane zasady/checklisty/analityka dyscypliny;
4. adnotacje screenshotów;
5. cele, limity i alerty zachowania;
6. zaawansowane raporty;
7. kreator importu;
8. integracja MT5 tylko do odczytu;
9. zaawansowana rozbudowa AI z zachowaniem prywatności;
10. ewentualne kolejne platformy.

## 16. Dokumentacja i artefakty końcowe

Dostarcz:

- kompletne prywatne repozytorium;
- `README.md` po polsku;
- `docs/specyfikacja-produktu.md`;
- `docs/stan-projektu.md`;
- `docs/architektura.md` z diagramami;
- `docs/metodyka-obliczen.md`;
- `docs/synchronizacja.md`;
- `docs/model-zagrozen.md`;
- `docs/backup-i-odzyskiwanie.md`;
- `docs/aktualizacje-i-wydania.md`;
- `docs/instrukcja-uzytkownika.md`;
- `docs/instrukcja-administratora.md`;
- `docs/decyzje-architektoniczne.md`/ADR;
- `.env.example` bez sekretów;
- migracje i seedy bez strategii/danych demo;
- skrypty dev/test/build/release;
- web/PWA build;
- Windows `Setup.exe`;
- manifesty updatera dla stable/beta;
- SBOM;
- raport przejścia testów;
- listę znanych ograniczeń i jawnych blokad zewnętrznych.

## 17. Kryteria końcowego odbioru

Projekt nie jest ukończony, dopóki nie potwierdzisz dowodami, że:

1. Etap I zawiera działające wersje wszystkich 16 modułów określonych w decyzji nr 1, bez atrap i martwych przycisków.
2. Nowy użytkownik po zalogowaniu ma dokładnie zero strategii.
3. W kodzie produkcyjnym i seedach nie istnieje Japan Attack ani inny szablon strategii.
4. Użytkownik sam tworzy strategię i używa jej w transakcji.
5. Zasady, statusy, emocje, notatki i screenshoty są rzeczywiście powiązane z transakcjami i raportami, a nie działają jako martwe listy.
6. Asystent AI działa po skonfigurowaniu dostawcy, nie ujawnia sekretów, pokazuje zakres danych i niczego nie wysyła bez zgody.
7. Każdy widoczny tekst jest po polsku i nie zawiera uszkodzonych znaków.
8. Web, PWA i desktop wykorzystują wspólną domenę i design system.
9. Desktop działa offline i zapisuje dane lokalnie.
10. Web/PWA działa w ograniczonym trybie offline po wcześniejszym logowaniu.
11. Zmiany z obu wersji synchronizują się po odzyskaniu sieci.
12. Powtórzona mutacja nie tworzy duplikatu.
13. Konflikt nie powoduje cichej utraty danych.
14. RLS uniemożliwia dostęp pomiędzy użytkownikami.
15. Złożona transakcja zapisuje się atomowo.
16. Częściowe wyjścia i opłaty liczą się poprawnie.
17. Nie są sumowane nieprzeliczone waluty.
18. Backup obejmuje dane, ustawienia i pliki, przechodzi weryfikację i restore.
19. Aktualizacja desktopowa korzysta z HTTPS i podpisu.
20. Testowa aktualizacja `n -> n+1` zachowuje bazę i pliki.
21. Web/PWA aktualizuje się bez utraty otwartego formularza.
22. Produkcyjny instalator może zostać podpisany Authenticode; brak certyfikatu jest jedyną dopuszczalną jawną blokadą zewnętrzną, jeśli użytkownik go nie dostarczył.
23. CI odtwarza build ze świeżego checkoutu.
24. Wszystkie krytyczne testy przechodzą na Windows i dla web.
25. Użytkownik otrzymuje instrukcję instalacji, aktualizacji, backupu, restore i zapraszania kolejnych osób.
26. Nie ma otwartych błędów krytycznych/wysokich związanych z utratą danych lub bezpieczeństwem.

## 18. Zakazane skróty

Nie wolno:

- dostarczyć tylko makiety;
- użyć `localStorage` jako głównej bazy;
- wykonać synchronizacji przez proste „ostatni zapis wygrywa” bez zachowania konfliktu;
- przechowywać pieniędzy jako niekontrolowany `float`;
- sumować PLN, USD i EUR bez konwersji;
- wpisać updatera na localhost i nazwać go działającym dla użytkowników;
- użyć HTTP w produkcji;
- trzymać prywatnego klucza updatera, Authenticode lub service-role w repo;
- wyłączyć weryfikacji podpisu aktualizacji;
- użyć biblioteki alpha/beta jako krytycznego fundamentu bez osobnej zgody użytkownika;
- udostępnić bucket screenshotów publicznie;
- omijać RLS;
- zapisywać złożonej transakcji wieloma niezależnymi operacjami bez transakcji DB;
- ukrywać błędów przez puste `catch`;
- ignorować ostrzeżeń TypeScript/Rust/lintera bez uzasadnienia;
- umieszczać strategii demo lub Japan Attack;
- mieszać polskiego i angielskiego UI;
- deklarować produkcyjnej gotowości bez testu świeżej instalacji i aktualizacji;
- tworzyć systemu handlującego automatycznie na rachunku — to dziennik, nie bot transakcyjny.

## 19. Pierwsza czynność agenta

1. Przeczytaj cały dokument.
2. Utwórz repozytorium i zapisz specyfikację w `docs/specyfikacja-produktu.md`.
3. Przygotuj po polsku zwięzły plan Kamienia 0 i listę zewnętrznych danych, które będą potrzebne później: domena, Supabase, Cloudflare, GitHub, certyfikat Authenticode.
4. Nie czekaj z lokalną implementacją na te dane. Użyj bezpiecznego środowiska developerskiego i `.env.example`.
5. Zbuduj Kamień 0, uruchom testy i przedstaw dowody.
6. Następnie kontynuuj przez kolejne kamienie etapu I, zatrzymując się tylko przy krytycznej blokadzie wymagającej decyzji lub sekretu użytkownika.

## 20. Oficjalne źródła, które należy zweryfikować przed implementacją

- Tauri updater: https://v2.tauri.app/plugin/updater/
- Tauri Windows code signing: https://v2.tauri.app/distribute/sign/windows/
- Tauri capabilities: https://v2.tauri.app/security/capabilities/
- Tauri CSP: https://v2.tauri.app/security/csp/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase database testing: https://supabase.com/docs/guides/database/testing

Korzystaj z aktualnej oficjalnej dokumentacji. Jeśli zachowanie biblioteki lub usługi zmieniło się względem tej specyfikacji, zachowaj wymagany rezultat bezpieczeństwa i opisz różnicę w ADR po polsku.
