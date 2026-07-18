import { StatusIndicator } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';
import { useOnlineStatus } from './useOnlineStatus.js';

/**
 * Pokazuje wyłącznie łączność sieciową przeglądarki/systemu (navigator.onLine).
 * To CELOWO nie jest jeszcze pełny status synchronizacji (§6.6 specyfikacji) -
 * kolejka zmian, konflikty i błędy retry pojawią się razem z packages/sync-engine
 * w Kamieniu 2. Zobacz też syncStatusPresentation.ts, gotowe na tamten moment.
 */
export function NetworkStatusBadge() {
  const isOnline = useOnlineStatus();

  return (
    <StatusIndicator
      label={isOnline ? pl.network.online : pl.network.offline}
      tone={isOnline ? 'success' : 'warning'}
    />
  );
}
