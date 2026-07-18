/** Typowane ścieżki tras aplikacji - jedno źródło prawdy dla nawigacji i linków. */
export const ROUTES = {
  dashboard: '/',
  login: '/logowanie',
  onboarding: '/onboarding',
  settings: '/ustawienia',
  syncCenter: '/synchronizacja',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
