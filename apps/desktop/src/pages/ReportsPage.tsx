import type { ReactElement } from "react";
import { PlaceholderPage } from "./PlaceholderPage";

export function ReportsPage(): ReactElement {
  return (
    <PlaceholderPage
      description="Raporty z filtrami (zakres dat, konto, instrument, strategia, kierunek, wynik, interwał)."
      targetMilestone="Celu 1.6"
    />
  );
}
