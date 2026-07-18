import type { ReactElement } from "react";
import { PlaceholderPage } from "./PlaceholderPage";

export function AccountsPage(): ReactElement {
  return (
    <PlaceholderPage
      description="CRUD kont tradingowych z archiwizacją oraz wpłatami/wypłatami/korektami salda. Backend (schemat, migracje, repozytorium z pełnym CRUD) już działa i jest przetestowany."
      targetMilestone="Celu 1.4"
    />
  );
}
