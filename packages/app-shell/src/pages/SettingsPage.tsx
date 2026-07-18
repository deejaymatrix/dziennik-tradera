import { EmptyState, Heading } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';

export function SettingsPage() {
  return (
    <div>
      <Heading level={1}>{pl.nav.settings}</Heading>
      <EmptyState
        title={pl.states.moduleNotBuiltTitle}
        description="Pełne Ustawienia (profil, strefa czasowa, waluta raportowa, urządzenia, kanał aktualizacji) powstają w Kamieniu 2/3 razem z modelem danych - patrz docs/specyfikacja-produktu.md §8.14."
      />
    </div>
  );
}
