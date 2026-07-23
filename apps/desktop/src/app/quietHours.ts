import type { NotificationPreferences } from "./types/preferences";

/** Minuty od północy dla godziny w formacie `GG:MM`. `null`, gdy zapis jest niepoprawny. */
function minutesOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Czy podany moment wypada w cichych godzinach.
 *
 * Przedział MOŻE przechodzić przez północ (np. 22:00–07:00) - wtedy warunek jest sumą dwóch
 * zakresów, a nie zwykłym „między". Bez tego ciche godziny nocne nigdy by nie zadziałały.
 * Przedział o równych krańcach traktujemy jako pusty, a nie jako całą dobę - „od 22:00 do 22:00"
 * znaczy dla użytkownika „nic", a wyciszenie całej doby byłoby zaskoczeniem.
 */
export function isWithinQuietHours(
  notifications: NotificationPreferences | undefined,
  now: Date = new Date(),
): boolean {
  if (!notifications?.quiet_hours_enabled) {
    return false;
  }
  const start = minutesOfDay(notifications.quiet_hours_start);
  const end = minutesOfDay(notifications.quiet_hours_end);
  if (start === null || end === null || start === end) {
    return false;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/**
 * Czy pokazać NIEKRYTYCZNE powiadomienie danego rodzaju.
 *
 * Ciche godziny wyciszają wyłącznie powiadomienia niekrytyczne. Informacja o błędzie kopii
 * bezpieczeństwa i o ryzyku utraty danych przechodzi ZAWSZE - specyfikacja wymaga, żeby
 * pozostała widoczna także w ciszy nocnej.
 */
export function shouldNotify(
  notifications: NotificationPreferences | undefined,
  kind: keyof NotificationPreferences,
  options: { critical?: boolean; now?: Date } = {},
): boolean {
  if (!notifications) {
    // Brak wczytanych preferencji - pokazujemy. Lepiej powiadomić za dużo niż zgubić informację.
    return true;
  }
  if (notifications[kind] === false) {
    return false;
  }
  if (options.critical) {
    return true;
  }
  return !isWithinQuietHours(notifications, options.now);
}
