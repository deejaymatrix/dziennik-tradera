import { BrowserRouter, Route, Routes } from 'react-router';
import { ThemeProvider } from '@dziennik/ui';
import { AppShell } from './layout/AppShell.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { SyncCenterPage } from './pages/SyncCenterPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { LoginPage } from './auth/LoginPage.js';
import { OnboardingPage } from './onboarding/OnboardingPage.js';
import { ROUTES } from './routes.js';

/**
 * Drzewo tras bez opakowania routerem - wydzielone osobno, żeby testy mogły
 * podać własny MemoryRouter (kontrolowany initialEntries) zamiast BrowserRoutera.
 */
export function AppRouteTree() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route path={ROUTES.onboarding} element={<OnboardingPage />} />
      <Route element={<AppShell />}>
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
        <Route path={ROUTES.syncCenter} element={<SyncCenterPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/**
 * Korzeń routingu wspólny dla apps/web i apps/desktop (ten sam frontend).
 * Brak jeszcze ochrony tras prawdziwym uwierzytelnianiem - trafi to tutaj
 * w Kamieniu 2 razem z Supabase Auth (patrz packages/app-shell/src/auth).
 */
export function AppRoutes() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRouteTree />
      </BrowserRouter>
    </ThemeProvider>
  );
}
