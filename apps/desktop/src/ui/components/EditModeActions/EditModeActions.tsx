import type { ReactElement, ReactNode } from "react";
import { Button } from "../Button/Button";

export interface EditModeActionsProps {
  editing: boolean;
  saving?: boolean;
  /** Dodatkowy warunek blokujący zapis poza samym `saving` (np. `submitLocked` na karcie
   * transakcji - krótkie okno po wejściu w edycję, chroniące przed przypadkowym podwójnym
   * kliknięciem w przycisk, który podstawił się w miejscu "Edytuj"). */
  disabled?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  /** Pomijane, gdy `saveButtonType="submit"` - wtedy zapis wywołuje `onSubmit` otaczającego
   * `<form>`, a ten przycisk jest tylko jego wizualnym wyzwalaczem. */
  onSave?: () => void;
  saveButtonType?: "button" | "submit";
  saveLabel?: string;
  editLabel?: string;
  cancelLabel?: string;
  /** Dodatkowy przycisk widoczny tylko w trybie odczytu, przed "Edytuj" (np. "Zamknij" na karcie
   * transakcji, "Przywróć szablon" na Zasadach handlu) - różni się na tyle między ekranami, że
   * nie ma sensu zamykać go w sztywnym kształcie tego komponentu. */
  readOnlyExtra?: ReactNode;
}

/** Para przycisków "Edytuj" / "Anuluj"+"Zapisz zmiany" powtórzona wcześniej niemal identycznie
 * na karcie transakcji i na Zasadach handlu (Faza 10) - konsolidacja samej logiki stanu, bez
 * narzucania układu/otoczki, żeby każdy ekran mógł go umieścić w swoim własnym kontenerze. */
export function EditModeActions({
  editing,
  saving = false,
  disabled = false,
  onEdit,
  onCancel,
  onSave,
  saveButtonType = "button",
  saveLabel = "Zapisz zmiany",
  editLabel = "Edytuj",
  cancelLabel = "Anuluj",
  readOnlyExtra,
}: EditModeActionsProps): ReactElement {
  if (editing) {
    return (
      <>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </Button>
        <Button
          type={saveButtonType}
          variant="primary"
          onClick={saveButtonType === "button" ? onSave : undefined}
          disabled={saving || disabled}
          loading={saving}
        >
          {saveLabel}
        </Button>
      </>
    );
  }
  return (
    <>
      {readOnlyExtra}
      <Button type="button" variant="primary" onClick={onEdit}>
        {editLabel}
      </Button>
    </>
  );
}
