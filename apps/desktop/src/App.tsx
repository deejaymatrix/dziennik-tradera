import type { ReactElement } from "react";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { SafeStartScreen } from "./app/SafeStartScreen";
import "./App.css";

function App(): ReactElement {
  return (
    <ErrorBoundary>
      <SafeStartScreen />
    </ErrorBoundary>
  );
}

export default App;
