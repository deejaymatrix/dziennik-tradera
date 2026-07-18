# Metodyka obliczeń

> **Status: szkic wstępny (Kamień 0).** Konkretne wzory, ich implementacja w `packages/domain` i testy na przykładach (BUY/SELL, częściowe wyjścia, prowizje, różne waluty, dane błędne) powstaną w Kamieniu 3 razem z rdzeniem transakcji. Ten dokument definiuje na razie zakres i zasady, nie kompletne wzory.

## 1. Zasady ogólne

- Wszystkie obliczenia pieniężne i cenowe wykonywane na typach dziesiętnych (`decimal.js`), nigdy na surowym `number` (zob. ADR-0004 w `docs/decyzje-architektoniczne.md`).
- Brak danych wejściowych wymaganych do obliczenia (np. niepełna specyfikacja instrumentu) → wynik oznaczony jako niewiarygodny z jawnym wskazaniem brakującego pola, nigdy wartość zmyślona (§4 decyzja 23 specyfikacji).
- Waluty nie są sumowane bez jawnego kursu przeliczenia i wskazania waluty raportowej (§4 decyzja 26).
- Czas zapisywany w UTC, prezentowany w strefie profilu użytkownika; pierwotna strefa transakcji zachowana osobno (§4 decyzje 39-40).

## 2. Zakres wzorów do zdefiniowania w Kamieniu 3

- Średnia ważona cena wejścia i wyjścia (przy wielu nogach).
- Wolumen otwarty / zamknięty.
- Gross P&L i Net P&L (z uwzględnieniem prowizji, swapu, innych opłat).
- Wynik zrealizowany vs. niezrealizowany.
- Ryzyko pieniężne i procentowe (na podstawie SL i wolumenu).
- R planowane i zrealizowane; RR planowane i wykonane.
- Przeliczenie punktów/pipsów zgodnie ze specyfikacją instrumentu (tick size, pip size, contract size).
- Czas trwania transakcji.
- Saldo przed/po w poprawnej chronologii zdarzeń (uwzględniając operacje finansowe konta).
- Drawdown (na poziomie konta i zestawu transakcji).
- Ocena jakości wykonania checklisty strategii.

## 3. Wymagane przypadki testowe (Kamień 3)

- BUY i SELL z pojedynczym wejściem/wyjściem.
- Wiele wejść (uśrednianie ceny) i wiele wyjść (częściowe zamknięcia).
- Transakcja z prowizją i swapem.
- Transakcja w walucie innej niż waluta raportowa konta.
- Niepełna specyfikacja instrumentu → oczekiwane oznaczenie „obliczenie niewiarygodne”.
- Transakcja anulowana/pominięta — brak wpływu na saldo i statystyki.

## 4. Status

Dokument zostanie rozbudowany o konkretne wzory matematyczne i odniesienia do implementacji (`packages/domain/src/...`) w Kamieniu 3.
