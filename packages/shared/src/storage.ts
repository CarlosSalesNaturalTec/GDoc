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

export interface BatchUploadItemRequest {
  fileName: string;
  contentType: string;
  declaredSizeBytes: number;
  /** Subpasta relativa ao destino (ex.: "Relatorios/2024"); ausente = direto no destino. */
  relativePath?: string;
}

export interface BatchUploadUrlRequest {
  /** Pasta-âncora (da unidade do remetente, da qual o remetente precisa ser dono); ausente = raiz da unidade. */
  destinationFolderId?: string;
  items: BatchUploadItemRequest[];
}

export interface BatchUploadItemSuccess {
  fileName: string;
  ok: true;
  uploadUrl: string;
  objectPath: string;
  folderId: string | null;
  expiresAt: string;
}

export interface BatchUploadItemFailure {
  fileName: string;
  ok: false;
  error: string;
}

/** Resultado por item, na mesma ordem de `BatchUploadUrlRequest.items` (design.md D1/D5). */
export type BatchUploadItemResult = BatchUploadItemSuccess | BatchUploadItemFailure;

export interface BatchUploadUrlResponse {
  results: BatchUploadItemResult[];
}
