/** Wpis zarządzanej listy stanów emocjonalnych - patrz domain::emotional_state::EmotionalState.
 * Wbudowane stany (is_builtin) nie mogą być zmieniane nazwą ani usuwane, tylko ukrywane. */
export interface EmotionalState {
  id: string;
  name: string;
  is_builtin: boolean;
  hidden: boolean;
  sort_order: number;
  created_at: string;
}

export interface NewEmotionalState {
  name: string;
}
