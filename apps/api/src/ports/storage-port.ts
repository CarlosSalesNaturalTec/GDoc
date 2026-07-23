/**
 * StoragePort — seam entre a aplicação e o object storage.
 * Implementado por GCS em produção e por um cliente apontando para o
 * fake-gcs-server em dev (mesmo código, endpoint diferente).
 */
export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}

export interface StoragePort {
  readonly bucketName: string;

  /** Caminho do objeto sob o prefixo da unidade: /{unitId}/{ownerId}/{objectId}. */
  buildObjectPath(unitId: string, ownerId: string, objectId: string): string;

  /** URL assinada de leitura com disposição inline (preview), TTL curto. */
  getViewUrl(objectPath: string): Promise<SignedUrlResult>;

  /** URL assinada de leitura com disposição attachment, TTL mais longo. */
  getDownloadUrl(objectPath: string, downloadFileName: string): Promise<SignedUrlResult>;

  /** URL assinada de escrita (sessão resumível) para upload direto do browser. */
  getUploadUrl(objectPath: string, contentType: string): Promise<SignedUrlResult>;

  /** Verifica se o bucket nega leitura direta sem assinatura (usado na prova E2E). */
  assertObjectNotPubliclyReadable(objectPath: string): Promise<boolean>;

  /** Remove o objeto do bucket. Idempotente: objeto ausente não é erro (design.md D8). */
  deleteObject(objectPath: string): Promise<void>;

  /**
   * Metadados do objeto (existência + tamanho real). Retorna `null` se o objeto
   * não existe. Usado pelo backfill de reconciliação para conferir o upload
   * concluído antes de promover o registro.
   */
  statObject(objectPath: string): Promise<{ sizeBytes: number } | null>;
}
