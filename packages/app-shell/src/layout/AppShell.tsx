import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Sun } from 'lucide-react';
import { Button, useTheme, useThemeToggle } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';
import { primaryNavItems, secondaryNavItems, type NavItem } from '../navigation.js';
import { NetworkStatusBadge } from '../sync/NetworkStatusBadge.js';
import { CommandPalette } from '../command-palette/CommandPalette.js';
import styles from './AppShell.module.css';

function NavLinkItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function BottomNavLinkItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `${styles.bottomNavLink} ${isActive ? styles.bottomNavLinkActive : ''}`
      }
    >
      <Icon size={20} strokeWidth={1.75} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const toggleTheme = useThemeToggle();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isShortcut) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const allNavItems = [...primaryNavItems, ...secondaryNavItems];

  return (
    <div className={styles.shell}>
      <a href="#glowna-tresc" className={styles.skipLink}>
        {pl.nav.skipToContent}
      </a>

      <aside className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
        <div className={styles.brand}>{collapsed ? 'DT' : pl.common.appName}</div>

        <nav className={styles.navGroup} aria-label={pl.nav.mainNav}>
          {primaryNavItems.map((item) => (
            <NavLinkItem key={item.to} item={item} />
          ))}
        </nav>

        <div className={styles.navSpacer} />

        <nav className={styles.navGroup} aria-label={pl.nav.secondaryNav}>
          {secondaryNavItems.map((item) => (
            <NavLinkItem key={item.to} item={item} />
          ))}
        </nav>

        <button
          type="button"
          className={styles.collapseButton}
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? pl.nav.expandSidebar : pl.nav.collapseSidebar}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={styles.searchTrigger}
            onClick={() => setPaletteOpen(true)}
            aria-label={pl.nav.openCommandPalette}
          >
            <Search size={16} />
            <span>{pl.common.search}</span>
            <kbd className={styles.kbd}>Ctrl K</kbd>
          </button>

          <div className={styles.topBarActions}>
            <NetworkStatusBadge />
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={pl.theme.toggle}
              title={pl.theme.toggle}
            >
              {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled
              title="Dostępne po ukończeniu modułu Transakcje (Kamień 3)."
              aria-disabled="true"
            >
              <Plus size={16} />
              {pl.common.addTransaction}
            </Button>
          </div>
        </header>

        <main id="glowna-tresc" className={styles.content} tabIndex={-1}>
          <Outlet />
        </main>

        <nav className={styles.bottomNav} aria-label={pl.nav.mobileNav}>
          {allNavItems.map((item) => (
            <BottomNavLinkItem key={item.to} item={item} />
          ))}
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
