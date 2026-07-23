import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { Header } from "./Header";
import { usePreferences } from "../app/PreferencesProvider";
import { shouldNotify } from "../app/quietHours";
import type { StartupView } from "../app/types/preferences";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./AppShell.module.css";

/** Ostatnio otwarta zakładka. To NIE jest ustawienie, tylko zapamiętany stan sesji - ustawieniem
 * jest wyłącznie przełącznik „otwieraj ostatnio używaną zakładkę", który mieszka w preferencjach. */
const LAST_ROUTE_STORAGE_KEY = "dziennik-tradera.last-route";

const STARTUP_ROUTES: Record<StartupView, string> = {
  dashboard: "/",
  transactions: "/transakcje",
  accounts: "/konta",
  reports: "/raporty",
};

export function AppShell(): ReactElement {
  const { preferences } = usePreferences();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  /** Preferencje wczytują się asynchronicznie, więc domyślny stan menu można nałożyć dopiero
   * po ich przyjściu - i tylko RAZ, żeby późniejszy zapis ustawień nie rozwijał menu z powrotem
   * pod palcami użytkownika. Robione podczas renderowania, a nie w efekcie (kaskada renderów). */
  const [startupApplied, setStartupApplied] = useState(false);
  if (preferences && !startupApplied) {
    setStartupApplied(true);
    setCollapsed(preferences.appearance.sidebar_collapsed);
  }

  /** To samo dla przekierowania na widok startowy - `useRef` czytany wyłącznie w efekcie. */
  const startupRouteAppliedRef = useRef(false);

  useEffect(() => {
    if (!preferences || startupRouteAppliedRef.current) {
      return;
    }
    startupRouteAppliedRef.current = true;

    // Wybór widoku startowego dotyczy WYŁĄCZNIE wejścia na stronę główną. Gdy aplikacja została
    // otwarta pod konkretnym adresem, przekierowanie byłoby wyrwaniem użytkownika z kontekstu.
    if (location.pathname !== "/") {
      return;
    }

    // „Otwieraj ostatnio używaną zakładkę" ma PIERWSZEŃSTWO przed wybranym widokiem startowym -
    // ta sama zależność jest opisana użytkownikowi w Ustawieniach.
    const target = preferences.behavior.open_last_tab
      ? (localStorage.getItem(LAST_ROUTE_STORAGE_KEY) ??
        STARTUP_ROUTES[preferences.behavior.startup_view])
      : STARTUP_ROUTES[preferences.behavior.startup_view];

    if (target !== "/") {
      void navigate(target, { replace: true });
    }
  }, [preferences, location.pathname, navigate]);

  useEffect(() => {
    localStorage.setItem(LAST_ROUTE_STORAGE_KEY, location.pathname);
  }, [location.pathname]);

  /** Sprawdzenie aktualizacji ma się wykonać DOKŁADNIE RAZ na uruchomienie. Bez tego znacznika
   * każdy zapis ustawień (zmiana `preferences`) odpalałby kolejne zapytanie do serwera. */
  const updateCheckedRef = useRef(false);

  useEffect(() => {
    // Czekamy na preferencje, żeby wiedzieć, czy w ogóle pokazywać komunikat - ale samo
    // sprawdzenie i tak dzieje się zawsze, niezależnie od przełącznika.
    if (!preferences || updateCheckedRef.current) {
      return;
    }
    updateCheckedRef.current = true;

    // Ciche sprawdzenie aktualizacji przy starcie - tylko powiadomienie, nigdy automatyczne
    // pobranie/instalacja. Błąd (np. brak internetu) jest celowo wyciszony - to nie jest coś,
    // o czym trzeba informować użytkownika przy każdym starcie aplikacji.
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) {
          return;
        }
        // SAMO SPRAWDZANIE dzieje się zawsze - przełącznik i ciche godziny decydują wyłącznie
        // o tym, czy pokazać komunikat. Informacja o nowej wersji i tak zostaje widoczna
        // w Ustawieniach → Aktualizacje.
        if (shouldNotify(preferences.notifications, "update_available")) {
          showToast(
            `Dostępna jest nowa wersja ${update.version} - zainstaluj ją w Ustawieniach.`,
            "info",
          );
        }
      } catch {
        // Brak sieci / brak środowiska Tauri (podgląd w przeglądarce) - pomijamy w ciszy.
      }
    })();
    // `showToast` jest w zależnościach dla porządku - efekt i tak wykonuje się najwyżej raz,
    // bo pilnuje tego `updateCheckedRef`.
  }, [preferences, showToast]);

  // Zwinięcie menu w trakcie pracy jest świadomie NIETRWAŁE: ustawieniem jest „domyślny stan
  // menu bocznego", więc zapisywanie tu drugiej wartości dawałoby dwa źródła prawdy dla jednej
  // rzeczy i przy następnym starcie nie byłoby wiadomo, które wygrywa.
  const toggleCollapsed = (): void => {
    setCollapsed((current) => !current);
  };

  return (
    <div className={styles.layout}>
      <a href="#main-content" className={styles.skipLink}>
        Przejdź do treści głównej
      </a>
      <CommandPalette />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        showLabels={preferences?.appearance.show_nav_labels ?? true}
      />
      <div className={styles.contentColumn}>
        <Header />
        <main id="main-content" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
