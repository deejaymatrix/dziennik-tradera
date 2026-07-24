# Macierz audytowa — Redesign „TradingView Pro × Apple Fintech" (Blok O)

Data: 2026-07-24 (w toku). Wykonane wg `Prompt_finalny_redesign_O_TradingView_Apple_Fintech_i_pelny_audyt.md`
(wersja 2, z rozszerzeniem o macOS) i jego sekcji 23-32 (obowiązkowy audyt).

**Werdykt na tę chwilę: NIEGOTOWE.** Nie dlatego, że coś jest zepsute — dlatego, że część
wymaganych dowodów (zrzuty ekranu w obu motywach, sekcja 23) fizycznie nie da się dziś
uzyskać (panel przeglądarki nie renderuje klatek w tym środowisku), a pełny manualny test
„jak użytkownik" (sekcja 24) nie został jeszcze przeprowadzony na przebudowanej warstwie
wizualnej. Poniżej — co jest realnie zweryfikowane, i co nie.

## 1. Design tokens i spójność (sekcja 9)

| Funkcja                            | Plik                                                                        | Scenariusz testowy                                                                                   | Oczekiwany rezultat                                   | Rzeczywisty rezultat                                                                         | Dowód                                         | Status |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- | ------ |
| Paleta kolorów jasna/ciemna        | `design/tokens.css`                                                         | `design/tokens.test.ts` — kontrast każdego koloru tekstu/semantycznego na każdej realnej powierzchni | ≥ WCAG AA (4,5:1) wszędzie                            | 24/24 testów PASS po korekcie 8 wartości                                                     | `pnpm test` — `design/tokens.test.ts` zielony | PASS   |
| Usunięcie złota z domyślnej marki  | `PreferencesProvider.tsx`, `domain/preferences.rs`, `StrategyFormModal.tsx` | Sentinel domyślnego akcentu zsynchronizowany Rust+TS; `git grep c9a85a`                              | Zero wystąpień poza świadomym presetem personalizacji | `git grep` zwraca tylko `PreferenceSections.tsx` (opcja "Złoty" do wyboru przez użytkownika) | Komendy grep w commitach O1/O2+O4             | PASS   |
| Skala z-index                      | `design/tokens.css` + 8 konsumentów                                         | Zliczenie surowych `z-index:` poza tokenami                                                          | 0                                                     | `grep -c` → 0                                                                                | Commit „Redesign O7 (część 1)"                | PASS   |
| Skala font-weight                  | `design/tokens.css` + 42 pliki                                              | Zliczenie surowych `font-weight: <liczba>`                                                           | 0                                                     | regex policzył 69 przed, 0 po                                                                | Commit „Redesign O7 (część 2)"                | PASS   |
| Skala line-height                  | `design/tokens.css` + 5 plików                                              | Zliczenie surowych `line-height: 1`/`1.5` (poza świadomym `1.1`)                                     | 0                                                     | `grep -c` → 0                                                                                | Commit „Redesign O7 (część 3)"                | PASS   |
| Szerokość Inspectora jako token    | `TransactionsPage.module.css`                                               | Wartość `minmax(20rem, 26rem)` zastąpiona tokenami                                                   | Brak zaszytej na sztywno wartości                     | `grep` potwierdza `var(--inspector-width-min/-max)`                                          | Commit „Redesign O7 (część 1)"                | PASS   |
| BUY/SELL z tekstem obok koloru     | 4 miejsca (Kalkulator, TopTradesTable, Inspector, TransactionsPage)         | `grep` na `TRADE_SIDE_LABELS`/`"BUY"`/`"SELL"`                                                       | Wszędzie tekst, nigdy sam kolor                       | Potwierdzone przeglądem każdego miejsca                                                      | Commit „Redesign O2+O4"                       | PASS   |
| Wykresy na tokenach                | `GroupBarChart`, `EquityCurveChart`, `SimplePieChart`, `chartTheme.ts`      | `grep` na hardkodowane hexy w plikach wykresów                                                       | 0                                                     | 0                                                                                            | Commit „Redesign O3"                          | PASS   |
| Stan `loading` na `Button`         | `Button.tsx` + 9 konsumentów                                                | 7 testów jednostkowych (`aria-busy`, blokada kliknięcia, brak atrybutu poza stanem)                  | Wszystkie PASS                                        | 7/7 PASS                                                                                     | `pnpm test` — `Button.test.tsx`               | PASS   |
| Reaktywny tryb „zgodny z systemem" | `PreferencesProvider.tsx`                                                   | Przegląd kodu — nasłuch `matchMedia("change")`                                                       | Już istniał, działa z nową paletą                     | Potwierdzone przeglądem, bez zmian kodu                                                      | Commit O1                                     | PASS   |
| Cmd+K obok Ctrl+K (macOS)          | `CommandPalette.tsx`                                                        | `grep` na `ctrlKey`/`metaKey`                                                                        | Jedyne miejsce w kodzie już obsługuje oba             | `event.ctrlKey \|\| event.metaKey`                                                           | Przegląd kodu, bez zmian potrzebnych          | PASS   |

