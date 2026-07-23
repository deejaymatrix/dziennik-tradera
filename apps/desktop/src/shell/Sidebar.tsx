import { NavLink } from "react-router";
import type { ReactElement } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { NAV_GROUPS } from "./nav";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Ustawienie „pokazuj podpisy przy ikonach" (Ustawienia → Wygląd → Nawigacja). Wyłączone
   * zostawia same ikony także w rozwiniętym menu. */
  showLabels?: boolean;
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  showLabels = true,
}: SidebarProps): ReactElement {
  // Zwinięte menu i tak pokazuje same ikony - podpisy mają sens wyłącznie w rozwiniętym.
  const labelsVisible = !collapsed && showLabels;

  return (
    <aside className={[styles.sidebar, collapsed && styles.collapsed].filter(Boolean).join(" ")}>
      <div className={styles.brandRow}>
        {!collapsed && <span className={styles.brandName}>Dziennik Tradera</span>}
        <IconButton
          icon={
            collapsed ? (
              <PanelLeftOpen className={styles.icon} />
            ) : (
              <PanelLeftClose className={styles.icon} />
            )
          }
          aria-label={collapsed ? "Rozwiń nawigację" : "Zwiń nawigację"}
          onClick={onToggleCollapsed}
        />
      </div>
      <nav className={styles.nav} aria-label="Główna nawigacja">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [styles.navLink, isActive && styles.navLinkActive].filter(Boolean).join(" ")
                }
                title={labelsVisible ? undefined : item.label}
              >
                <item.icon className={styles.icon} aria-hidden="true" />
                {/* Bez podpisu nazwa musi zostać dla czytników ekranu - inaczej nawigacja
                    zamienia się w zestaw nieopisanych ikon. */}
                <span className={labelsVisible ? styles.navLabel : "sr-only"}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
