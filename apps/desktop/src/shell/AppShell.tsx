import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { Header } from "./Header";
import { usePreferences } from "../app/PreferencesProvider";
import { useOptionalUpdateMonitor } from "../app/UpdateMonitorProvider";
import type { StartupView } from "../app/types/preferences";
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

  // Sprawdzanie aktualizacji NIE mieszka już tutaj. Przeniesione do `UpdateMonitorProvider`
  // nad routerem: wymaganie Celu 1.8 mówi o jednym centralnym serwisie działającym przez cały
  // czas uruchomienia, a nie o sprawdzeniu wykonywanym raz przy montowaniu powłoki. Tamten
  // provider dodatkowo ponawia sprawdzanie co dziesięć minut, reaguje na powrót sieci
  // i na powrót aplikacji na pierwszy plan.

  // Kliknięcie natywnego powiadomienia systemowego ma otworzyć aplikację bezpośrednio na oknie
  // aktualizacji. `UpdateMonitorProvider` stoi NAD routerem i nie ma dostępu do `useNavigate`,
  // więc tylko zlicza kliknięcia (`zadanieOtwarciaUstawien`) - `AppShell`, który JEST wewnątrz
  // routera, obserwuje ten licznik i wykonuje samą nawigację. `useRef`, nie porównanie z
  // poprzednim propsem w renderze, bo efekt ma zareagować tylko na ZMIANĘ (w tym na DRUGIE
  // kliknięcie tego samego powiadomienia), a nie na każde przerysowanie.
  const monitor = useOptionalUpdateMonitor();
  const poprzednieZadanieRef = useRef(monitor?.zadanieOtwarciaUstawien ?? 0);
  useEffect(() => {
    if (!monitor) {
      return;
    }
    if (monitor.zadanieOtwarciaUstawien !== poprzednieZadanieRef.current) {
      poprzednieZadanieRef.current = monitor.zadanieOtwarciaUstawien;
      void navigate("/ustawienia");
    }
  }, [monitor, navigate]);

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
