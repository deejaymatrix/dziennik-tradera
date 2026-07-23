import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { invokeCommand } from "./invokeCommand";
import type {
  AppearancePreferences,
  Preferences,
  PreferencesSectionKey,
} from "./types/preferences";

export interface PreferencesContextValue {
  preferences: Preferences | null;
  loading: boolean;
  /** Błąd ODCZYTU. Backend nigdy nie zawodzi z powodu treści preferencji (uszkodzone wracają
   * jako domyślne), więc w praktyce oznacza to brak działającej bazy. */
  error: string | null;
  saveSection: (section: PreferencesSectionKey, next: Preferences) => Promise<Preferences>;
  resetSection: (section: PreferencesSectionKey) => Promise<Preferences>;
  /**
   * Nakłada wygląd NA ŻYWO, bez zapisu. Specyfikacja wymaga podglądu ustawień wyglądu, który
   * staje się trwały dopiero po kliknięciu „Zapisz zmiany" - `null` wraca do stanu zapisanego.
   */
  previewAppearance: (appearance: AppearancePreferences | null) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Jasny czy ciemny tekst na tle danego koloru - z luminancji, a nie „na oko". Bez tego własny
 * kolor akcentu potrafi dać biały tekst na jasnym żółtym, czyli coś zupełnie nieczytelnego. */
function contrastColorFor(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return "#1a1506";
  }
  const channel = (offset: number): number => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.45 ? "#10151d" : "#ffffff";
}

/** Rozwiązuje motyw „zgodny z systemem" na konkretny. */
function resolveTheme(theme: AppearancePreferences["theme"]): "dark" | "light" {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyAppearance(appearance: AppearancePreferences): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolveTheme(appearance.theme));
  root.setAttribute("data-ui-scale", appearance.ui_scale);
  root.setAttribute("data-density", appearance.density);
  root.setAttribute("data-radius", appearance.corner_radius);
  root.setAttribute("data-reduce-motion", String(appearance.reduce_motion));
  root.setAttribute("data-animations", appearance.animations ? "on" : "off");
  // Styl inline wygrywa z regułą motywu jasnego, i o to chodzi - to świadomy wybór użytkownika.
  root.style.setProperty("--color-accent", appearance.accent_color);
  root.style.setProperty("--color-accent-contrast", contrastColorFor(appearance.accent_color));
}

/**
 * Jedno źródło prawdy dla preferencji: wczytuje je raz przy starcie, udostępnia zapis sekcji
 * i - co najważniejsze - NAKŁADA ustawienia wyglądu na dokument. Bez tego przełączniki byłyby
 * atrapami, czego specyfikacja zabrania wprost.
 */
export function PreferencesProvider({ children }: { children: ReactNode }): ReactElement {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AppearancePreferences | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setPreferences(await invokeCommand<Preferences>("get_preferences"));
        setError(null);
      } catch (e) {
        // Brak backendu nie może zostawić aplikacji bez wyglądu - zostaje wtedy domyślny motyw
        // z tokenów CSS, a ustawienia po prostu zgłaszają błąd odczytu.
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Podgląd (jeśli trwa edycja) ma pierwszeństwo nad stanem zapisanym.
  const effectiveAppearance = preview ?? preferences?.appearance ?? null;

  useEffect(() => {
    if (effectiveAppearance) {
      applyAppearance(effectiveAppearance);
    }
  }, [effectiveAppearance]);

  // Motyw „zgodny z systemem" musi reagować na zmianę ustawienia Windows w trakcie działania.
  useEffect(() => {
    if (effectiveAppearance?.theme !== "system") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (): void => {
      applyAppearance(effectiveAppearance);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [effectiveAppearance]);

  const saveSection = useCallback(
    async (section: PreferencesSectionKey, next: Preferences): Promise<Preferences> => {
      const saved = await invokeCommand<Preferences>("update_preferences_section", {
        section,
        preferences: next,
      });
      setPreferences(saved);
      setPreview(null);
      return saved;
    },
    [],
  );

  const resetSection = useCallback(
    async (section: PreferencesSectionKey): Promise<Preferences> => {
      const saved = await invokeCommand<Preferences>("reset_preferences_section", { section });
      setPreferences(saved);
      setPreview(null);
      return saved;
    },
    [],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      loading,
      error,
      saveSection,
      resetSection,
      previewAppearance: setPreview,
    }),
    [preferences, loading, error, saveSection, resetSection],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences musi być użyty wewnątrz <PreferencesProvider>.");
  }
  return context;
}
