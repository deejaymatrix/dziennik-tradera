# Wybór modelu — Asystent AI (Etap 1)

Ten dokument opisuje **rzeczywisty benchmark** trzech kandydatów na lokalny model Asystenta AI,
przeprowadzony 2026-07-25 na tej samej maszynie, z tym samym promptem, tą samą kwantyzacją
(Q4_K_M) i tym samym silnikiem (`llama-cpp-2` / `llama.cpp`, CPU). Wynik nie jest zgadywany -
każda liczba niżej pochodzi z realnego uruchomienia zapisanego w
`apps/desktop/src-tauri/src/infrastructure/ai_inference.rs::benchmark_wyboru_modelu`.

## Kandydaci

| Kandydat                                           | Licencja   | Rozmiar pliku (Q4_K_M) |
| -------------------------------------------------- | ---------- | ---------------------- |
| Bielik-11B-v2.3-Instruct (SpeakLeash/ACK Cyfronet) | Apache 2.0 | 6,72 GB                |
| Qwen2.5-7B-Instruct (Alibaba/Qwen)                 | Apache 2.0 | 4,68 GB                |
| Qwen2.5-1.5B-Instruct (Alibaba/Qwen)               | Apache 2.0 | 0,94 GB                |

**Świadomie pominięty `Qwen2.5-3B-Instruct`** z pierwotnego planu — jego rzeczywista licencja na
Hugging Face to `qwen-research` (ograniczenia komercyjne), nie Apache 2.0, więc nie kwalifikuje się
do dystrybucji z aplikacją. `Qwen2.5-1.5B-Instruct` (naprawdę Apache 2.0) zajął jego miejsce jako
mniejszy/szybszy wariant.

Sumy SHA-256 i adresy - przypięte w kodzie (`ai_model_download.rs::KANDYDACI`), zweryfikowane
bezpośrednio z plików wskaźnikowych Git LFS na Hugging Face (odczyt surowego tekstu w
przeglądarce, nie podsumowanie AI - suma musi się zgadzać co do bajtu).

## Metodologia

Jeden reprezentatywny prompt PO POLSKU, zbudowany z kształtu danych `TradeInspector` (instrument,
konto, strategia, ceny, wynik, złamana zasada wejścia, emocje przed/po, notatka użytkownika) -
model ma zwrócić WYŁĄCZNIE obiekt JSON z kluczami `fakty`/`obserwacje`/`rekomendacje`, każdy jako
tablica. Mierzone: czas ładowania modelu, czas generowania, liczba tokenów, tempo (tok/s), czy
odpowiedź parsuje się jako poprawny JSON wg schematu, oraz jakość/spójność treści po polsku
(ocena ręczna surowej odpowiedzi).

**Ważne odkrycie metodologiczne w trakcie benchmarku:** pierwszy przebieg (bez zastosowania
szablonu czatu modelu - surowe dokańczanie tekstu zamiast prawdziwej tury rozmowy) dawał u
WSZYSTKICH trzech kandydatów ten sam błąd: model nie wiedział, kiedy się zatrzymać, i zamiast
jednej odpowiedzi generował kolejne warianty aż do limitu tokenów. Naprawione przez zastosowanie
`model.chat_template()` + `apply_chat_template()` z `llama-cpp-2` (szablon zapisany w samym pliku
GGUF) - wyniki niżej pochodzą z DRUGIEGO, poprawionego przebiegu.

## Wyniki

| Kandydat        | Czas ładowania | Czas generowania     | Tempo      | Poprawny JSON            | Jakość treści (ocena ręczna)                                               |
| --------------- | -------------- | -------------------- | ---------- | ------------------------ | -------------------------------------------------------------------------- |
| Bielik-11B-v2.3 | 18,7 s         | 187,9 s (673 tokeny) | 3,6 tok/s  | ✅ tak                   | Bogata, spójna analiza po polsku - wszystkie pola sensowne                 |
| Qwen2.5-7B      | 4,0 s          | 75,8 s (455 tokenów) | 6,0 tok/s  | ❌ **nie** (patrz niżej) | Najlepsza jakość/płynność języka ze wszystkich trzech                      |
| Qwen2.5-1.5B    | 1,2 s          | 12,3 s (288 tokenów) | 23,3 tok/s | ✅ tak                   | Płytka - `obserwacje`/`rekomendacje` PUSTE, tylko powtórzył dane wejściowe |

