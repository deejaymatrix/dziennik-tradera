import type { ReactElement } from "react";
import { RouterProvider } from "react-router";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { ThemeProvider } from "./app/ThemeProvider";
import { router } from "./app/router";
import { ToastProvider } from "./ui/components/Toast/ToastProvider";
import "./App.css";

function App(): ReactElement {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
