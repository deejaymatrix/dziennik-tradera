/**
 * Klawiatura dla listy zakładek (wzorzec ARIA „tabs", sekcja 18 promptu).
 *
 * Sam `role="tablist"` nie wystarczy: gdy element deklaruje tę rolę, czytniki ekranu OBIECUJĄ
 * użytkownikowi, że zakładki przełącza się strzałkami, a Tab wychodzi z całej grupy. Bez tej
 * obsługi obietnica jest fałszywa - Tab przechodzi po kolejnych zakładkach jak po zwykłych
 * przyciskach, a strzałki nie robią nic.
 *
 * Funkcja jest czysta i niezależna od Reacta - dostaje pozycję i długość listy, zwraca nową
 * pozycję albo `null`, gdy klawisz jej nie dotyczy (wtedy zdarzenie ma zostać nietknięte).
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      // Zawijanie na końcu listy jest częścią wzorca - użytkownik nie musi wiedzieć,
      // że doszedł do ostatniej zakładki, żeby wrócić na początek.
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
