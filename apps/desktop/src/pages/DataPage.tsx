import type { ReactElement } from "react";
import { PlaceholderPage } from "./PlaceholderPage";

export function DataPage(): ReactElement {
  return (
    <PlaceholderPage
      description="Eksport CSV/XLSX/PDF oraz pełny backup .dtjbackup z weryfikacją i przywracaniem."
      targetMilestone="Celu 1.7"
    />
  );
}
