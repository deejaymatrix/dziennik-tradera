/**
 * Logika harmonogramu monitorowania aktualizacji (Cel 1.8).
 *
 * Cały moduł jest CZYSTY - żadnych timerów, żadnych żądań sieciowych, żadnego Reacta. Dzięki
 * temu reguły „kiedy sprawdzić" dają się przetestować bez czekania dziesięciu minut i bez
 * udawania sieci. Timer i żądania są w `UpdateMonitorProvider`, który wywołuje te funkcje.
 *
 * Wymagania, które ten moduł koduje:
 * - sprawdzenie przy starcie z krótkim opóźnieniem, żeby nie spowalniać uruchamiania;
 * - potem co 10 minut;
 * - natychmiast po odzyskaniu połączenia;
 * - po powrocie aplikacji na pierwszy plan, jeśli od ostatniego udanego sprawdzenia minęło
 *   co najmniej 5 minut;
 * - losowe przesunięcie interwału, żeby wiele komputerów nie odpytywało serwera w tej samej
 *   sekundzie;
 * - narastający backoff przy błędach, maksymalnie do 60 minut.
 */

/** Krótkie opóźnienie pierwszego sprawdzenia - start aplikacji ma być nieblokowany. */
export const STARTOWE_OPOZNIENIE_MS = 5_000;

/** Podstawowy odstęp między automatycznymi sprawdzeniami. */
export const INTERWAL_MS = 10 * 60_000;

/** Minimalny odstęp, po którym powrót na pierwszy plan wyzwala sprawdzenie. */
export const MIN_ODSTEP_PIERWSZY_PLAN_MS = 5 * 60_000;

/** Górna granica backoffu - nawet po długiej serii błędów sprawdzamy raz na godzinę. */
export const MAKS_BACKOFF_MS = 60 * 60_000;

/**
 * Udział losowego przesunięcia w odstępie (±10%).
 *
 * Bez tego wszystkie komputery, które uruchomiono o pełnej godzinie, odpytywałyby serwer
 * dokładnie w tych samych sekundach. Przy jednym użytkowniku to bez znaczenia, ale endpoint
 * jest wspólny dla całej bazy instalacji i taki zgodny rytm to najprostszy sposób, żeby
 * zrobić sobie samemu skok obciążenia.
 */
export const JITTER_UDZIAL = 0.1;

export interface StanMonitora {
  /** Znacznik czasu ostatniego sprawdzenia zakończonego powodzeniem (ms), `null` gdy jeszcze nie było. */
  ostatnieUdaneSprawdzenie: number | null;
  /** Ile sprawdzeń pod rząd zakończyło się błędem - steruje backoffem. */
  bledyPodRzad: number;
}

export function poczatkowyStan(): StanMonitora {
  return { ostatnieUdaneSprawdzenie: null, bledyPodRzad: 0 };
}

/**
 * Odstęp bazowy przed uwzględnieniem losowego przesunięcia.
 *
 * Bez błędów to zwykły interwał. Po błędach rośnie dwukrotnie za każdym razem, ale nigdy
 * ponad godzinę - dłuższe czekanie nie pomaga, a opóźnia wykrycie, że sieć wróciła.
 */
export function odstepBazowyMs(bledyPodRzad: number): number {
  if (bledyPodRzad <= 0) {
    return INTERWAL_MS;
  }
  // 2^n rośnie szybko, więc ograniczamy wykładnik, zanim policzymy potęgę - inaczej przy
  // kilkudziesięciu błędach z rzędu dostalibyśmy Infinity zamiast liczby.
  const wykladnik = Math.min(bledyPodRzad, 10);
  return Math.min(INTERWAL_MS * 2 ** wykladnik, MAKS_BACKOFF_MS);
}

/**
 * Odstęp do następnego automatycznego sprawdzenia, z losowym przesunięciem.
 *
 * `losowa` to liczba z przedziału [0, 1) - podawana z zewnątrz zamiast wołania `Math.random()`
 * w środku, żeby test mógł sprawdzić skrajne wartości zamiast zgadywać.
 */
export function opoznienieDoNastepnegoMs(stan: StanMonitora, losowa: number): number {
  const bazowy = odstepBazowyMs(stan.bledyPodRzad);
  // Przesunięcie w obie strony: losowa = 0 daje -10%, losowa = 1 daje +10%.
  const przesuniecie = bazowy * JITTER_UDZIAL * (losowa * 2 - 1);
  return Math.max(1_000, Math.round(bazowy + przesuniecie));
}

