import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { invokeCommand } from "./invokeCommand";
import { describeUpdateError } from "./useUpdater";
import {
  czyPokazacNatywnePowiadomienie,
  czySprawdzicPoPowrocieNaPierwszyPlan,
  opoznienieDoNastepnegoMs,
  poczatkowyStan,
  poNieudanymSprawdzeniu,
  poOdzyskaniuSieci,
  poUdanymSprawdzeniu,
  STARTOWE_OPOZNIENIE_MS,
  wczytajOstatnioPowiadomionaWersje,
  wersjaWyzszaNiz,
  zapiszOstatnioPowiadomionaWersje,
} from "./updateMonitor";
import type { StanMonitora } from "./updateMonitor";

/**
 * JEDEN centralny serwis monitorowania aktualizacji na całą aplikację (Cel 1.8).
 *
 * Wymaganie jest tu dosłowne: „uruchom jeden centralny serwis monitorowania działający przez cały
 * czas uruchomienia aplikacji; nie twórz wielu niezależnych timerów w poszczególnych widokach".
 * Dlatego provider siedzi nad routerem, trzyma DOKŁADNIE JEDEN uchwyt licznika w `ref`, a każdy
 * widok tylko czyta jego stan przez `useUpdateMonitor()`. Zmiana widoku nie tworzy nowego timera,
 * bo provider się nie odmontowuje.
 *
 * Przepływ jednego sprawdzenia jest dwustopniowy i to jest cała oszczędność:
 * 1. tanie żądanie warunkowe do manifestu (`check_update_manifest` z `If-None-Match`) - przy
 *    niezmienionym manifeście kończy się odpowiedzią „bez zmian" i na tym koniec;
 * 2. dopiero gdy manifest jest nowy I zapowiada wersję wyższą niż bieżąca, wołamy wtyczkę
 *    `check()`, która pobiera manifest jeszcze raz i WERYFIKUJE PODPIS.
 *
 * Weryfikacja podpisu i instalacja należą wyłącznie do wtyczki - ten provider nie podejmuje
 * żadnej decyzji bezpieczeństwa.
 */

export type StanAktualizacji =
  | { rodzaj: "bezczynny" }
  | { rodzaj: "sprawdzanie" }
  | { rodzaj: "aktualna" }
  | { rodzaj: "dostepna"; update: Update; odlozona: boolean }
  | { rodzaj: "pobieranie"; postep: number | null }
  | { rodzaj: "gotowa-do-restartu" }
  | { rodzaj: "blad"; komunikat: string };

export interface UpdateMonitorValue {
  stan: StanAktualizacji;
  /** Czy pokazać trwały znacznik w interfejsie - zostaje po wybraniu „Później". */
  znacznikDostepnej: boolean;
  /** Wersja dostępnej aktualizacji, gdy jakakolwiek jest znana. */
  dostepnaWersja: string | null;
  sprawdzTeraz: () => Promise<void>;
  pobierzIZainstaluj: () => Promise<void>;
  odlozNapozniej: () => void;
  uruchomPonownie: () => Promise<void>;
}

const UpdateMonitorContext = createContext<UpdateMonitorValue | null>(null);

/** Wynik komendy `check_update_manifest` (kształt z `WynikSprawdzenia` w Rust). */
type WynikManifestu =
  | { kind: "bez_zmian" }
  | { kind: "nowy"; manifest: { version: string; notes?: string | null }; etag?: string | null };

