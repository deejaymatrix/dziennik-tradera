import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

window.addEventListener("error", (event) => {
  console.error("[GlobalError] Nieobsłużony wyjątek:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[GlobalError] Nieobsłużone odrzucenie obietnicy:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
