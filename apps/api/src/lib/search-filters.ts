import { FileCategory, OFFICE_CONTENT_TYPES } from '@gdoc/shared';

const CATEGORY_PREDICATES: Record<Exclude<FileCategory, typeof FileCategory.OTHER>, string> = {
  [FileCategory.IMAGE]: "content_type LIKE 'image/%'",
  [FileCategory.VIDEO]: "content_type LIKE 'video/%'",
  [FileCategory.AUDIO]: "content_type LIKE 'audio/%'",
  [FileCategory.PDF]: "content_type = 'application/pdf'",
  [FileCategory.OFFICE]: `content_type IN (${[...OFFICE_CONTENT_TYPES].map((mime) => `'${mime}'`).join(', ')})`,
  [FileCategory.TEXT]: "content_type LIKE 'text/%'",
};

/**
 * Fragmento SQL de `content_type` para a categoria (design.md D4). `category`
 * é sempre uma constante interna do enum `FileCategory` (não entra como
 * texto de usuário), então os literais aqui não têm superfície de injeção —
 * mesmo padrão de `resourceScopeClause` em `lib/access.ts`. `other` é a
 * negação de todas as demais categorias, incluindo `content_type IS NULL`
 * (nenhum MIME conhecido resolve para `other` por exclusão).
 */
export function categoryContentTypeClause(category: FileCategory): string {
  if (category === FileCategory.OTHER) {
    const known = Object.values(CATEGORY_PREDICATES).join(' OR ');
    return `(content_type IS NULL OR NOT (${known}))`;
  }
  return CATEGORY_PREDICATES[category];
}

/** `true` só para os valores reconhecidos do enum — entrada de usuário nunca é confiável por padrão. */
export function isValidFileCategory(value: string): value is FileCategory {
  return (Object.values(FileCategory) as string[]).includes(value);
}

/**
 * Início do dia (UTC) da data informada, ou `null` se `value` não for uma
 * data válida (design.md D6). Normaliza para meia-noite UTC para que
 * `dateFrom`/`dateTo` sejam comparáveis com `created_at` (timestamptz) sem
 * depender da hora embutida na entrada.
 */
export function parseDateBoundary(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/** `dateTo` é inclusivo no dia informado — o limite superior exclusivo é o início do dia seguinte (design.md D6). */
export function exclusiveDayAfter(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}
