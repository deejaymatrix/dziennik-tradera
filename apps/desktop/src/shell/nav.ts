import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Calculator,
  Wallet,
  BookMarked,
  ScrollText,
  SlidersHorizontal,
  BarChart3,
  HeartPulse,
  Clock,
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
 * Grupy nawigacji: Start, Handel, Analiza, Zarządzanie, System - grupowane po RODZAJU PRACY,
 * a nie po tym, czy coś jest „konfiguracją". Ten sam podział wymaga też sekcja 6.1 finalnego
 * promptu redesignu „TradingView Pro × Apple Fintech" - struktura się nie zmienia, zmienia się
 * wyłącznie warstwa wizualna (tokeny, kolory, komponenty).
 *
 * Dwie świadome decyzje względem listy z promptu:
 *
 * 1. „Nowa transakcja" NIE ma tu pozycji, mimo że prompt wymienia ją w grupie Handel. To akcja,
 *    a nie widok - otwiera się jako okno nad historią transakcji. Prompt w tej samej sekcji
 *    wymaga skrótu „Nowa transakcja" w GÓRNYM PASKU i zabrania duplikowania tej samej funkcji
 *    w dwóch miejscach, więc zostaje wyłącznie tam.
 * 2. Kalendarz, Interwały oraz Eksport i kopie nie występują na liście z promptu, ale są
 *    działającymi widokami. Redesign nie może usuwać istniejących funkcji, więc zamiast je
 *    ukrywać, trafiają do grupy pasującej do rodzaju pracy.
 *
 * Nadal celowo pominięta „Psychologia" (Etap 2) - nie ma za sobą żadnej realnej funkcji, więc
 * nie pokazujemy jej jako martwej pozycji „wkrótce".
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Start",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Handel",
    items: [
      { to: "/transakcje", label: "Historia transakcji", icon: ListChecks },
      { to: "/kalkulator-pozycji", label: "Kalkulator pozycji", icon: Calculator },
    ],
  },
  {
    label: "Analiza",
    items: [
      { to: "/raporty", label: "Raporty", icon: BarChart3 },
      { to: "/kalendarz", label: "Kalendarz", icon: CalendarDays },
      // Zarządzanie emocjami należy do analizy własnego handlu, a nie do konfiguracji aplikacji.
      { to: "/stan-emocjonalny", label: "Stan emocjonalny", icon: HeartPulse },
    ],
  },
  {
    label: "Zarządzanie",
    items: [
      { to: "/konta", label: "Konta", icon: Wallet },
      { to: "/strategie", label: "Strategie", icon: BookMarked },
      // Szablony brokerów nie mają osobnej pozycji - zakładanie szablonu i import danych dzieją
      // się przy polu „Szablon" na ekranie Instrumenty, a pełne zarządzanie jest dostępne
      // stamtąd pod trasą /szablony-instrumentow. Jeden ekran zamiast dwóch robiących to samo.
      { to: "/instrumenty", label: "Instrumenty i szablony", icon: SlidersHorizontal },
      { to: "/interwaly", label: "Interwały", icon: Clock },
      { to: "/zasady-handlu", label: "Zasady handlu", icon: ScrollText },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/dane", label: "Eksport i kopie", icon: DatabaseBackup },
      { to: "/kosz", label: "Kosz", icon: Trash2 },
      { to: "/ustawienia", label: "Ustawienia", icon: Settings },
    ],
  },
];
