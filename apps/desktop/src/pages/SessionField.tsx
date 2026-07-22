import { useState } from "react";
import type { ReactElement } from "react";
import { Select } from "../ui/components/Select/Select";
import { TextField } from "../ui/components/TextField/TextField";

/** Sesje z sekcji 6.3 specyfikacji. Wartości własne użytkownika są nadal dozwolone. */
const PRESET_SESSIONS = ["Londyn", "Nowy Jork", "Azja", "Poza sesją"];

const CUSTOM = "__custom__";

export interface SessionFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Pole `Sesja` jako lista gotowych wartości plus możliwość wpisania własnej (sekcja 6.3).
 * Wcześniej było to zwykłe pole tekstowe, przez co ta sama sesja zapisywała się na kilka
 * sposobów ("Londyn", "londyn", "LDN") i rozjeżdżała grupowanie w raportach.
 */
export function SessionField({ value, onChange, disabled }: SessionFieldProps): ReactElement {
  // Wartość spoza listy (np. zapisana wcześniej ręcznie) od razu włącza tryb własnej sesji,
  // żeby edycja starej transakcji nie kasowała po cichu tego, co użytkownik kiedyś wpisał.
  const [custom, setCustom] = useState(
    () => value.trim() !== "" && !PRESET_SESSIONS.includes(value),
  );

  const options = [
    { value: "", label: "Brak" },
    ...PRESET_SESSIONS.map((session) => ({ value: session, label: session })),
    { value: CUSTOM, label: "Własna..." },
  ];

  return (
    <>
      <Select
        label="Sesja (opcjonalnie)"
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        options={options}
        disabled={disabled ?? false}
      />
      {custom && (
        <TextField
          label="Własna sesja"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled ?? false}
          hint="Np. Sydney, otwarcie giełdy, sesja poranna."
        />
      )}
    </>
  );
}
