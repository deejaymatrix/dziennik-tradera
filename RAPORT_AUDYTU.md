# Raport końcowy audytu — A7

Data: 2026-07-23. Zakres: cała aplikacja po przebudowie z bloku C (Q1–Q10).

Audyt był warunkiem przejścia do instalatora (sekcja 20 promptu: „nie przechodź do
autoaktualizacji ani instalatora, dopóki audyt nie zostanie ukończony"). Ten dokument
zamyka blok D.

---

## Macierz audytowa

| Obszar                          | Metoda                                                                                                                      | Wynik | Znaleziono                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------ |
| **A1 — wygląd, oba motywy**     | Pomiar kontrastu na żywo w przeglądarce, na wyliczonych wartościach tokenów; sprawdzenie przepełnień w 1366×768 i 1920×1080 | ✅    | **5 naruszeń WCAG AA**         |
| **A2 — jak końcowy użytkownik** | Pełny stos usług (`init_db_state`) na prawdziwym SQLite, cztery warianty bazy                                               | ✅    | 0                              |
| **A3 — wartości graniczne**     | 14 testów na pełnym stosie, przypadki z sekcji 20.2                                                                         | ✅    | 0                              |
| **A4 — obliczenia finansowe**   | 16 niezależnych rachunków referencyjnych wyprowadzonych z definicji                                                         | ✅    | **1 pułapka konwencji (swap)** |
| **A5 — kod**                    | 206 plików, 26 klas defektów przez całe drzewo                                                                              | ✅    | **6 błędów**                   |
| **A6 — narzędzia**              | prettier, ESLint, typecheck, vitest, cargo fmt, clippy, cargo test                                                          | ✅    | 3 usuwalne ostrzeżenia         |

**Razem: 12 znalezisk, wszystkie zamknięte.**

---

## Co audyt faktycznie znalazł

Najważniejsze jest to, czego **nie** wykryłyby testy jednostkowe pisane przy okazji
poszczególnych funkcji — bo każda z nich z osobna działała poprawnie.

### Błędy, które widziałby użytkownik

1. **Dashboard i wszystkie raporty konta wywalały się** na pozycji domkniętej w całości
   częściowymi zamknięciami. Sześć miejsc zakładało gwarancję, której nie było.
   Ta sama sytuacja była już raz naprawiona w saldzie, ale poprawka nie została
   przeniesiona do statystyk.
2. **Krzywa kapitału i kalendarz po cichu pomijały** tę samą pozycję — bez paniki,
   bez komunikatu, po prostu rozjeżdżały się z saldem konta.
3. **Cztery miejsca liczyły pieniądze binarnym `float`** na froncie, w tym wiersz
   podsumowania w porównaniu kont. Kwoty przychodzą z Rusta jako napisy właśnie po to,
   żeby tam nie trafiały.
4. **Wyłączenie ustawienia „zapamiętuj filtry" nic nie czyściło** — ponowne włączenie
   przywracało zakres sprzed miesięcy.
5. **Pięć par kolorów nie spełniało WCAG AA**, w tym kolor etykiet pól i podpowiedzi
   w obu motywach.

### Pułapka, która nie jest błędem

**Swap** jest liczony jako koszt, tak samo jak prowizja — wartość dodatnia zmniejsza
wynik. Konwencja jest spójna i **nie została zmieniona**: odwrócenie znaku przeliczyłoby
po cichu każdą już zapisaną transakcję ze swapem. Problem w tym, że platformy handlowe
pokazują swap odwrotnie (ujemny = naliczony), więc przepisanie „−3,20" z historii brokera
zawyżyłoby wynik o podwójną kwotę. Pole dostało podpowiedź mówiącą wprost, w którą stronę
wpisywać, a test opisuje konwencję i pilnuje, żeby matematyka nie zmieniła się przypadkiem.

To jest miejsce, w którym warto, żeby użytkownik świadomie potwierdził, że konwencja mu
odpowiada — bo dotyczy danych, które już wprowadził.

---

## Czego audyt NIE objął

Uczciwie, żeby nie było złudzeń co do zakresu:

- **Klikanie po żywej aplikacji Tauri z danymi.** A2 przechodzi przez ten sam stos usług
  co aplikacja, na prawdziwej bazie po prawdziwych migracjach — ale wywołuje go z testów,
  nie z interfejsu. Podgląd w przeglądarce nie ma backendu Tauri, więc widoki zależne od
  danych renderują tam wyłącznie stan błędu. Warstwa wizualna została sprawdzona na tym,
  co da się wyrenderować bez backendu: nawigacja, motywy, kontrast, siatka, stany puste
  i błędu.
- ~~**Import uszkodzonego pliku, uszkodzona kopia zapasowa, brak dostępu do pliku.**~~
  **Uzupełnione po raporcie:** 13 nowych testów. Kopia zapasowa broni się w ośmiu wariantach
  uszkodzenia (brak manifestu, brak bazy, manifest niebędący JSON-em, ucięta baza ze ZGODNĄ sumą
  kontrolną, zawartość niebędąca bazą SQLite, brak pliku, pusty plik) i odrzucone archiwum nie
  zostawia oczekującego przywrócenia, więc następny start nie podmieni działającej bazy. Import
  CSV odrzuca wiersze krótsze i dłuższe od nagłówka, puste i złożone z pustych wartości, a polskie
  znaki w opisach przechodzą bez zniekształcenia. Żaden z tych wariantów nie ujawnił błędu —
  weryfikacja była już poprawna, brakowało tylko dowodu.
- **Brak internetu.** Sprawdzanie aktualizacji ma wyciszony błąd (celowo), ale nie było
  testowane przy odciętej sieci.

---

## Stan narzędzi

| Narzędzie                    | Wynik                                |
| ---------------------------- | ------------------------------------ |
| `prettier --check`           | czysto                               |
| ESLint                       | **0 błędów**, 8 ostrzeżeń            |
| `tsc --noEmit`               | **0 błędów**                         |
| vitest                       | **153 testy**, wszystkie przechodzą  |
| `cargo fmt --check`          | czysto                               |
| `cargo clippy --all-targets` | **0 błędów**                         |
| `cargo test`                 | **390 testów**, wszystkie przechodzą |

Osiem ostrzeżeń ESLint to wyłącznie `react-refresh/only-export-components` — dotyczą
granulacji hot reloadu w trybie deweloperskim, nie poprawności ani produkcyjnego builda.
Rozbijanie działających plików na dodatkowe moduły tylko po to, żeby je uciszyć,
pogorszyłoby kod bez żadnego zysku dla użytkownika.

---

## Zabezpieczenia przed powrotem błędów

Każde znalezisko ma test, który wywali się, jeśli błąd wróci:

| Znalezisko                     | Test                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Panika statystyk               | `trade_stats::tests::statystyki_nie_wywracaja_sie_na_pozycji_bez_daty_zamkniecia` |
| Ciche pomijanie pozycji        | `trade_stats::tests::pozycja_bez_daty_zamkniecia_wchodzi_do_rozbic`               |
| `float` na pieniądzach (Rust)  | `audyt::pieniadze_bez_float` — skanuje 5 modułów domenowych                       |
| `float` na pieniądzach (front) | `decimal.test.ts` — 300 kwot sumowanych bez dryfu                                 |
| Kontrast WCAG                  | `tokens.test.ts` — 24 kombinacje czytane wprost z `tokens.css`                    |
| Konwencja swapu                | `audyt::obliczenia_referencyjne::swap_jest_kosztem_tak_jak_prowizja`              |
| Czyszczenie filtrów            | `reportFilterMemory.test.ts`                                                      |
| Jasne tło PDF                  | `pdf_report::tests::pdf_nie_maluje_zadnego_tla_ani_koloru`                        |

---

## Wniosek

Blok D zamknięty. Warunek z sekcji 20 promptu — „nie przechodź do instalatora, dopóki
audyt nie zostanie ukończony" — jest spełniony.

Pozostaje **blok E (instalator)**, zablokowany nie przez kod, tylko przez brak certyfikatu
Authenticode. Bez niego Windows SmartScreen ostrzeże przy każdej instalacji. To decyzja
użytkownika, nie techniczna przeszkoda po stronie aplikacji.

Szczegóły audytu kodu i pełna lista sprawdzonych plików: [AUDYT_KODU.md](AUDYT_KODU.md).
