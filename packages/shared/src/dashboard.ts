/** Categoria de tipo de arquivo — mapeada a partir do `content_type` (MIME). */
export const FileCategory = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  PDF: 'pdf',
  OFFICE: 'office',
  TEXT: 'text',
  OTHER: 'other',
} as const;

export type FileCategory = (typeof FileCategory)[keyof typeof FileCategory];

const OFFICE_CONTENT_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

/**
 * Mapeamento único MIME → categoria (design.md D5) — usado pelo painel
 * (Épico 8) e reutilizado pelos filtros de tipo da busca (US 9.1).
 */
export function fileCategory(contentType: string | null): FileCategory {
  if (!contentType) return FileCategory.OTHER;
  if (contentType === 'application/pdf') return FileCategory.PDF;
  if (contentType.startsWith('image/')) return FileCategory.IMAGE;
  if (contentType.startsWith('video/')) return FileCategory.VIDEO;
  if (contentType.startsWith('audio/')) return FileCategory.AUDIO;
  if (OFFICE_CONTENT_TYPES.has(contentType)) return FileCategory.OFFICE;
  if (contentType.startsWith('text/')) return FileCategory.TEXT;
  return FileCategory.OTHER;
}

export interface DashboardCards {
  totalFiles: number;
  totalPeople: number;
  usedBytes: number;
  quotaUsedPct: number;
}

export interface DashboardFilesByTypeEntry {
  category: FileCategory;
  count: number;
}

export interface DashboardUploadsByMonthEntry {
  /** Formato `YYYY-MM`, ordem cronológica (mês antigo → recente). */
  month: string;
  count: number;
}

export interface DashboardStorage {
  usedBytes: number;
  quotaBytesPerUser: number;
  userCount: number;
  capacityBytes: number;
  availableBytes: number;
}

export interface DashboardResponse {
  cards: DashboardCards;
  filesByType: DashboardFilesByTypeEntry[];
  uploadsByMonth: DashboardUploadsByMonthEntry[];
  storage: DashboardStorage;
}
