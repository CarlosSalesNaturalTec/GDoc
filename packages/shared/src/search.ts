import type { FileCategory } from './dashboard.js';
import type { FileSummaryResponse } from './storage.js';

/** `GET /files/search` — todos os critérios são opcionais e combinam em AND (US 9.1). */
export interface SearchFilesQuery {
  q?: string;
  type?: FileCategory;
  author?: string;
  /** Data ISO (inclusive), início do intervalo sobre `created_at`. */
  dateFrom?: string;
  /** Data ISO (inclusive), fim do intervalo sobre `created_at`. */
  dateTo?: string;
}

export interface SearchFilesResponse {
  files: FileSummaryResponse[];
}
