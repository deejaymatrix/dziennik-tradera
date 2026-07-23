import { useCallback } from "react";
import { usePreferences } from "./PreferencesProvider";
import { useConfirm } from "../ui/components/ConfirmDialog/ConfirmDialog";
import type { ConfirmOptions } from "../ui/components/ConfirmDialog/ConfirmDialog";

/**
 * Rodzaj potwierdzenia, który użytkownik może wyłączyć w Ustawieniach → Zachowanie aplikacji.
 *
 * Celowo NIE ma tu potwierdzeń, które specyfikacja każe zostawić zawsze aktywne: ostrzeżenia
 * przed opuszczeniem niezapisanego formularza ani opróżnienia całego kosza. Wyłączalne jest
 * pytanie o pojedynczą operację, nie zabezpieczenie przed hurtową utratą danych.
 */
export type OptionalConfirmKind = "trash" | "permanent";

/**
 * `confirm(...)`, które respektuje przełączniki potwierdzeń z Ustawień. Gdy użytkownik wyłączył
 * dany rodzaj pytania, zwraca `true` bez pokazywania okna - czyli operacja idzie dalej.
 *
 * Domyślnie (brak wczytanych preferencji, np. tuż po starcie) potwierdzenie JEST pokazywane -
 * przy wątpliwości lepiej zapytać za dużo niż za mało.
 */
export function useOptionalConfirm(): (
  kind: OptionalConfirmKind,
  options: ConfirmOptions | string,
) => Promise<boolean> {
  const confirm = useConfirm();
  const { preferences } = usePreferences();

  return useCallback(
    async (kind, options) => {
      const behavior = preferences?.behavior;
      const enabled =
        kind === "trash"
          ? (behavior?.confirm_move_to_trash ?? true)
          : (behavior?.confirm_permanent_operation ?? true);
      if (!enabled) {
        return true;
      }
      return confirm(options);
    },
    [confirm, preferences],
  );
}
