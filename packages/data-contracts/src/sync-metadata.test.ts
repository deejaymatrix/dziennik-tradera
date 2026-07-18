import { describe, expect, it } from 'vitest';
import { outboxMutationSchema, syncMetadataSchema, syncStatusSchema } from './sync-metadata.js';

const validMetadata = {
  id: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f70',
  ownerId: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f71',
  createdAt: '2026-07-18T10:00:00.000Z',
  updatedAt: '2026-07-18T10:00:00.000Z',
  deletedAt: null,
  serverVersion: 1,
  lastModifiedByDeviceId: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f72',
};

describe('syncMetadataSchema', () => {
  it('akceptuje poprawne metadane synchronizacji', () => {
    expect(syncMetadataSchema.parse(validMetadata)).toEqual(validMetadata);
  });

  it('odrzuca ujemny server_version (nie może cofać się w kolejności zmian)', () => {
    const result = syncMetadataSchema.safeParse({ ...validMetadata, serverVersion: -1 });
    expect(result.success).toBe(false);
  });

  it('odrzuca brak ownerId (izolacja danych wymaga właściciela)', () => {
    const { ownerId: _ownerId, ...withoutOwner } = validMetadata;
    const result = syncMetadataSchema.safeParse(withoutOwner);
    expect(result.success).toBe(false);
  });
});

describe('outboxMutationSchema', () => {
  it('akceptuje mutację create z pustym base_server_version', () => {
    const mutation = {
      mutationId: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f73',
      deviceId: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f74',
      entityType: 'transaction',
      operation: 'create' as const,
      baseServerVersion: null,
      createdAtLocal: '2026-07-18T10:00:00.000Z',
      attemptCount: 0,
      lastError: null,
    };

    expect(outboxMutationSchema.parse(mutation).operation).toBe('create');
  });

  it('odrzuca nieznaną operację', () => {
    const result = outboxMutationSchema.safeParse({
      mutationId: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f73',
      deviceId: '018f2e5a-7b8b-7c3e-8f7a-2b3c4d5e6f74',
      entityType: 'transaction',
      operation: 'destroy',
      baseServerVersion: null,
      createdAtLocal: '2026-07-18T10:00:00.000Z',
      attemptCount: 0,
      lastError: null,
    });

    expect(result.success).toBe(false);
  });
});

describe('syncStatusSchema', () => {
  it('zawiera wszystkie stany wymagane przez specyfikację §6.6', () => {
    const required = [
      'synced',
      'syncing',
      'offline',
      'pendingChanges',
      'authRequired',
      'retryableError',
      'conflict',
    ];

    for (const status of required) {
      expect(syncStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});