/**
 * Czy powrót aplikacji na pierwszy plan ma wyzwolić sprawdzenie.
 *
 * Bez progu każde przełączenie okna odpytywałoby serwer - użytkownik przełącza się między
 * aplikacjami dziesiątki razy na godzinę.
 */
export function czySprawdzicPoPowrocieNaPierwszyPlan(stan: StanMonitora, teraz: number): boolean {
  if (stan.ostatnieUdaneSprawdzenie === null) {
    return true;
  }
  return teraz - stan.ostatnieUdaneSprawdzenie >= MIN_ODSTEP_PIERWSZY_PLAN_MS;
}

export function poUdanymSprawdzeniu(teraz: number): StanMonitora {
  return { ostatnieUdaneSprawdzenie: teraz, bledyPodRzad: 0 };
}

export function poNieudanymSprawdzeniu(stan: StanMonitora): StanMonitora {
  return { ...stan, bledyPodRzad: stan.bledyPodRzad + 1 };
}

/**
 * Odzyskanie połączenia zeruje backoff, ale NIE znaczy „sprawdzenie się udało" - dlatego
 * `ostatnieUdaneSprawdzenie` zostaje nietknięte. Samo sprawdzenie wyzwala provider od razu.
 */
export function poOdzyskaniuSieci(stan: StanMonitora): StanMonitora {
  return { ...stan, bledyPodRzad: 0 };
}

/** Rozbija numer wersji SemVer na człony liczbowe; `null` gdy numer jest nieczytelny. */
function czlonyWersji(wersja: string): [number, number, number] | null {
  // Odcinamy przedrostek wydania i metadane („1.2.3-rc1+build" → „1.2.3").
  const rdzen = wersja.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  const czesci = rdzen.split(".");
  if (czesci.length !== 3) {
    return null;
  }
  const liczby = czesci.map((c) => Number.parseInt(c, 10));
  if (liczby.some((n) => Number.isNaN(n))) {
    return null;
  }
  return [liczby[0] as number, liczby[1] as number, liczby[2] as number];
}

/** `true`, gdy `a` jest wyższa niż `b`. Nieczytelny numer nigdy nie jest „wyższy". */
export function wersjaWyzszaNiz(a: string, b: string): boolean {
  const pierwsza = czlonyWersji(a);
  const druga = czlonyWersji(b);
  if (pierwsza === null || druga === null) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    const x = pierwsza[i] as number;
    const y = druga[i] as number;
    if (x !== y) {
      return x > y;
    }
  }
  return false;
}

/**
 * Czy pokazać NATYWNE powiadomienie systemowe o tej wersji.
 *
 * Natywne powiadomienie wyskakuje nad wszystkimi oknami, więc pokazanie go co dziesięć minut
 * dla tej samej wersji byłoby nie do zniesienia. Pokazujemy je raz na wersję; dopiero wersja
 * WYŻSZA niż ostatnio zapowiedziana uruchamia proces od nowa.
 *
 * Znacznik w aplikacji (ten trwały, w centrum powiadomień) jest osobną sprawą i zostaje
 * widoczny niezależnie od tego - patrz `UpdateMonitorProvider`.
 */
export function czyPokazacNatywnePowiadomienie(
  dostepnaWersja: string,
  ostatnioPowiadomiona: string | null,
): boolean {
  if (ostatnioPowiadomiona === null) {
    return true;
  }
  return wersjaWyzszaNiz(dostepnaWersja, ostatnioPowiadomiona);
}

const KLUCZ_OSTATNIO_POWIADOMIONA = "dziennik-tradera.updater.last-notified-version";

export function wczytajOstatnioPowiadomionaWersje(): string | null {
  try {
    return localStorage.getItem(KLUCZ_OSTATNIO_POWIADOMIONA);
  } catch {
    // Brak dostępu do localStorage nie może zablokować sprawdzania aktualizacji - w najgorszym
    // razie użytkownik zobaczy powiadomienie drugi raz.
    return null;
  }
}

export function zapiszOstatnioPowiadomionaWersje(wersja: string): void {
  try {
    localStorage.setItem(KLUCZ_OSTATNIO_POWIADOMIONA, wersja);
  } catch {
    // Jak wyżej - to wygoda, nie poprawność.
  }
}
