import { useLocation } from "react-router";
import type { ReactElement } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../app/ThemeProvider";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { NAV_GROUPS } from "./nav";
import styles from "./Header.module.css";

function resolvePageTitle(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)) {
        return item.label;
      }
    }
  }
  return "Dziennik Tradera";
}

export function Header(): ReactElement {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const title = resolvePageTitle(location.pathname);

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <IconButton
        icon={theme === "dark" ? <Sun className={styles.icon} /> : <Moon className={styles.icon} />}
        aria-label={theme === "dark" ? "Przełącz na motyw jasny" : "Przełącz na motyw ciemny"}
        onClick={toggleTheme}
      />
    </header>
  );
}
