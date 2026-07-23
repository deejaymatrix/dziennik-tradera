import { useCallback, useEffect, useState } from "react";
import { invokeCommand } from "./invokeCommand";
import type { Preferences, PreferencesSectionKey } from "./types/preferences";

export interface UsePreferencesResult {
  preferences: Preferences | null;
  loading: boolean;
  /** Błąd ODCZYTU. Backend nigdy nie zawodzi z powodu treści preferencji (uszkodzone wracają
   * jako domyślne), więc to w praktyce oznacza brak działającej bazy. */
  error: string | null;
  saveSection: (section: PreferencesSectionKey, next: Preferences) => Promise<Preferences>;
  resetSection: (section: PreferencesSectionKey) => Promise<Preferences>;
  reload: () => Promise<void>;
}

/**
 * Wczytuje preferencje raz i udostępnia zapis JEDNEJ sekcji naraz.
 *
 * Zapis i reset zwracają KOMPLET preferencji prosto z backendu i to on staje się nowym stanem -
 * nie sklejamy lokalnie tego, co "powinno" wyjść. Dzięki temu interfejs pokazuje dokładnie to,
 * co faktycznie leży w bazie, nawet jeśli backend coś po drodze znormalizował.
 */
export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `loading` startuje jako `true` i schodzi po pierwszym wczytaniu. Celowo NIE podnosimy go
  // z powrotem przy ponownym wczytaniu: to ustawiłoby stan synchronicznie wewnątrz efektu
  // (kaskada renderów), a odświeżenie w miejscu i tak nie potrzebuje pełnego ekranu ładowania.
  const reload = useCallback(async () => {
    try {
      const loaded = await invokeCommand<Preferences>("get_preferences");
      setPreferences(loaded);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `reload` zaczyna się od `await`, więc żaden setState nie wykonuje się tu synchronicznie -
    // reguła nie widzi granicy asynchroniczności i zgłasza to fałszywie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const saveSection = useCallback(
    async (section: PreferencesSectionKey, next: Preferences): Promise<Preferences> => {
      const saved = await invokeCommand<Preferences>("update_preferences_section", {
        section,
        preferences: next,
      });
      setPreferences(saved);
      return saved;
    },
    [],
  );

  const resetSection = useCallback(
    async (section: PreferencesSectionKey): Promise<Preferences> => {
      const saved = await invokeCommand<Preferences>("reset_preferences_section", { section });
      setPreferences(saved);
      return saved;
    },
    [],
  );

  return { preferences, loading, error, saveSection, resetSection, reload };
}
