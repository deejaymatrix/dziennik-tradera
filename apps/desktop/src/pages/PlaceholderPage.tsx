import type { ReactElement } from "react";
import { Construction } from "lucide-react";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";

export interface PlaceholderPageProps {
  description: string;
  targetMilestone: string;
}

/**
 * Uczciwy, nie-udawany stan "jeszcze nie zbudowane". To nawigacja do prawdziwej strony,
 * nie martwy przycisk - strona jawnie mówi, w którym Celu się pojawi.
 */
export function PlaceholderPage({
  description,
  targetMilestone,
}: PlaceholderPageProps): ReactElement {
  return (
    <EmptyState
      icon={<Construction size={32} aria-hidden="true" />}
      title="Ten moduł jeszcze nie jest zaimplementowany"
      description={`${description} Pojawi się w ${targetMilestone}.`}
    />
  );
}
