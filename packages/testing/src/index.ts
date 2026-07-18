// Fabryki danych i pomoce testowe WYŁĄCZNIE do testów i Storybooka - nigdy nie
// importować z apps/web ani apps/desktop w kodzie produkcyjnym ani w seedach
// migracji. Patrz docs/specyfikacja-produktu.md §3: "Dane demonstracyjne mogą
// istnieć wyłącznie w testach i Storybooku, nigdy po pierwszym uruchomieniu
// użytkownika."
//
// Pierwsze fabryki danych domenowych (konto, transakcja, strategia) powstają
// wraz z odpowiadającymi im encjami w Kamieniu 3.
export { expectNoAccessibilityViolations } from './a11y.js';
