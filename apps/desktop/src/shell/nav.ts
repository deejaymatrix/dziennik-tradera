import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Wallet,
  BookMarked,
  SlidersHorizontal,
  BarChart3,
  DatabaseBackup,
  Trash2,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grupy nawigacji wg sekcji 11.3 specyfikacji. Celowo pominięte: "Zasady" i "Psychologia"
 * (Etap 2, §2.2/§2.3) - nie mają jeszcze żadnej realnej funkcji za sobą, więc się nie
 * pokazuje ich jako martwych/"wkrótce" pozycji, tylko po prostu ukrywa do czasu Etapu 2.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Główne",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/transakcje", label: "Transakcje", icon: ListChecks },
      { to: "/kalendarz", label: "Kalendarz", icon: CalendarDays },
    ],
  },
  {
    label: "Konfiguracja",
    items: [
      { to: "/konta", label: "Konta", icon: Wallet },
      { to: "/strategie", label: "Strategie", icon: BookMarked },
      { to: "/instrumenty", label: "Instrumenty", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Analiza",
    items: [{ to: "/raporty", label: "Raporty", icon: BarChart3 }],
  },
  {
    label: "Dane",
    items: [
      { to: "/dane", label: "Eksport i kopie", icon: DatabaseBackup },
      { to: "/kosz", label: "Kosz", icon: Trash2 },
    ],
  },
  {
    label: "System",
    items: [{ to: "/ustawienia", label: "Ustawienia", icon: Settings }],
  },
];
