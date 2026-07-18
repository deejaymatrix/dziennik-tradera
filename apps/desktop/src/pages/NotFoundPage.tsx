import type { ReactElement } from "react";
import { Compass } from "lucide-react";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";

export function NotFoundPage(): ReactElement {
  return (
    <EmptyState
      icon={<Compass size={32} aria-hidden="true" />}
      title="Nie znaleziono strony"
      description="Ten adres nie odpowiada żadnemu ekranowi aplikacji."
    />
  );
}
