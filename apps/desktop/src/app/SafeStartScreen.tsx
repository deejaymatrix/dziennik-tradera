import type { ReactElement } from "react";
import { useAppStatus } from "./useAppStatus";

const ENV_LABELS: Record<string, string> = {
  development: "Deweloperskie",
  production: "Produkcyjne",
};

export function SafeStartScreen(): ReactElement {
  const status = useAppStatus();

  return (
    <main className="start-screen">
      <h1>Dziennik Tradera</h1>
      <p className="start-screen__subtitle">Lokalny dziennik transakcji tradingowych.</p>

      <dl className="start-screen__status">
        <dt>Backend Rust</dt>
        <dd>
          {status.kind === "loading" && "Sprawdzanie..."}
          {status.kind === "ready" &&
            `połączony (wersja ${status.status.version}, ${ENV_LABELS[status.status.env] ?? status.status.env})`}
          {status.kind === "error" && `niedostępny — ${status.message}`}
        </dd>
      </dl>

      <p className="start-screen__note">
        Fundament aplikacji (Cel 1.1) jest uruchomiony. Konta, transakcje, baza danych i raporty
        pojawią się w kolejnych krokach budowy — jeszcze tu nie działają.
      </p>
    </main>
  );
}
