/** Ação de acesso a um arquivo — distingue visualizar de baixar na auditoria e no TTL. */
export const FileAccessAction = {
  VIEW: 'view',
  DOWNLOAD: 'download',
} as const;

export type FileAccessAction = (typeof FileAccessAction)[keyof typeof FileAccessAction];

export interface SignedUrlRequest {
  fileId: string;
}

export interface SignedUrlResponse {
  url: string;
  expiresAt: string;
  action: FileAccessAction;
}

export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  declaredSizeBytes: number;
  /** Pasta de destino (da unidade do remetente); ausente = raiz da unidade. */
  folderId?: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  objectPath: string;
  expiresAt: string;
}

export interface StorageFinalizeNotification {
  bucket: string;
  objectPath: string;
  sizeBytes: number;
}

/** Resumo de arquivo usado na listagem de conteúdo de pasta (navegação). */
export interface FileSummaryResponse {
  id: string;
  ownerId: string;
  folderId: string | null;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  status: string;
  createdAt: string;
}

export interface RenameFileRequest {
  fileName: string;
}

export interface ReplaceFileRequest {
  contentType: string;
  declaredSizeBytes: number;
}

/** Mesmo formato de `UploadUrlResponse`: URL assinada de PUT para o novo `object_path`. */
export type ReplaceFileResponse = UploadUrlResponse;
