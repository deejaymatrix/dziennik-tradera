import type { ReactElement } from "react";
import { IntervalsSection } from "./IntervalsSection";
import styles from "./SettingsPage.module.css";

/**
 * Okno nawigacyjne "Interwały" (grupa Konfiguracja). Zarządzanie interwałami przeniesione
 * z Ustawień, bo to lista wyboru używana przy transakcji - jej miejsce jest obok Strategii
 * i Instrumentów, a nie w konfiguracji aplikacji.
 *
 * To ten sam komponent co wcześniej w Ustawieniach - nic nie duplikujemy, dane i wszystkie
 * akcje (dodawanie, zmiana nazwy, ukrywanie, kolejność, Kosz) działają bez zmian. Szybkie
 * dodanie nowego interwału bez wchodzenia tutaj jest też możliwe wprost w formularzu transakcji.
 */
export function InterwalyPage(): ReactElement {
  return (
    <div className={styles.page}>
      <IntervalsSection />
    </div>
  );
}
