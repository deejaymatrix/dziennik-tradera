import type { SyncStatus } from '@dziennik/data-contracts';
import { pl } from '@dziennik/i18n';
import type { StatusTone } from '@dziennik/ui';

export interface SyncStatusPresentation {
  label: string;
  tone: StatusTone;
}

/**
 * Mapuje SyncStatus (packages/data-contracts, §6.6 specyfikacji) na prezentację
 * StatusIndicator. Gotowe pod Kamień 2, kiedy packages/sync-engine zacznie
 * faktycznie emitować te stany - dziś jeszcze nieużywane w prawdziwym przepływie
 * (patrz NetworkStatusBadge, który na razie pokazuje wyłącznie łączność sieciową).
 */
export function syncStatusPresentation(status: SyncStatus): SyncStatusPresentation {
  switch (status) {
    case 'synced':
      return { label: pl.syncStatus.synced, tone: 'success' };
    case 'syncing':
      return { label: pl.syncStatus.syncing, tone: 'accent' };
    case 'offline':
      return { label: pl.syncStatus.offline, tone: 'warning' };
    case 'pendingChanges':
      return { label: pl.syncStatus.pendingChanges, tone: 'accent' };
    case 'authRequired':
      return { label: pl.syncStatus.authRequired, tone: 'warning' };
    case 'retryableError':
      return { label: pl.syncStatus.retryableError, tone: 'danger' };
    case 'conflict':
      return { label: pl.syncStatus.conflict, tone: 'danger' };
  }
}
