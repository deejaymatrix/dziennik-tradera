import { useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router";
import { BarChart2, Wallet, SlidersHorizontal, ListPlus } from "lucide-react";
import { IconButton } from "../ui/components/IconButton/IconButton";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import styles from "./DashboardPage.module.css";

const CHECKLIST_DISMISSED_KEY = "dziennik-tradera.dashboard-checklist-dismissed";

export function DashboardPage(): ReactElement {
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "true",
  );

  const dismiss = (): void => {
    localStorage.setItem(CHECKLIST_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className={styles.page}>
      {!dismissed && (
        <section className={styles.checklist} aria-label="Lista startowa">
          <div className={styles.checklistHeader}>
            <p className={styles.checklistTitle}>Start pracy</p>
            <IconButton icon="×" aria-label="Zamknij listę startową" onClick={dismiss} />
          </div>
          <ul className={styles.checklistItems}>
            <li>
              <Link to="/konta" className={styles.checklistLink}>
                <Wallet size={16} aria-hidden="true" />
                Utwórz konto
              </Link>
            </li>
            <li>
              <Link to="/instrumenty" className={styles.checklistLink}>
                <SlidersHorizontal size={16} aria-hidden="true" />
                Sprawdź instrumenty
              </Link>
            </li>
            <li>
              <Link to="/transakcje" className={styles.checklistLink}>
                <ListPlus size={16} aria-hidden="true" />
                Dodaj pierwszą transakcję
              </Link>
            </li>
          </ul>
        </section>
      )}

      <EmptyState
        icon={<BarChart2 size={32} aria-hidden="true" />}
        title="Brak danych do podsumowania"
        description="P&L, win rate, profit factor, expectancy i krzywa kapitału pojawią się tutaj, gdy powstaną konta i transakcje (Cel 1.4–1.6)."
      />
    </div>
  );
}
