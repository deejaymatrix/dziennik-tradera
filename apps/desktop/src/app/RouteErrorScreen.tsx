import type { ReactElement } from "react";
import { useRouteError } from "react-router";
import { Button } from "../ui/components/Button/Button";

/** Ekran błędu dla tras routera - bez niego React Router pokazuje surowy, deweloperski zrzut
 * stosu w <pre> (znalezisko audytu Fazy 10). Ta sama treść/klasy co górny ErrorBoundary. */
export function RouteErrorScreen(): ReactElement {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div role="alert" className="recovery-screen">
      <h1>Wystąpił nieoczekiwany błąd</h1>
      <p>
        Aplikacja napotkała problem i nie mogła kontynuować wyświetlania tego widoku. Twoje dane
        lokalne nie zostały naruszone przez ten błąd interfejsu.
      </p>
      <p className="recovery-screen__detail">{message}</p>
      <div className="recovery-screen__actions">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Uruchom ponownie
        </Button>
      </div>
    </div>
  );
}
