import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { usePreferences } from "./PreferencesProvider";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Cienka nakładka na preferencje, wyłącznie dla szybkiego przełącznika motywu w nagłówku.
 *
 * Motyw NIE jest już trzymany w localStorage. Jego jedynym źródłem prawdy są preferencje
 * użytkownika w bazie (`app_settings`), a nakładanie go na dokument robi `PreferencesProvider` -
 * ten komponent tylko odczytuje aktualną wartość i zapisuje przeciwną. Dwa niezależne źródła
 * prawdy dla tego samego ustawienia rozjeżdżały się przy pierwszej zmianie w Ustawieniach.
 *
 * Przełącznik w nagłówku celowo przeskakuje wyłącznie między ciemnym a jasnym. Trzecia opcja,
 * „zgodny z systemem", zostaje w Ustawieniach - w jednoklikowym przełączniku byłaby myląca.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const { preferences, saveSection } = usePreferences();

  const value = useMemo<ThemeContextValue>(() => {
    const appearance = preferences?.appearance;
    const resolved: Theme =
      appearance?.theme === "light"
        ? "light"
        : appearance?.theme === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : "dark";

    return {
      theme: resolved,
      toggleTheme: () => {
        if (!preferences) {
          return;
        }
        void saveSection("appearance", {
          ...preferences,
          appearance: {
            ...preferences.appearance,
            theme: resolved === "dark" ? "light" : "dark",
          },
        });
      },
    };
  }, [preferences, saveSection]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme musi być użyty wewnątrz <ThemeProvider>.");
  }
  return context;
}
