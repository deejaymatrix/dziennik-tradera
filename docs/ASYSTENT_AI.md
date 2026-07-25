# Asystent AI — przewodnik użytkownika

Asystent AI w Dzienniku Tradera pomaga zrozumieć **dlaczego** wyniki wyglądają tak, jak wyglądają:
szuka wzorców, powtarzalnych błędów i zależności między emocjami a wynikami. Deterministyczne
raporty pokazują CO się stało — Asystent AI dokłada interpretację.

## Najważniejsze: działa w całości lokalnie

- Model AI uruchamia się **na Twoim komputerze** — bez konta, bez klucza API, bez wysyłania Twoich
  transakcji do internetu i bez telemetrii.
- Po jednorazowym pobraniu modelu analiza i czat działają **offline**.
- Twoje dane nie opuszczają aplikacji. Rozmowy z czatem nie są nigdzie zapisywane.

## Jak zacząć

1. Wejdź w **Ustawienia → Asystent AI** i włącz przełącznik **„Asystent AI włączony"**.
2. Wybierz model i kliknij **„Pobierz wybrany model"**. To jednorazowe pobranie kilku GB
   (domyślny model to ok. 4,7 GB). Pobieranie można przerwać i wznowić; plik jest sprawdzany sumą
   kontrolną, więc uszkodzony nigdy nie zostanie uznany za gotowy.
3. Gdy model jest gotowy, w aplikacji pojawiają się przyciski analizy i czat.

Model możesz w każdej chwili **usunąć** albo **pobrać ponownie** w tych samych ustawieniach.
Zajęte miejsce na dysku jest tam pokazane.

## Co potrafi

- **Analiza pojedynczej transakcji** — przycisk „Przeanalizuj z AI" w szczegółach transakcji. Wynik
  jest zapisywany (obejmuje go kopia zapasowa). Jeśli po analizie zmienisz dane transakcji,
  pojawia się baner „analiza nieaktualna" — wystarczy przeanalizować ponownie.
- **Analiza wybranego zakresu** — na ekranie **Raporty** przycisk „Przeanalizuj ten zakres z AI"
  bierze dokładnie ten zakres, który widzisz (okres, konto, instrument, strategia, interwał,
  kierunek) i szuka wzorców w całości.
- **Analiza całego konta, analiza emocjonalna i audyt zachowania** — na stronie **Asystent AI**.
  Analiza emocjonalna szuka zależności emocja↔wynik (np. czy przy określonej emocji wyniki są
  gorsze od Twojej średniej). Audyt zachowania ocenia skłonność do overtradingu, łamania zasad,
  handlu „na rewanż" po stracie oraz reakcji na serie strat/zysków.
- **Czat po własnych danych** — zadawaj pytania o wybrane konto (np. „Które strategie wychodzą mi
  najlepiej?"). Model odpowiada **wyłącznie** na podstawie policzonych danych i nie zmyśla liczb.

## Jak czytać wynik

Każda analiza ma pięć sekcji:

1. **Fakty** — twarde ustalenia z danych.
2. **Obserwacje** — wnioski wynikające z faktów.
3. **Hipotezy** — ostrożne przypuszczenia wymagające potwierdzenia.
4. **Rekomendacje** — konkretne kroki.
5. **Jakość danych** — ostrzeżenia (np. mała próba), żebyś wiedział, na ile ufać wnioskom.

Wynik możesz **skopiować do schowka** — kopia zawiera też nagłówek z opisem zakresu i użytym
modelem, więc wklejka w dzienniku jest samodzielna. Zapisane analizy transakcji znajdziesz w
sekcji **Historia analiz** (z możliwością usunięcia pojedynczo albo wszystkich).

## Ustawienia stylu

W **Ustawienia → Asystent AI** ustawisz **język odpowiedzi** (polski/angielski) oraz
**szczegółowość** (zwięźle / standardowo / szczegółowo). Zmiana działa od następnej analizy.

## Zasady i ograniczenia

- **Wszystkie liczby liczy aplikacja, nie model.** Model dostaje gotowe, policzone wartości (wynik,
  R, ryzyko, rozbicia, sygnały) i tylko je interpretuje — nigdy nie liczy sam.
- Wynik to **interpretacja, nie gwarantowana porada finansowa**. Asystent nie stawia diagnoz
  medycznych ani psychologicznych.
- Przy **małej liczbie transakcji** wnioski bywają przypadkowe — Asystent to sygnalizuje w sekcji
  „Jakość danych", a przy czacie widzisz podstawę (liczbę zamkniętych transakcji) i ostrzeżenie.
- Twoje **notatki i nazwy** (strategii, instrumentów, emocji) są traktowane jako dane do analizy,
  nigdy jako polecenia dla modelu.
- Naraz wykonuje się **jedna** analiza; długą można **przerwać**. Zamknięcie aplikacji nie zostawia
  niczego działającego w tle.

## Gdy coś nie działa

- Przyciski analizy są ukryte, dopóki Asystent AI jest wyłączony albo model niepobrany — sprawdź
  **Ustawienia → Asystent AI**.
- Pierwsza analiza po uruchomieniu bywa wolniejsza (model się rozgrzewa); kolejne są szybsze.
- Analiza całości potrzebuje co najmniej jednej **zamkniętej** transakcji w wybranym zakresie.
