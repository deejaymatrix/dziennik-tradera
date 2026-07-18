import { EmptyState, Heading } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';

export function DashboardPage() {
  return (
    <div>
      <Heading level={1}>{pl.nav.dashboard}</Heading>
      <EmptyState
        title={pl.states.dashboardEmptyTitle}
        description={pl.states.dashboardEmptyDescription}
      />
    </div>
  );
}
