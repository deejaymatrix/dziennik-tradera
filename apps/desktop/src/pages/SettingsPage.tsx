import type { ReactElement } from "react";
import { useTheme } from "../app/ThemeProvider";
import { useTauriQuery, type TauriQueryState } from "../app/useTauriQuery";
import type { AppStatus, DatabaseStatus } from "../app/tauriTypes";
import { Switch } from "../ui/components/Switch/Switch";
import styles from "./SettingsPage.module.css";

const ENV_LABELS: Record<string, string> = {
  development: "Deweloperskie",
  production: "Produkcyjne",
};

function renderAppStatus(state: TauriQueryState<AppStatus>): string {
  switch (state.kind) {
    case "loading":
      return "Sprawdzanie...";
    case "ready":
      return `połączony (wersja ${state.data.version}, ${ENV_LABELS[state.data.env] ?? state.data.env})`;
    case "error":
      return `niedostępny — ${state.message}`;
  }
}

function renderDatabaseStatus(state: TauriQueryState<DatabaseStatus>): string {
  if (state.kind === "loading") {
    return "Sprawdzanie...";
  }
  if (state.kind === "error") {
    return `nie można sprawdzić — ${state.message}`;
  }
  const db = state.data;
  if (db.status === "failed") {
    return `NIEDOSTĘPNA — ${db.reason}`;
  }
  return db.integrity_ok
    ? `otwarta, integralność OK (${db.path})`
    : `otwarta, ALE kontrola integralności nie powiodła się (${db.path})`;
}

export function SettingsPage(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const { state: appStatus } = useTauriQuery<AppStatus>("get_app_status");
  const { state: dbStatus } = useTauriQuery<DatabaseStatus>("get_database_status");

  return (
    <div className={styles.page}>
      <section className={styles.section} aria-labelledby="settings-appearance">
        <h2 id="settings-appearance" className={styles.sectionTitle}>
          Wygląd
        </h2>
        <div className={styles.row}>
          <Switch label="Motyw ciemny" checked={theme === "dark"} onChange={toggleTheme} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-data">
        <h2 id="settings-data" className={styles.sectionTitle}>
          Dane i kopie
        </h2>
        <p className={styles.placeholderNote}>Eksport i backup pojawią się w Celu 1.7.</p>
      </section>

      <section className={styles.section} aria-labelledby="settings-updates">
        <h2 id="settings-updates" className={styles.sectionTitle}>
          Aktualizacje
        </h2>
        <p className={styles.placeholderNote}>
          Produkcyjna autoaktualizacja pojawi się w Celu 1.8.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="settings-diagnostics">
        <h2 id="settings-diagnostics" className={styles.sectionTitle}>
          Informacje i diagnostyka
        </h2>
        <dl className={styles.statusList}>
          <dt>Backend Rust</dt>
          <dd>{renderAppStatus(appStatus)}</dd>
          <dt>Baza danych</dt>
          <dd>{renderDatabaseStatus(dbStatus)}</dd>
        </dl>
      </section>
    </div>
  );
}
