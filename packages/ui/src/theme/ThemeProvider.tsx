import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextValue {
  /** Wybór użytkownika: 'system' oznacza podążanie za prefers-color-scheme. */
  theme: ThemePreference;
  /** Faktycznie zastosowany motyw ('system' rozwiązany do 'dark' albo 'light'). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Motyw początkowy - domyślnie 'dark' zgodnie ze specyfikacją (§10: ciemny jako domyślny). */
  defaultTheme?: ThemePreference;
}

/**
 * Utrzymuje wybór motywu wyłącznie w pamięci procesu (resetuje się po odświeżeniu).
 * Trwałe zapamiętanie preferencji użytkownika trafi do właściwego modelu Ustawień
 * (docs/specyfikacja-produktu.md §8.14) w Kamieniu 2/3, zamiast do localStorage -
 * patrz docs/decyzje-architektoniczne.md (ADR o motywie).
 */
export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemePreference>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(resolveSystemTheme);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => setSystemTheme(media.matches ? 'light' : 'dark');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme musi być użyty wewnątrz <ThemeProvider>.');
  }
  return context;
}

export function useSetTheme(): (theme: ThemePreference) => void {
  return useTheme().setTheme;
}

export const useThemeToggle = (): (() => void) => {
  const { resolvedTheme, setTheme } = useTheme();
  return useCallback(
    () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    [resolvedTheme, setTheme],
  );
};
