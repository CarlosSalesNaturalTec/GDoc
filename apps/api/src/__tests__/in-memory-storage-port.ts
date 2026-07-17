import type { StoragePort, SignedUrlResult } from '../ports/storage-port.js';

/** Test double do StoragePort — evita depender do fake-gcs-server nos testes unitários de permissão. */
export class InMemoryStoragePort implements StoragePort {
  readonly bucketName = 'test-bucket';
  calls: { method: string; objectPath: string }[] = [];
  private readonly deletedObjects = new Set<string>();

  buildObjectPath(unitId: string, ownerId: string, objectId: string): string {
    return `${unitId}/${ownerId}/${objectId}`;
  }

  async getViewUrl(objectPath: string): Promise<SignedUrlResult> {
    this.calls.push({ method: 'view', objectPath });
    return { url: `https://storage.test/${objectPath}?view`, expiresAt: new Date(Date.now() + 300_000) };
  }

  async getDownloadUrl(objectPath: string): Promise<SignedUrlResult> {
    this.calls.push({ method: 'download', objectPath });
    return { url: `https://storage.test/${objectPath}?download`, expiresAt: new Date(Date.now() + 1_800_000) };
  }

  async getUploadUrl(objectPath: string): Promise<SignedUrlResult> {
    this.calls.push({ method: 'upload', objectPath });
    return { url: `https://storage.test/${objectPath}?upload`, expiresAt: new Date(Date.now() + 1_800_000) };
  }

  async assertObjectNotPubliclyReadable(): Promise<boolean> {
    return true;
  }

  /** Idempotente (design.md D8): apagar de novo o mesmo path não lança. */
  async deleteObject(objectPath: string): Promise<void> {
    this.calls.push({ method: 'delete', objectPath });
    this.deletedObjects.add(objectPath);
  }

  wasDeleted(objectPath: string): boolean {
    return this.deletedObjects.has(objectPath);
  }
}
