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
