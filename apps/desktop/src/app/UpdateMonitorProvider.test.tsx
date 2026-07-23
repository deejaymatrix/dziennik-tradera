import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { UpdateMonitorProvider, useUpdateMonitor } from "./UpdateMonitorProvider";
import { INTERWAL_MS, MIN_ODSTEP_PIERWSZY_PLAN_MS, STARTOWE_OPOZNIENIE_MS } from "./updateMonitor";

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock("./invokeCommand", () => ({ invokeCommand }));

const useOptionalPreferencesMock = vi.hoisted(() => vi.fn<() => unknown>(() => null));
vi.mock("./PreferencesProvider", () => ({
  useOptionalPreferences: useOptionalPreferencesMock,
}));

const sendNotification = vi.hoisted(() => vi.fn());
const isPermissionGranted = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification,
  isPermissionGranted,
  requestPermission: vi.fn(async () => "granted"),
}));

const checkUpdate = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkUpdate }));

/**
 * Testy pilnują wymagań z obowiązkowego audytu Celu 1.8, sekcja 2: „zweryfikuj, że istnieje
 * DOKŁADNIE JEDEN centralny serwis" oraz „timery i nasłuchiwanie zdarzeń nie duplikują się
 * po zmianie widoku i ponownym renderowaniu komponentów".
 *
 * To są rzeczy, których nie da się sprawdzić przeglądem kodu - podwójny timer wygląda w kodzie
 * dokładnie tak samo jak pojedynczy. Dlatego liczymy tu realne wywołania.
 */

function Podglad(): React.ReactElement {
  const { stan, znacznikDostepnej, dostepnaWersja } = useUpdateMonitor();
  return (
    <div>
      <span data-testid="rodzaj">{stan.rodzaj}</span>
      <span data-testid="znacznik">{znacznikDostepnej ? "tak" : "nie"}</span>
      <span data-testid="wersja">{dostepnaWersja ?? "brak"}</span>
    </div>
  );
}

describe("UpdateMonitorProvider - jeden centralny serwis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeCommand.mockReset();
    invokeCommand.mockResolvedValue({ kind: "bez_zmian" });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("nie sprawdza niczego przed upływem opóźnienia startowego", () => {
    // Start aplikacji ma być nieblokowany - sprawdzenie nie może wystartować od razu.
    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );
    expect(invokeCommand).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS - 1);
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("po opóźnieniu startowym sprawdza dokładnie raz", async () => {
    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    expect(invokeCommand).toHaveBeenCalledTimes(1);
    expect(invokeCommand).toHaveBeenCalledWith("check_update_manifest", { etag: null });
  });

  it("przerysowanie dzieci NIE tworzy drugiego timera", async () => {
    // Najgroźniejszy przypadek z audytu: gdyby harmonogram siedział w efekcie zależnym od
    // czegokolwiek zmiennego, każde przerysowanie dokładałoby kolejny timer i po godzinie
    // pracy aplikacja odpytywałaby serwer dziesiątki razy na minutę.
    function Przerysowywany(): React.ReactElement {
      const [licznik, setLicznik] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setLicznik((n) => n + 1)}>
            przerysuj
          </button>
          <span data-testid="licznik">{licznik}</span>
          <Podglad />
        </div>
      );
    }

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Przerysowywany />
      </UpdateMonitorProvider>,
    );

    // Dziesięć przerysowań przed pierwszym sprawdzeniem.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        screen.getByRole("button", { name: "przerysuj" }).click();
      });
    }
    expect(screen.getByTestId("licznik").textContent).toBe("10");

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    expect(invokeCommand).toHaveBeenCalledTimes(1);
  });

  it("kolejne cykle następują co ustalony odstęp, po jednym sprawdzeniu na cykl", async () => {
    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    // Odstęp ma losowe przesunięcie ±10%, więc przesuwamy o pełny interwał z zapasem.
    await act(async () => {
      vi.advanceTimersByTime(INTERWAL_MS * 1.2);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(INTERWAL_MS * 1.2);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(3);
  });

  it("odmontowanie zatrzymuje harmonogram - żadnych sprawdzeń po zamknięciu", async () => {
    // Wyciek timera po odmontowaniu to klasyczny wyciek pamięci wymieniony w audycie.
    const { unmount } = render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(INTERWAL_MS * 5);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);
  });

  it("kolejne sprawdzenie nie nakłada się na trwające", async () => {
    // Timer, powrót sieci i kliknięcie użytkownika mogą trafić w tę samą chwilę.
    let odblokuj: (() => void) | null = null;
    invokeCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          odblokuj = () => resolve({ kind: "bez_zmian" });
        }),
    );

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    // Powrót aplikacji na pierwszy plan w trakcie trwającego sprawdzenia.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    await act(async () => {
      odblokuj?.();
    });
  });
});

