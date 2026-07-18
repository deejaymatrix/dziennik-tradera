import type { ComponentType } from 'react';
import { LayoutDashboard, RefreshCw, Settings } from 'lucide-react';
import { pl } from '@dziennik/i18n';
import { ROUTES } from './routes.js';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

/**
 * Pozycje nawigacji głównej. Celowo zawiera na razie tylko to, co faktycznie
 * istnieje (Kamień 1): Dashboard oraz strony infrastrukturalne (Ustawienia,
 * Centrum synchronizacji). Pozostałe 13 modułów z docs/specyfikacja-produktu.md
 * §8 dołączą do nawigacji dopiero razem ze swoją implementacją w Kamieniach 3-5,
 * zamiast pojawiać się teraz jako puste zaślepki.
 */
export const primaryNavItems: NavItem[] = [
  { to: ROUTES.dashboard, label: pl.nav.dashboard, icon: LayoutDashboard },
];

export const secondaryNavItems: NavItem[] = [
  { to: ROUTES.syncCenter, label: pl.nav.syncCenter, icon: RefreshCw },
  { to: ROUTES.settings, label: pl.nav.settings, icon: Settings },
];
