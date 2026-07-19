/** Wpis zarządzanej listy interwałów - patrz domain::interval::Interval. Wbudowane wpisy
 * (is_builtin) nie mogą być zmieniane nazwą ani archiwizowane, tylko ukrywane; własne interwały
 * użytkownika mogą być też przemianowane i archiwizowane. */
export interface Interval {
  id: string;
  label: string;
  is_builtin: boolean;
  hidden: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface NewInterval {
  label: string;
}
