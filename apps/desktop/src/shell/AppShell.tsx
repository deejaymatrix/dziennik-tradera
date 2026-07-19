import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useToast } from "../ui/components/Toast/ToastProvider";
import styles from "./AppShell.module.css";

const COLLAPSED_STORAGE_KEY = "dziennik-tradera.sidebar-collapsed";

function readStoredCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
}

export function AppShell(): ReactElement {
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);
  const { showToast } = useToast();

  useEffect(() => {
    // Ciche sprawdzenie aktualizacji przy starcie - tylko powiadomienie, nigdy automatyczne
    // pobranie/instalacja. Błąd (np. brak internetu) jest celowo wyciszony - to nie jest coś,
    // o czym trzeba informować użytkownika przy każdym starcie aplikacji.
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          showToast(
            `Dostępna jest nowa wersja ${update.version} - zainstaluj ją w Ustawieniach.`,
            "info",
          );
        }
      } catch {
        // Brak sieci / brak środowiska Tauri (podgląd w przeglądarce) - pomijamy w ciszy.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorazowe sprawdzenie przy starcie aplikacji.
  }, []);

  const toggleCollapsed = (): void => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className={styles.layout}>
      <a href="#main-content" className={styles.skipLink}>
        Przejdź do treści głównej
      </a>
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className={styles.contentColumn}>
        <Header />
        <main id="main-content" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
