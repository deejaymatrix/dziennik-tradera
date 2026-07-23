import { describe, expect, it } from "vitest";
import { isWithinQuietHours, shouldNotify } from "./quietHours";
import type { NotificationPreferences } from "./types/preferences";

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    update_available: true,
    update_completed: true,
    update_failed: true,
    backup_failed: true,
    sound: false,
    remind_unfinished_draft: true,
    remind_missing_emotions: false,
    remind_missing_attachment: false,
    remind_unfulfilled_rule: true,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    ...overrides,
  };
}

/** Data o zadanej godzinie lokalnej - ciche godziny liczą się w czasie użytkownika. */
function at(hours: number, minutes = 0): Date {
  return new Date(2026, 2, 15, hours, minutes);
}

describe("ciche godziny", () => {
  it("wyłączone nigdy nie wyciszają", () => {
    expect(isWithinQuietHours(prefs({ quiet_hours_enabled: false }), at(23))).toBe(false);
  });

  it("przedział przechodzący przez północ obejmuje obie strony doby", () => {
    const nocne = prefs({
      quiet_hours_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });

    expect(isWithinQuietHours(nocne, at(23))).toBe(true);
    expect(isWithinQuietHours(nocne, at(3))).toBe(true);
    expect(isWithinQuietHours(nocne, at(22))).toBe(true);
    expect(isWithinQuietHours(nocne, at(12))).toBe(false);
    expect(isWithinQuietHours(nocne, at(7))).toBe(false);
  });

  it("zwykły przedział w ciągu dnia działa bez zawijania", () => {
    const dzienne = prefs({
      quiet_hours_enabled: true,
      quiet_hours_start: "09:00",
      quiet_hours_end: "17:00",
    });

    expect(isWithinQuietHours(dzienne, at(12))).toBe(true);
    expect(isWithinQuietHours(dzienne, at(8))).toBe(false);
    expect(isWithinQuietHours(dzienne, at(17))).toBe(false);
  });

  it("równe krańce znaczą 'nic', a nie 'cała doba'", () => {
    const puste = prefs({
      quiet_hours_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "22:00",
    });

    expect(isWithinQuietHours(puste, at(23))).toBe(false);
    expect(isWithinQuietHours(puste, at(10))).toBe(false);
  });

  it("niepoprawna godzina nie wycisza niczego", () => {
    const zepsute = prefs({
      quiet_hours_enabled: true,
      quiet_hours_start: "25:00",
      quiet_hours_end: "07:00",
    });

    expect(isWithinQuietHours(zepsute, at(23))).toBe(false);
  });
});

describe("decyzja o powiadomieniu", () => {
  it("wyłączony przełącznik wycisza niezależnie od pory", () => {
    expect(
      shouldNotify(prefs({ update_available: false }), "update_available", { now: at(12) }),
    ).toBe(false);
  });

  it("ciche godziny wyciszają powiadomienie niekrytyczne", () => {
    const nocne = prefs({ quiet_hours_enabled: true });

    expect(shouldNotify(nocne, "update_available", { now: at(23) })).toBe(false);
    expect(shouldNotify(nocne, "update_available", { now: at(12) })).toBe(true);
  });

  it("powiadomienie krytyczne przechodzi także w ciszy nocnej", () => {
    // Błąd kopii bezpieczeństwa to ryzyko utraty danych - specyfikacja wymaga, żeby zostało
    // widoczne również w cichych godzinach.
    const nocne = prefs({ quiet_hours_enabled: true });

    expect(shouldNotify(nocne, "backup_failed", { now: at(23), critical: true })).toBe(true);
  });

  it("brak wczytanych preferencji nie blokuje powiadomienia", () => {
    expect(shouldNotify(undefined, "update_available")).toBe(true);
  });
});
