import { useLocation, useNavigate } from "react-router";
import type { ReactElement } from "react";
import { Moon, Plus, Sun } from "lucide-react";
import { useTheme } from "../app/ThemeProvider";
import { Button } from "../ui/components/Button/Button";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { NAV_GROUPS } from "./nav";
import styles from "./Header.module.css";

/** Parametr adresu otwierający formularz nowej transakcji na ekranie historii. Dzięki temu
 * skrót z górnego paska działa z KAŻDEGO widoku, bez dublowania formularza w powłoce. */
export const NEW_TRADE_PARAM = "nowa";

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
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const title = resolvePageTitle(location.pathname);

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.actions}>
        {/* Skrót dostępny z każdego widoku - prompt wymaga go w górnym pasku i jednocześnie
            zabrania duplikowania tej samej funkcji w menu bocznym. */}
        <Button
          variant="primary"
          onClick={() => {
            void navigate(`/transakcje?${NEW_TRADE_PARAM}=1`);
          }}
        >
          <Plus size={16} aria-hidden="true" /> Nowa transakcja
        </Button>
        <IconButton
          icon={
            theme === "dark" ? <Sun className={styles.icon} /> : <Moon className={styles.icon} />
          }
          aria-label={theme === "dark" ? "Przełącz na motyw jasny" : "Przełącz na motyw ciemny"}
          onClick={toggleTheme}
        />
      </div>
    </header>
  );
}