**Dlaczego Qwen2.5-7B dostał „niepoprawny JSON"**: w treści pola `fakty` model wstawił
niezescapowane cudzysłowy wewnątrz stringa (`"...na kocie koncie "Konto główne" z strategią
"Breakout D1"..."`) - to prawdziwa wada niezawodności strukturalnej modelu, nie błąd testu (sama
reszta odpowiedzi była kompletna, poprawnie zatrzymana, po polsku i merytorycznie najlepsza z
trójki).

## Wniosek i rekomendacja

**Żaden kandydat nie jest idealny sam z siebie** - to oczekiwane przy kwantyzowanych modelach
7-11B uruchamianych na CPU:

- Bielik-11B jest najbardziej niezawodny składniowo i ma najbogatszą treść, ale **188 sekund na
  jedną analizę** to realistycznie za długo dla pojedynczego kliknięcia „Przeanalizuj z AI" w
  aplikacji desktopowej.
- Qwen2.5-7B ma najlepszą jakość/płynność języka i rozsądną szybkość (76 s), ale w tym
  uruchomieniu złamał składnię JSON przez niezescapowany cudzysłów.
- Qwen2.5-1.5B jest bardzo szybki (12 s), ale analitycznie zbyt płytki - nie spełnia wymogu
  „konkretnych, zrozumiałych wskazówek", tylko odbija dane wejściowe.

**Rekomendacja: Qwen2.5-7B-Instruct jako model produkcyjny (Etap 2+), pod jednym warunkiem
inżynieryjnym:** poprawność JSON-a NIE MOŻE zależeć od tego, czy model "zachowa się grzecznie" -
`llama-cpp-2` ma wsparcie dla gramatyk GBNF (moduł `grammar`), które WYMUSZAJĄ poprawną składnię
JSON na poziomie samplera (model fizycznie nie może wygenerować tokenu łamiącego schemat). To
dokładnie pokrywa się z wymogiem specyfikacji „Wymagaj odpowiedzi modelu w walidowanym schemacie
JSON. Odrzucaj odpowiedzi niezgodne ze schematem" - Etap 2 MUSI to wdrożyć jako pierwszy krok
`AiRuntimeService`, niezależnie od tego, który model finalnie działa w tle. Przy wymuszonej
gramatyce JSON-a przewaga Qwen2.5-7B (jakość języka, szybkość) staje się jednoznaczna.

Bielik-11B zostaje udokumentowaną alternatywą, gdyby jakość polskiego okazała się w praktyce
niewystarczająca u Qwen - kosztem znacznie dłuższego czasu odpowiedzi. Qwen2.5-1.5B nie
jest rekomendowany jako model produkcyjny, ale może się przydać jako szybki, tani fallback dla
bardzo prostych zapytań (jeśli taka potrzeba pojawi się później).

## Co dalej (Etap 2)

1. Dodać gramatykę GBNF wymuszającą schemat `{"fakty": [...], "obserwacje": [...], "rekomendacje": [...]}`
   zamiast polegać na tym, że model "zachowa się" - to usuwa całą klasę błędów typu "niezescapowany
   cudzysłów" widzianą w tym benchmarku.
2. `AiRuntimeService` z obsługą anulowania/timeoutu/blokady "jedna analiza naraz" (Etap 2 z planu).
3. Realny czas odpowiedzi (76 s dla Qwen2.5-7B bez gramatyki, prawdopodobnie podobny lub szybszy z
   gramatyką) wymaga w UI wyraźnego stanu "trwa analiza" z możliwością przerwania - nie da się tego
   pokazać jako natychmiastowej operacji.