## 2. Audyt kodu linia po linii (sekcja 27) — zakres redesignu

Redesign dotknął WYŁĄCZNIE warstwy wizualnej (CSS modules, tokeny, `Button.tsx`,
`EditModeActions.tsx`) plus jeden string w Rust (`default_accent()`). Logika biznesowa, SQL,
migracje i obliczenia finansowe pozostały niedotknięte — te były już przejrzane w audycie
bloku D (`AUDYT_KODU.md`, 206 plików) i nie wymagają powtórki, bo redesign ich nie zmienił.

| Kategoria z sekcji 27               | Zakres sprawdzony                                                                  | Wynik                                                                                                                           | Dowód                              |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `TODO`/`FIXME`                      | Cały `apps/desktop/src` (TS/TSX/CSS) + `src-tauri/src` (Rust)                      | 0 wystąpień                                                                                                                     | `grep -rn "TODO\|FIXME"` — puste   |
| Puste `catch`                       | Cały frontend                                                                      | 0 prawdziwie pustych — każdy ma komentarz uzasadniający ciche pominięcie                                                        | `grep` + ręczny przegląd 10 miejsc |
| Hardkodowane kolory                 | Cały `apps/desktop/src` (CSS)                                                      | 0 poza uzasadnionym wyjątkiem (tęcza `ColorPicker`)                                                                             | Commit O2+O4                       |
| Niespójne komponenty                | `Button` — 9 miejsc z ręcznie duplikowaną logiką `loading`                         | Naprawione, skonsolidowane w jednym komponencie                                                                                 | Commit „Redesign O7 (część 4)"     |
| Nieużywany komponent w specyfikacji | `Radio` (sekcja 9 wymienia go w liście)                                            | Nigdzie w aplikacji nie ma `type="radio"` — NIE budowany (zgodnie z decyzją użytkownika: komponenty tylko tam, gdzie potrzebne) | `grep -rln 'type="radio"'` — puste |
| Martwy kod po redesignie            | `savingLabel` w `EditModeActions` (prop stał się zbędny po dodaniu `loading`)      | Usunięty — 0 wywołań z override                                                                                                 | Commit „Redesign O7 (część 4)"     |
| Fałszywie pozytywny lint            | `Button.tsx` — `prefer-nullish-coalescing` sugerował zmianę zmieniającą zachowanie | Naprawione uczciwie (`Boolean(disabled)`), nie stłumione komentarzem                                                            | Commit „Redesign O7 (część 4)"     |

