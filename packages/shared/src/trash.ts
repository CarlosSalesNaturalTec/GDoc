import type { FileSummaryResponse } from './storage.js';
import type { FolderResponse } from './folders.js';
import type { GrantResourceType } from './permissions.js';

/** Item na lixeira — sempre uma raiz de exclusão (design.md D9). */
export interface TrashEntryResponse {
  id: string;
  type: GrantResourceType;
  name: string;
  deletedAt: string;
  expiresAt: string;
}

export interface TrashListResponse {
  items: TrashEntryResponse[];
}

/**
 * Resposta de `POST /files/:id/restore`. `redirectedToRoot` sinaliza o caso
 * em que a pasta de origem não existe mais (ancestral expurgado) e o
 * arquivo voltou à raiz da unidade em vez do `folderId` original
 * (design.md D5).
 */
export interface FileRestoreResponse extends FileSummaryResponse {
  redirectedToRoot: boolean;
}

/** Resposta de `POST /folders/:id/restore` — pasta nunca muda de local ao restaurar. */
export type FolderRestoreResponse = FolderResponse;
