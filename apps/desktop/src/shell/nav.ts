import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Wallet,
  BookMarked,
  ScrollText,
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
 * Grupy nawigacji wg sekcji 11.3 specyfikacji. Celowo pominięta: "Psychologia" (Etap 2, §2.3)
 * - nie ma jeszcze żadnej realnej funkcji za sobą, więc się jej nie pokazuje jako martwej/
 * "wkrótce" pozycji, tylko po prostu ukrywa do czasu Etapu 2. "Zasady handlu" (Faza 8
 * modyfikacji) to osobisty regulamin użytkownika - patrz ZasadyHandluPage.
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
      { to: "/zasady-handlu", label: "Zasady handlu", icon: ScrollText },
      // "Szablony instrumentów" celowo NIE ma już własnej pozycji w nawigacji - zakładanie
      // szablonu i import danych brokera dzieją się przy polu "Szablon" na ekranie Instrumenty,
      // a pełne zarządzanie (zmiana nazwy, kopia, przypisanie konta, Kosz) jest dostępne stamtąd
      // pod trasą /szablony-instrumentow. Jeden ekran mniej zamiast dwóch robiących to samo.
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
