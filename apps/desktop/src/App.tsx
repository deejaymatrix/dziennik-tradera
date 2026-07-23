import type { ReactElement } from "react";
import { RouterProvider } from "react-router";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { PreferencesProvider } from "./app/PreferencesProvider";
import { ThemeProvider } from "./app/ThemeProvider";
import { UpdateMonitorProvider } from "./app/UpdateMonitorProvider";
import { router } from "./app/router";
import { ConfirmProvider } from "./ui/components/ConfirmDialog/ConfirmDialog";
import { ToastProvider } from "./ui/components/Toast/ToastProvider";
import "./App.css";

function App(): ReactElement {
  return (
    <ErrorBoundary>
      {/* Preferencje muszą być NAD motywem - `ThemeProvider` jest teraz tylko nakładką na nie,
          żeby nie istniały dwa niezależne źródła prawdy dla tego samego ustawienia. */}
      <PreferencesProvider>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              {/* Monitorowanie aktualizacji siedzi NAD routerem, żeby zmiana widoku nie
                  odmontowywała go i nie tworzyła drugiego harmonogramu - wymaganie Celu 1.8
                  mówi wprost o jednym centralnym serwisie zamiast timerów w widokach. */}
              <UpdateMonitorProvider>
                <RouterProvider router={router} />
              </UpdateMonitorProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}

export default App;
