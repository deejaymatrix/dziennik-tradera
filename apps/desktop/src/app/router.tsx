import { createBrowserRouter } from "react-router";
import { RouteErrorScreen } from "./RouteErrorScreen";
import { AppShell } from "../shell/AppShell";
import { DashboardPage } from "../pages/DashboardPage";
import { TransactionsPage } from "../pages/TransactionsPage";
import { CalendarPage } from "../pages/CalendarPage";
import { AccountsPage } from "../pages/AccountsPage";
import { StrategiesPage } from "../pages/StrategiesPage";
import { InstrumentsPage } from "../pages/InstrumentsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { DataPage } from "../pages/DataPage";
import { KoszPage } from "../pages/KoszPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ZasadyHandluPage } from "../pages/ZasadyHandluPage";
import { SzablonyInstrumentowPage } from "../pages/SzablonyInstrumentowPage";
import { KalkulatorPozycjiPage } from "../pages/KalkulatorPozycjiPage";
import { StanEmocjonalnyPage } from "../pages/StanEmocjonalnyPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "transakcje", element: <TransactionsPage /> },
      { path: "kalendarz", element: <CalendarPage /> },
      { path: "konta", element: <AccountsPage /> },
      { path: "strategie", element: <StrategiesPage /> },
      { path: "zasady-handlu", element: <ZasadyHandluPage /> },
      { path: "szablony-instrumentow", element: <SzablonyInstrumentowPage /> },
      { path: "instrumenty", element: <InstrumentsPage /> },
      { path: "kalkulator-pozycji", element: <KalkulatorPozycjiPage /> },
      { path: "raporty", element: <ReportsPage /> },
      { path: "stan-emocjonalny", element: <StanEmocjonalnyPage /> },
      { path: "dane", element: <DataPage /> },
      { path: "kosz", element: <KoszPage /> },
      { path: "ustawienia", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
