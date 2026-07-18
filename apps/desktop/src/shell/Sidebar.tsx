import { NavLink } from "react-router";
import type { ReactElement } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { NAV_GROUPS } from "./nav";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps): ReactElement {
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
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={styles.icon} aria-hidden="true" />
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
