import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./design/tokens.css";

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
