import type { ReactElement } from "react";
import { RouterProvider } from "react-router";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { PreferencesProvider } from "./app/PreferencesProvider";
import { ThemeProvider } from "./app/ThemeProvider";
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
              <RouterProvider router={router} />
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}

export default App;
