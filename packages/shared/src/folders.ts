import type { FileSummaryResponse } from './storage.js';

export interface CreateFolderRequest {
  name: string;
  /** Pasta-pai (da qual o remetente precisa ser dono); ausente = raiz da unidade. */
  parentId?: string;
}

export interface FolderResponse {
  id: string;
  unitId: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
}

/** `GET /folders/root/contents` e `GET /folders/:id/contents` — conteúdo só-por-dono + trilha. */
export interface FolderContentsResponse {
  /** `null` na raiz da unidade. */
  folder: FolderResponse | null;
  /** Da raiz até a pasta corrente; vazio na raiz. */
  breadcrumb: FolderResponse[];
  folders: FolderResponse[];
  files: FileSummaryResponse[];
}

/** Um arquivo do manifesto de download de pasta (design.md D1/D7 de `download-pasta-zip`). */
export interface FolderDownloadManifestEntry {
  /** Caminho relativo à pasta solicitada, com a hierarquia de subpastas preservada. */
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  /** URL assinada de download, mesmo TTL já praticado pelo download unitário. */
  url: string;
  expiresAt: string;
}

/**
 * `POST /folders/:id/download-manifest` (US 3.3, design.md D1/D3): o cliente
 * compacta a partir deste manifesto — a API nunca produz o `.zip`.
 * `totalFiles`/`allowedFiles` sempre presentes, mesmo quando `allowedFiles`
 * é 0, para que a interface distinga recorte parcial de pacote vazio.
 */
export interface FolderDownloadManifestResponse {
  entries: FolderDownloadManifestEntry[];
  totalFiles: number;
  allowedFiles: number;
  totalBytes: number;
}

/**
 * Recusa por limite (design.md D5): identifica **qual** teto foi atingido,
 * com o valor encontrado e o permitido, para a interface orientar a baixar
 * subpastas separadamente em vez de mostrar um erro genérico.
 */
export interface FolderDownloadManifestLimitExceededResponse {
  error: 'download_manifest_limit_exceeded';
  limit: 'maxFiles' | 'maxBytes';
  found: number;
  allowed: number;
}
