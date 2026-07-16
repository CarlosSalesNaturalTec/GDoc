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
