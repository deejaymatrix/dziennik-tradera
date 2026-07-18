import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '@dziennik/data-contracts';
import { syncStatusPresentation } from './syncStatusPresentation.js';

describe('syncStatusPresentation', () => {
  const allStatuses: SyncStatus[] = [
    'synced',
    'syncing',
    'offline',
    'pendingChanges',
    'authRequired',
    'retryableError',
    'conflict',
  ];

  it.each(allStatuses)('zwraca polską etykietę i tone dla statusu "%s"', (status) => {
    const result = syncStatusPresentation(status);
    expect(result.label.length).toBeGreaterThan(0);
    expect(['neutral', 'success', 'danger', 'accent', 'warning']).toContain(result.tone);
  });

  it('konflikt i błąd retry mają ton "danger" (wymagają uwagi użytkownika)', () => {
    expect(syncStatusPresentation('conflict').tone).toBe('danger');
    expect(syncStatusPresentation('retryableError').tone).toBe('danger');
  });
});