**Uwaga o zakresie:** to NIE jest jeszcze pełny manifest wszystkich plików wymagany przez
sekcję 27 („Przygotuj rzeczywistą listę sprawdzonych plików") — to lista kategorii i tego,
co w ich obrębie sprawdzono. Pełny manifest plik-po-pliku jest kolejnym krokiem O7.

## 3. Audyt wizualny (sekcja 23) — 🔒 NIEZWERYFIKOWANY

| Wymaganie                                         | Status                      | Przyczyna                                                                                                                                                                                                                             |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zrzuty ekranów w motywie jasnym i ciemnym         | **NIEZWERYFIKOWANY**        | Panel przeglądarki nie renderuje klatek w tym środowisku ("Browser pane is not displayed") — potwierdzone dwukrotnie, nie jednorazowa usterka                                                                                         |
| Weryfikacja przez computed styles zamiast zrzutów | PASS (częściowe zastępstwo) | Kolory dark/light, przycisk primary, aktywny link nawigacji, karta błędu — potwierdzone realnymi wartościami `getComputedStyle` z działającego podglądu (patrz sesja z 2026-07-24, kolory `#5a87ff`/`#2860fb` itd. zgodne z tokenami) |
| Brak pozostałości starego motywu                  | PASS                        | Zero wystąpień starych wartości hex (`#c9a85a` i całej starej palety dark/light) poza jednym świadomym presetem personalizacji                                                                                                        |

Ta pozycja zostaje `NIEZWERYFIKOWANY`, nie `PASS` na podstawie przypuszczenia — zgodnie
z zasadą sekcji 30 („nie oznaczaj `PASS` wyłącznie dlatego, że projekt się skompilował").

## 4. Pełny test jak użytkownik końcowy (sekcja 24) — 🔒 NIEZWERYFIKOWANY

Nie przeprowadzony jeszcze w tej turze audytu dla przebudowanej warstwy wizualnej. Częściowe
przejście przez Dashboard/Ustawienia/Raporty/Strategie wykonane podczas weryfikacji O1 (stan
pusty, stan błędu, nawigacja) — nie stanowi pełnego przejścia wymaganego przez sekcję 24.

## 5. Weryfikacja obliczeń finansowych (sekcja 26)

**Bez zmian względem audytu bloku D.** Redesign nie dotknął `domain/trade_calculations.rs`,
`domain/balance.rs`, `domain/trade_partial_close.rs` ani żadnego modułu liczącego pieniądze —
16 niezależnych rachunków referencyjnych z `RAPORT_AUDYTU.md`/A4 pozostaje aktualnych bez
ponownego przeliczania. `cargo test` — 427/427 PASS, bez regresji.

## 6. Narzędzia kontroli (sekcja 28)

| Narzędzie                    | Wynik                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`          | PASS                                                                                                                                  |
| `pnpm lint`                  | 1 błąd — zweryfikowany jako pre-istniejący baseline (self-referencyjny `useCallback` w `UpdateMonitorProvider.tsx`, sprzed redesignu) |
| `pnpm typecheck`             | PASS, 0 błędów                                                                                                                        |
| `pnpm test`                  | PASS, 233/233                                                                                                                         |
| `cargo fmt --check`          | PASS                                                                                                                                  |
| `cargo clippy --all-targets` | PASS, 0 błędów                                                                                                                        |
| `cargo test`                 | PASS, 427/427                                                                                                                         |

## Podsumowanie blokad do werdyktu GOTOWE

1. **Zrzuty ekranu / realna weryfikacja wizualna** (sekcja 23) — wymaga albo działającego
   panelu przeglądarki, albo współpracy użytkownika z jego własnym uruchomionym oknem.
2. **Pełne przejście jak użytkownik końcowy** (sekcja 24) — nie wykonane dla przebudowanej
   warstwy wizualnej w całości (tylko częściowo, przy okazji innych sprawdzeń).
3. **Pełny manifest plik-po-pliku** (sekcja 27) — dotychczasowy przegląd jest kategoriowy
   (kolory, z-index, wagi, puste catch...), nie plik-po-pliku z osobnym statusem każdego.

Żadna z tych trzech blokad nie jest znanym błędem — to brakujący DOWÓD, nie brakująca
poprawka. Kod jest zweryfikowany tam, gdzie da się to zrobić bez pikselowego podglądu.