export function UpdateMonitorProvider({
  children,
  /** Wersja bieżąca aplikacji - wstrzykiwana, żeby test nie musiał udawać środowiska Tauri. */
  wersjaBiezaca,
}: {
  children: ReactNode;
  wersjaBiezaca?: string;
}): ReactElement {
  const [stan, setStan] = useState<StanAktualizacji>({ rodzaj: "bezczynny" });
  const [znacznikDostepnej, setZnacznikDostepnej] = useState(false);
  const [dostepnaWersja, setDostepnaWersja] = useState<string | null>(null);

  // Cały stan harmonogramu żyje w ref-ach, nie w stanie Reacta: zmiana tych wartości nie ma
  // powodować przerysowania, a przerysowanie nie ma resetować harmonogramu.
  const monitorRef = useRef<StanMonitora>(poczatkowyStan());
  const etagRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const wTrakcieRef = useRef(false);
  const odmontowanyRef = useRef(false);

  const wyczyscTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Jedno sprawdzenie. `reczne` pomija optymalizację ETag, bo użytkownik oczekuje świeżej odpowiedzi. */
  const wykonajSprawdzenie = useCallback(
    async (reczne: boolean): Promise<void> => {
      // Zabezpieczenie przed nakładaniem się sprawdzeń: timer, powrót sieci i kliknięcie
      // użytkownika mogą trafić w tę samą chwilę.
      if (wTrakcieRef.current) {
        return;
      }
      wTrakcieRef.current = true;
      if (reczne) {
        setStan({ rodzaj: "sprawdzanie" });
      }

      try {
        const wynik = await invokeCommand<WynikManifestu>("check_update_manifest", {
          etag: reczne ? null : etagRef.current,
        });

        if (!odmontowanyRef.current) {
          monitorRef.current = poUdanymSprawdzeniu(Date.now());
        }

        if (wynik.kind === "bez_zmian") {
          // Manifest bez zmian - nie ruszamy stanu widocznego dla użytkownika, bo znacznik
          // dostępnej aktualizacji (jeśli jest) ma zostać.
          if (reczne && !znacznikDostepnej) {
            setStan({ rodzaj: "aktualna" });
          }
          return;
        }

        etagRef.current = wynik.etag ?? null;
        const wersjaZManifestu = wynik.manifest.version;

        // Manifest może zapowiadać wersję, którą użytkownik już ma - wtedy nie ma czego robić
        // i NIE wołamy wtyczki, żeby nie generować ruchu bez powodu.
        if (wersjaBiezaca && !wersjaWyzszaNiz(wersjaZManifestu, wersjaBiezaca)) {
          if (reczne) {
            setStan({ rodzaj: "aktualna" });
          }
          return;
        }

        // Dopiero teraz pełne sprawdzenie z WERYFIKACJĄ PODPISU po stronie wtyczki.
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (odmontowanyRef.current) {
          return;
        }
        if (!update) {
          if (reczne) {
            setStan({ rodzaj: "aktualna" });
          }
          return;
        }

        setDostepnaWersja(update.version);
        setZnacznikDostepnej(true);
        setStan({ rodzaj: "dostepna", update, odlozona: false });
        void pokazNatywnePowiadomienie(update.version);
      } catch (error) {
        if (!odmontowanyRef.current) {
          monitorRef.current = poNieudanymSprawdzeniu(monitorRef.current);
          // Błąd automatycznego sprawdzenia jest CICHY - nie ma prawa przeszkadzać w pracy.
          // Pokazujemy go tylko wtedy, gdy użytkownik sam o to poprosił.
          if (reczne) {
            setStan({ rodzaj: "blad", komunikat: describeUpdateError(error) });
          }
        }
      } finally {
        wTrakcieRef.current = false;
      }
    },
    [wersjaBiezaca, znacznikDostepnej],
  );

  /** Planuje następne sprawdzenie. Zawsze najpierw kasuje poprzedni licznik - stąd jeden timer. */
  const zaplanujNastepne = useCallback(
    (opoznienie: number) => {
      wyczyscTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void wykonajSprawdzenie(false).finally(() => {
          if (!odmontowanyRef.current) {
            zaplanujNastepne(opoznienieDoNastepnegoMs(monitorRef.current, Math.random()));
          }
        });
      }, opoznienie);
    },
    [wyczyscTimer, wykonajSprawdzenie],
  );

  // Jedyne miejsce, które uruchamia harmonogram. Pusta lista zależności jest tu istotna:
  // efekt ma wykonać się RAZ na cały czas życia aplikacji.
  useEffect(() => {
    odmontowanyRef.current = false;
    zaplanujNastepne(STARTOWE_OPOZNIENIE_MS);

    const przyPowrocieSieci = (): void => {
      // Odzyskanie sieci zeruje backoff i sprawdza OD RAZU - użytkownik, który właśnie wrócił
      // do internetu, nie ma czekać godziny na wygaśnięcie kary za wcześniejsze błędy.
      monitorRef.current = poOdzyskaniuSieci(monitorRef.current);
      void wykonajSprawdzenie(false);
      zaplanujNastepne(opoznienieDoNastepnegoMs(monitorRef.current, Math.random()));
    };

    const przyPowrocieNaPierwszyPlan = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (czySprawdzicPoPowrocieNaPierwszyPlan(monitorRef.current, Date.now())) {
        void wykonajSprawdzenie(false);
      }
    };

    window.addEventListener("online", przyPowrocieSieci);
    document.addEventListener("visibilitychange", przyPowrocieNaPierwszyPlan);

    return () => {
      odmontowanyRef.current = true;
      wyczyscTimer();
      window.removeEventListener("online", przyPowrocieSieci);
      document.removeEventListener("visibilitychange", przyPowrocieNaPierwszyPlan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sprawdzTeraz = useCallback(async (): Promise<void> => {
    await wykonajSprawdzenie(true);
    zaplanujNastepne(opoznienieDoNastepnegoMs(monitorRef.current, Math.random()));
  }, [wykonajSprawdzenie, zaplanujNastepne]);

  const pobierzIZainstaluj = useCallback(async (): Promise<void> => {
    if (stan.rodzaj !== "dostepna") {
      return;
    }
    const { update } = stan;
    setStan({ rodzaj: "pobieranie", postep: null });
    let wszystkich = 0;
    let pobranych = 0;
    try {
      await update.downloadAndInstall((zdarzenie) => {
        if (zdarzenie.event === "Started") {
          wszystkich = zdarzenie.data.contentLength ?? 0;
        } else if (zdarzenie.event === "Progress") {
          pobranych += zdarzenie.data.chunkLength;
          setStan({
            rodzaj: "pobieranie",
            postep:
              wszystkich > 0 ? Math.min(100, Math.round((pobranych / wszystkich) * 100)) : null,
          });
        }
      });
      setStan({ rodzaj: "gotowa-do-restartu" });
    } catch (error) {
      // Przerwane pobieranie NIE może zostawić znacznika w stanie „pobieranie" - użytkownik
      // musi móc spróbować ponownie.
      setStan({ rodzaj: "blad", komunikat: describeUpdateError(error) });
    }
  }, [stan]);

  /**
   * „Później" chowa kartę aktualizacji, ale NIE kasuje trwałego znacznika - wymaganie mówi
   * o tym wprost. Użytkownik ma móc wrócić do aktualizacji, gdy będzie miał na nią czas.
   */
  const odlozNapozniej = useCallback((): void => {
    setStan((poprzedni) =>
      poprzedni.rodzaj === "dostepna" ? { ...poprzedni, odlozona: true } : poprzedni,
    );
  }, []);

  const uruchomPonownie = useCallback(async (): Promise<void> => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }, []);

  return (
    <UpdateMonitorContext.Provider
      value={{
        stan,
        znacznikDostepnej,
        dostepnaWersja,
        sprawdzTeraz,
        pobierzIZainstaluj,
        odlozNapozniej,
        uruchomPonownie,
      }}
    >
      {children}
    </UpdateMonitorContext.Provider>
  );
}

/**
 * Natywne powiadomienie systemowe - raz na wersję.
 *
 * Wyskakuje nad wszystkimi oknami, więc powtarzanie go co dziesięć minut dla tej samej wersji
 * byłoby udręką. Brak uprawnienia albo brak środowiska Tauri nie jest błędem - powiadomienie
 * w aplikacji i tak jest widoczne.
 */
async function pokazNatywnePowiadomienie(wersja: string): Promise<void> {
  try {
    if (!czyPokazacNatywnePowiadomienie(wersja, wczytajOstatnioPowiadomionaWersje())) {
      return;
    }
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let zgoda = await isPermissionGranted();
    if (!zgoda) {
      zgoda = (await requestPermission()) === "granted";
    }
    if (!zgoda) {
      return;
    }
    sendNotification({
      title: "Dziennik Tradera - dostępna aktualizacja",
      body: `Nowa wersja ${wersja}. Otwórz Ustawienia → Aktualizacje, aby ją zainstalować.`,
    });
    zapiszOstatnioPowiadomionaWersje(wersja);
  } catch {
    // Powiadomienie systemowe to dodatek - jego brak nie może przerwać sprawdzania aktualizacji.
  }
}

export function useUpdateMonitor(): UpdateMonitorValue {
  const context = useContext(UpdateMonitorContext);
  if (!context) {
    throw new Error("useUpdateMonitor musi być użyty wewnątrz <UpdateMonitorProvider>.");
  }
  return context;
}

/** Wariant dla komponentów, które mogą renderować się poza providerem (np. w testach). */
export function useOptionalUpdateMonitor(): UpdateMonitorValue | null {
  return useContext(UpdateMonitorContext);
}
