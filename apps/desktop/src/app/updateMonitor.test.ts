import { beforeEach, describe, expect, it } from "vitest";
import {
  czyPokazacNatywnePowiadomienie,
  czySprawdzicPoPowrocieNaPierwszyPlan,
  INTERWAL_MS,
  MAKS_BACKOFF_MS,
  MIN_ODSTEP_PIERWSZY_PLAN_MS,
  odstepBazowyMs,
  opoznienieDoNastepnegoMs,
  poczatkowyStan,
  poNieudanymSprawdzeniu,
  poOdzyskaniuSieci,
  poUdanymSprawdzeniu,
  wczytajOstatnioPowiadomionaWersje,
  wersjaWyzszaNiz,
  zapiszOstatnioPowiadomionaWersje,
} from "./updateMonitor";

describe("odstęp między sprawdzeniami", () => {
  it("bez błędów sprawdza co dziesięć minut", () => {
    expect(odstepBazowyMs(0)).toBe(INTERWAL_MS);
    expect(INTERWAL_MS).toBe(10 * 60_000);
  });

  it("po błędach odstęp rośnie dwukrotnie za każdym razem", () => {
    expect(odstepBazowyMs(1)).toBe(INTERWAL_MS * 2);
    expect(odstepBazowyMs(2)).toBe(INTERWAL_MS * 4);
  });

  it("backoff nigdy nie przekracza godziny", () => {
    // Dłuższe czekanie niczego nie naprawia, a opóźnia wykrycie, że sieć wróciła.
    for (const bledy of [3, 5, 10, 50, 1000]) {
      expect(odstepBazowyMs(bledy)).toBeLessThanOrEqual(MAKS_BACKOFF_MS);
    }
    expect(odstepBazowyMs(1000)).toBe(MAKS_BACKOFF_MS);
  });

  it("ogromna liczba błędów nie daje Infinity ani NaN", () => {
    // 2^n rośnie szybko - bez ograniczenia wykładnika przed potęgowaniem wyszłoby Infinity.
    const wynik = odstepBazowyMs(Number.MAX_SAFE_INTEGER);
    expect(Number.isFinite(wynik)).toBe(true);
    expect(wynik).toBe(MAKS_BACKOFF_MS);
  });
});

describe("losowe przesunięcie odstępu", () => {
  it("skrajne wartości losowe dają dokładnie ±10%", () => {
    const stan = poczatkowyStan();
    expect(opoznienieDoNastepnegoMs(stan, 0)).toBe(Math.round(INTERWAL_MS * 0.9));
    expect(opoznienieDoNastepnegoMs(stan, 1)).toBe(Math.round(INTERWAL_MS * 1.1));
  });

  it("środek przedziału daje dokładnie odstęp bazowy", () => {
    expect(opoznienieDoNastepnegoMs(poczatkowyStan(), 0.5)).toBe(INTERWAL_MS);
  });

  it("przesunięcie działa też na odstępie po błędach", () => {
    const stan = { ostatnieUdaneSprawdzenie: null, bledyPodRzad: 2 };
    const bazowy = odstepBazowyMs(2);
    expect(opoznienieDoNastepnegoMs(stan, 0)).toBe(Math.round(bazowy * 0.9));
    expect(opoznienieDoNastepnegoMs(stan, 1)).toBe(Math.round(bazowy * 1.1));
  });

  it("nigdy nie zwraca zera ani wartości ujemnej", () => {
    // Zerowy odstęp zamieniłby monitorowanie w pętlę odpytującą serwer bez przerwy.
    for (const losowa of [0, 0.5, 0.999]) {
      expect(opoznienieDoNastepnegoMs(poczatkowyStan(), losowa)).toBeGreaterThan(0);
    }
  });
});

describe("powrót aplikacji na pierwszy plan", () => {
  it("sprawdza, gdy nie było jeszcze żadnego udanego sprawdzenia", () => {
    expect(czySprawdzicPoPowrocieNaPierwszyPlan(poczatkowyStan(), 1_000_000)).toBe(true);
  });

  it("nie sprawdza, gdy od ostatniego sprawdzenia minęło mniej niż pięć minut", () => {
    // Użytkownik przełącza okna dziesiątki razy na godzinę - bez progu każde przełączenie
    // byłoby żądaniem do serwera.
    const stan = { ostatnieUdaneSprawdzenie: 1_000_000, bledyPodRzad: 0 };
    expect(czySprawdzicPoPowrocieNaPierwszyPlan(stan, 1_000_000 + 60_000)).toBe(false);
  });

  it("sprawdza dokładnie po pięciu minutach", () => {
    const stan = { ostatnieUdaneSprawdzenie: 1_000_000, bledyPodRzad: 0 };
    expect(
      czySprawdzicPoPowrocieNaPierwszyPlan(stan, 1_000_000 + MIN_ODSTEP_PIERWSZY_PLAN_MS),
    ).toBe(true);
  });
});

