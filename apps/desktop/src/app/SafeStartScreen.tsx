import type { ReactElement } from "react";
import type { AppStatus, DatabaseStatus } from "./tauriTypes";
import { useTauriQuery } from "./useTauriQuery";

const ENV_LABELS: Record<string, string> = {
  development: "Deweloperskie",
  production: "Produkcyjne",
};

function renderAppStatus(state: ReturnType<typeof useTauriQuery<AppStatus>>): string {
  switch (state.kind) {
    case "loading":
      return "Sprawdzanie...";
    case "ready":
      return `połączony (wersja ${state.data.version}, ${ENV_LABELS[state.data.env] ?? state.data.env})`;
    case "error":
      return `niedostępny — ${state.message}`;
  }
}

function renderDatabaseStatus(state: ReturnType<typeof useTauriQuery<DatabaseStatus>>): string {
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

export function SafeStartScreen(): ReactElement {
  const appStatus = useTauriQuery<AppStatus>("get_app_status");
  const dbStatus = useTauriQuery<DatabaseStatus>("get_database_status");

  return (
    <main className="start-screen">
      <h1>Dziennik Tradera</h1>
      <p className="start-screen__subtitle">Lokalny dziennik transakcji tradingowych.</p>

      <dl className="start-screen__status">
        <dt>Backend Rust</dt>
        <dd>{renderAppStatus(appStatus)}</dd>
        <dt>Baza danych</dt>
        <dd>{renderDatabaseStatus(dbStatus)}</dd>
      </dl>

      <p className="start-screen__note">
        Fundament aplikacji i lokalna baza danych (Cel 1.1–1.2) działają. Interfejs do kont,
        transakcji i raportów pojawi się w kolejnych krokach budowy — backend już to obsługuje, ale
        nie ma tu jeszcze ekranów.
      </p>
    </main>
  );
}
