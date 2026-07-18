import { Card, Heading, StatusIndicator, Text } from '@dziennik/ui';
import type { SyncStatus } from '@dziennik/data-contracts';
import { pl } from '@dziennik/i18n';
import { NetworkStatusBadge } from '../sync/NetworkStatusBadge.js';
import { syncStatusPresentation } from '../sync/syncStatusPresentation.js';

const previewStatuses: SyncStatus[] = [
  'synced',
  'syncing',
  'offline',
  'pendingChanges',
  'authRequired',
  'retryableError',
  'conflict',
];

export function SyncCenterPage() {
  return (
    <div>
      <Heading level={1}>{pl.nav.syncCenter}</Heading>

      <Card style={{ marginTop: 16 }}>
        <Heading level={2}>Stan sieci (dziś)</Heading>
        <Text tone="secondary">
          Pełna kolejka zmian, konflikty i ponowienia pojawią się razem z packages/sync-engine w
          Kamieniu 2. Na razie widoczna jest wyłącznie łączność sieciowa przeglądarki/systemu.
        </Text>
        <div style={{ marginTop: 12 }}>
          <NetworkStatusBadge />
        </div>
      </Card>

      <Card style={{ marginTop: 16 }} raised>
        <Heading level={2}>Podgląd przyszłych stanów synchronizacji</Heading>
        <Text tone="secondary">
          Wyłącznie prezentacja wizualna (statyczna, bez podłączonych danych) - potwierdza, że każdy
          stan z docs/specyfikacja-produktu.md §6.6 ma gotowy, przetłumaczony wygląd.
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          {previewStatuses.map((status) => {
            const { label, tone } = syncStatusPresentation(status);
            return <StatusIndicator key={status} label={label} tone={tone} />;
          })}
        </div>
      </Card>
    </div>
  );
}