describe("UpdateMonitorProvider - reakcja na zdarzenia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeCommand.mockReset();
    invokeCommand.mockResolvedValue({ kind: "bez_zmian" });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("odzyskanie połączenia sprawdza od razu, bez czekania na cykl", async () => {
    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(invokeCommand).toHaveBeenCalledTimes(2);
  });

  it("powrót na pierwszy plan tuż po sprawdzeniu NIE odpytuje serwera", async () => {
    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    // Użytkownik przełącza okna dziesiątki razy na godzinę - każde przełączenie nie może
    // być żądaniem do serwera.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    expect(invokeCommand).toHaveBeenCalledTimes(1);
  });

  it("powrót na pierwszy plan po pięciu minutach sprawdza ponownie", async () => {
    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    const poStarcie = invokeCommand.mock.calls.length;

    // Przesuwamy zegar systemowy, bo próg liczy się z `Date.now()`, nie z timera.
    const teraz = Date.now();
    vi.setSystemTime(teraz + MIN_ODSTEP_PIERWSZY_PLAN_MS + 1_000);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(invokeCommand.mock.calls.length).toBe(poStarcie + 1);
  });
});

describe("UpdateMonitorProvider - stan dla użytkownika", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeCommand.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("manifest zapowiadający wersję, którą użytkownik już ma, NIE woła wtyczki", async () => {
    // Bez tego sprawdzenia każdy cykl po zmianie manifestu uruchamiałby pełne pobranie
    // i weryfikację podpisu, mimo że nie ma czego instalować.
    invokeCommand.mockResolvedValue({
      kind: "nowy",
      manifest: { version: "1.0.0" },
      etag: 'W/"abc"',
    });

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    expect(screen.getByTestId("znacznik").textContent).toBe("nie");
    expect(screen.getByTestId("rodzaj").textContent).toBe("bezczynny");
  });

  it("nieudane sprawdzenie automatyczne jest CICHE - nie zmienia stanu widocznego", async () => {
    // Błąd monitorowania nie ma prawa przeszkadzać w pracy ani straszyć użytkownika,
    // który o nic nie prosił.
    invokeCommand.mockRejectedValue(new Error("network error"));

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    expect(screen.getByTestId("rodzaj").textContent).toBe("bezczynny");
  });

  it("po serii błędów odstęp rośnie, ale sprawdzanie nie ustaje", async () => {
    invokeCommand.mockRejectedValue(new Error("network error"));

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    // Po pierwszym błędzie odstęp to 2x interwał - po samym interwale nic się nie dzieje.
    await act(async () => {
      vi.advanceTimersByTime(INTERWAL_MS * 1.2);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(INTERWAL_MS);
    });
    expect(invokeCommand).toHaveBeenCalledTimes(2);
  });
});

describe("UpdateMonitorProvider - natywne powiadomienie respektuje preferencje", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeCommand.mockReset();
    checkUpdate.mockReset();
    sendNotification.mockReset();
    isPermissionGranted.mockReset().mockResolvedValue(true);
    useOptionalPreferencesMock.mockReset().mockReturnValue(null);
    localStorage.clear();

    // Manifest zapowiada wersję WYŻSZĄ niż bieżąca, żeby dojść aż do wtyczki `check()`.
    invokeCommand.mockResolvedValue({
      kind: "nowy",
      manifest: { version: "1.1.0" },
      etag: null,
    });
    checkUpdate.mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: null,
      downloadAndInstall: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("znacznik i karta pokazują się zawsze, nawet gdy powiadomienia aktualizacji są wyłączone", async () => {
    // Sekcja 6 audytu: trwały znacznik NIE jest gated przez preferencje - tylko natywne
    // powiadomienie systemowe nimi steruje.
    useOptionalPreferencesMock.mockReturnValue({
      notifications: { update_available: false },
    });

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    expect(screen.getByTestId("znacznik").textContent).toBe("tak");
    expect(screen.getByTestId("wersja").textContent).toBe("1.1.0");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("przełącznik update_available=false wycisza WYŁĄCZNIE natywne powiadomienie", async () => {
    useOptionalPreferencesMock.mockReturnValue({
      notifications: { update_available: true },
    });

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("ciche godziny wyciszają natywne powiadomienie o aktualizacji tak samo jak inne niekrytyczne", async () => {
    useOptionalPreferencesMock.mockReturnValue({
      notifications: {
        update_available: true,
        quiet_hours_enabled: true,
        quiet_hours_start: "00:00",
        quiet_hours_end: "23:59",
      },
    });

    render(
      <UpdateMonitorProvider wersjaBiezaca="1.0.0">
        <Podglad />
      </UpdateMonitorProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(STARTOWE_OPOZNIENIE_MS);
    });

    // Trwały znacznik zostaje mimo cichych godzin - tylko natywny popup jest wyciszony.
    expect(screen.getByTestId("znacznik").textContent).toBe("tak");
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