describe("przejścia stanu monitora", () => {
  it("udane sprawdzenie zapisuje czas i zeruje licznik błędów", () => {
    const po = poUdanymSprawdzeniu(5_000);
    expect(po.ostatnieUdaneSprawdzenie).toBe(5_000);
    expect(po.bledyPodRzad).toBe(0);
  });

  it("nieudane sprawdzenie zwiększa licznik, ale nie rusza czasu ostatniego udanego", () => {
    const stan = { ostatnieUdaneSprawdzenie: 5_000, bledyPodRzad: 1 };
    const po = poNieudanymSprawdzeniu(stan);
    expect(po.bledyPodRzad).toBe(2);
    expect(po.ostatnieUdaneSprawdzenie).toBe(5_000);
  });

  it("odzyskanie sieci zeruje backoff, ale NIE udaje udanego sprawdzenia", () => {
    // Gdyby zerowało też czas ostatniego sprawdzenia, powrót na pierwszy plan zaraz po
    // odzyskaniu sieci nie wyzwoliłby sprawdzenia, mimo że nic jeszcze nie sprawdzono.
    const stan = { ostatnieUdaneSprawdzenie: 5_000, bledyPodRzad: 4 };
    const po = poOdzyskaniuSieci(stan);
    expect(po.bledyPodRzad).toBe(0);
    expect(po.ostatnieUdaneSprawdzenie).toBe(5_000);
  });
});

describe("porównywanie wersji", () => {
  it("porównuje człony liczbowo, a nie tekstowo", () => {
    // Porównanie tekstowe uznałoby "0.9.0" za wyższe niż "0.10.0" - to najczęstszy błąd
    // przy wersjach i przy nim aktualizacja przestałaby się pokazywać.
    expect(wersjaWyzszaNiz("0.10.0", "0.9.0")).toBe(true);
    expect(wersjaWyzszaNiz("0.9.0", "0.10.0")).toBe(false);
    expect(wersjaWyzszaNiz("1.0.0", "0.99.99")).toBe(true);
    expect(wersjaWyzszaNiz("1.2.10", "1.2.9")).toBe(true);
  });

  it("ta sama wersja nie jest wyższa", () => {
    expect(wersjaWyzszaNiz("1.2.3", "1.2.3")).toBe(false);
  });

  it("radzi sobie z przedrostkiem v i z oznaczeniem wydania", () => {
    expect(wersjaWyzszaNiz("v1.2.4", "1.2.3")).toBe(true);
    expect(wersjaWyzszaNiz("1.2.4-rc1", "1.2.3")).toBe(true);
    expect(wersjaWyzszaNiz("1.2.3+build9", "1.2.3")).toBe(false);
  });

  it("nieczytelny numer nigdy nie jest wyższy", () => {
    // Bezpieczny kierunek: przy niezrozumiałym numerze NIE zawracamy użytkownikowi głowy.
    expect(wersjaWyzszaNiz("bardzo-nowa", "1.2.3")).toBe(false);
    expect(wersjaWyzszaNiz("1.2", "1.1.9")).toBe(false);
    expect(wersjaWyzszaNiz("", "1.2.3")).toBe(false);
  });
});

describe("natywne powiadomienie systemowe", () => {
  it("pokazuje się, gdy o żadnej wersji jeszcze nie powiadamiano", () => {
    expect(czyPokazacNatywnePowiadomienie("1.2.3", null)).toBe(true);
  });

  it("NIE powtarza się dla tej samej wersji", () => {
    // Natywne powiadomienie wyskakuje nad wszystkimi oknami - pokazywanie go co dziesięć
    // minut dla tej samej wersji byłoby nie do zniesienia.
    expect(czyPokazacNatywnePowiadomienie("1.2.3", "1.2.3")).toBe(false);
  });

  it("wyższa wersja uruchamia powiadomienie od nowa", () => {
    expect(czyPokazacNatywnePowiadomienie("1.2.4", "1.2.3")).toBe(true);
  });

  it("niższa wersja nie powiadamia - to byłoby cofnięcie", () => {
    expect(czyPokazacNatywnePowiadomienie("1.2.2", "1.2.3")).toBe(false);
  });
});

describe("zapamiętana wersja powiadomienia", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("zapisana wersja wraca przy odczycie", () => {
    zapiszOstatnioPowiadomionaWersje("1.2.3");
    expect(wczytajOstatnioPowiadomionaWersje()).toBe("1.2.3");
  });

  it("brak zapisu daje null, a nie pusty napis", () => {
    expect(wczytajOstatnioPowiadomionaWersje()).toBeNull();
  });

  it("cały cykl: powiadom raz, potem dopiero przy wyższej wersji", () => {
    expect(czyPokazacNatywnePowiadomienie("1.0.0", wczytajOstatnioPowiadomionaWersje())).toBe(true);
    zapiszOstatnioPowiadomionaWersje("1.0.0");

    expect(czyPokazacNatywnePowiadomienie("1.0.0", wczytajOstatnioPowiadomionaWersje())).toBe(
      false,
    );
    expect(czyPokazacNatywnePowiadomienie("1.1.0", wczytajOstatnioPowiadomionaWersje())).toBe(true);
  });
});
