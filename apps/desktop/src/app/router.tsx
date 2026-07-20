import { createBrowserRouter } from "react-router";
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
import { NotFoundPage } from "../pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "transakcje", element: <TransactionsPage /> },
      { path: "kalendarz", element: <CalendarPage /> },
      { path: "konta", element: <AccountsPage /> },
      { path: "strategie", element: <StrategiesPage /> },
      { path: "instrumenty", element: <InstrumentsPage /> },
      { path: "raporty", element: <ReportsPage /> },
      { path: "dane", element: <DataPage /> },
      { path: "kosz", element: <KoszPage /> },
      { path: "ustawienia", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
