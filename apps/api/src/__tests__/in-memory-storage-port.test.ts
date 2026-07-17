import { describe, it, expect } from 'vitest';
import { InMemoryStoragePort } from './in-memory-storage-port.js';

describe('InMemoryStoragePort.deleteObject (design.md D8)', () => {
  it('remove o objeto e é idempotente — segunda chamada não lança', async () => {
    const storage = new InMemoryStoragePort();

    await storage.deleteObject('unit/owner/obj-1');
    expect(storage.wasDeleted('unit/owner/obj-1')).toBe(true);

    await expect(storage.deleteObject('unit/owner/obj-1')).resolves.toBeUndefined();
  });

  it('apagar objeto nunca existente também não lança', async () => {
    const storage = new InMemoryStoragePort();
    await expect(storage.deleteObject('unit/owner/never-existed')).resolves.toBeUndefined();
  });
});
