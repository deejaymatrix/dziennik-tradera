import type { ReactElement } from "react";
import { EmotionalStatesSection } from "./EmotionalStatesSection";
import styles from "./SettingsPage.module.css";

/**
 * Okno nawigacyjne "Stan emocjonalny" (sekcja 5 specyfikacji) - zarządzanie listą stanów
 * emocjonalnych przeniesione z Ustawień do grupy `Analiza`, bo to element analizy własnego
 * handlu, a nie konfiguracji aplikacji.
 *
 * Sama sekcja została NIEZMIENIONA i nie jest duplikowana - to ten sam komponent, który wcześniej
 * wisiał w Ustawieniach, więc dane, ukrywanie i usuwanie działają dokładnie tak samo. W
 * Ustawieniach nie ma po nim ani pozycji, ani pustego miejsca.
 */
export function StanEmocjonalnyPage(): ReactElement {
  return (
    <div className={styles.page}>
      <EmotionalStatesSection />
    </div>
  );
}
