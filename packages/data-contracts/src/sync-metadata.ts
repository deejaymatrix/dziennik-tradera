import { z } from 'zod';

/**
 * Wspólne metadane każdej synchronizowanej encji, zgodnie z
 * docs/specyfikacja-produktu.md §6.1. Zegar klienta nigdy nie jest jedynym
 * źródłem kolejności zmian - o kolejności rozstrzyga `server_version` nadawany
 * przez backend (packages/sync-engine, Kamień 2).
 */
export const syncMetadataSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  /** Tombstone - obecność oznacza miękkie usunięcie, encja nie jest fizycznie kasowana od razu. */
  deletedAt: z.string().datetime({ offset: true }).nullable(),
  /** Nadawana przez serwer przy każdym przyjętym zapisie; podstawa wykrywania konfliktów. */
  serverVersion: z.number().int().nonnegative(),
  lastModifiedByDeviceId: z.string().uuid(),
});

export type SyncMetadata = z.infer<typeof syncMetadataSchema>;

/**
 * Bazowy kształt mutacji w outboksie klienta, zgodnie z §6.2.
 * `payload` jest typowany po stronie konkretnej encji (rozszerzenie w Kamieniu 2/3).
 */
export const outboxMutationSchema = z.object({
  mutationId: z.string().uuid(),
  deviceId: z.string().uuid(),
  entityType: z.string().min(1),
  operation: z.enum(['create', 'update', 'delete']),
  baseServerVersion: z.number().int().nonnegative().nullable(),
  createdAtLocal: z.string().datetime({ offset: true }),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});

export type OutboxMutation = z.infer<typeof outboxMutationSchema>;

/** Stan widoczny użytkownikowi w Centrum synchronizacji, zgodnie z §6.6. */
export const syncStatusSchema = z.enum([
  'synced',
  'syncing',
  'offline',
  'pendingChanges',
  'authRequired',
  'retryableError',
  'conflict',
]);

export type SyncStatus = z.infer<typeof syncStatusSchema>;
