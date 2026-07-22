import type { ReactElement } from "react";
import { useTheme } from "../app/ThemeProvider";
import { useTauriQuery, type TauriQueryState } from "../app/useTauriQuery";
import { useUpdater } from "../app/useUpdater";
import type { AppStatus, DatabaseStatus } from "../app/tauriTypes";
import { Button } from "../ui/components/Button/Button";
import { Switch } from "../ui/components/Switch/Switch";
import { IntervalsSection } from "./IntervalsSection";
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

function UpdateSection(): ReactElement {
  const { state, checkForUpdates, downloadAndInstall, restartNow } = useUpdater();

  return (
    <section className={styles.section} aria-labelledby="settings-updates">
      <h2 id="settings-updates" className={styles.sectionTitle}>
        Aktualizacje
      </h2>

      {(state.kind === "idle" || state.kind === "error") && (
        <div className={styles.row}>
          <span className={styles.placeholderNote}>
            {state.kind === "error"
              ? `Błąd: ${state.message}`
              : "Sprawdź, czy dostępna jest nowa wersja."}
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              void checkForUpdates();
            }}
          >
            Sprawdź aktualizacje
          </Button>
        </div>
      )}

      {state.kind === "checking" && <p className={styles.placeholderNote}>Sprawdzanie...</p>}

      {state.kind === "up-to-date" && (
        <div className={styles.row}>
          <span className={styles.placeholderNote}>Masz najnowszą wersję.</span>
          <Button
            variant="secondary"
            onClick={() => {
              void checkForUpdates();
            }}
          >
            Sprawdź ponownie
          </Button>
        </div>
      )}

      {state.kind === "available" && (
        <div className={styles.updateCard}>
          <p className={styles.updateVersion}>
            Dostępna wersja <strong>{state.update.version}</strong> (obecna:{" "}
            {state.update.currentVersion})
          </p>
          {state.update.body && <p className={styles.updateNotes}>{state.update.body}</p>}
          <Button
            variant="primary"
            onClick={() => {
              void downloadAndInstall();
            }}
          >
            Pobierz i zainstaluj
          </Button>
        </div>
      )}

      {state.kind === "downloading" && (
        <p className={styles.placeholderNote}>
          Pobieranie...{state.progress !== null ? ` ${state.progress}%` : ""}
        </p>
      )}

      {state.kind === "ready-to-restart" && (
        <div className={styles.row}>
          <span className={styles.placeholderNote}>
            Aktualizacja pobrana. Uruchom aplikację ponownie, aby ją zastosować.
          </span>
          <Button
            variant="primary"
            onClick={() => {
              void restartNow();
            }}
          >
            Uruchom ponownie
          </Button>
        </div>
      )}
    </section>
  );
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

      <UpdateSection />

      {/* Stany emocjonalne przeniesione do grupy nawigacyjnej "Analiza" jako osobne okno
          "Stan emocjonalny" (sekcja 5 specyfikacji) - tutaj celowo nie zostaje po nich ani
          pozycja, ani odsyłacz. */}
      <IntervalsSection />

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
