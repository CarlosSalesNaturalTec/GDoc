import type { PoolClient } from 'pg';
import {
  DOCUMENT_LIFECYCLE_STATES,
  DOCUMENT_TYPES,
  DocumentLifecycleState,
  DocumentStatus,
  GrantResourceType,
  Permission,
  REVIEW_DUE_SOON_DAYS,
  type DocumentControlInput,
  type DocumentType,
  type FileSummaryResponse,
} from '@gdoc/shared';
import type { TenantContext } from '../ports/database-port.js';
import { isAdminOfUnit, resourceScopeClause } from './access.js';

/**
 * Controle documental (Épico 10, change `controle-documental`): projeção dos
 * campos de controle, **derivação da situação em SQL** e as regras puras que
 * decorrem dela.
 *
 * Existe como módulo único porque três rotas montam o mesmo resumo de arquivo
 * (`routes/files.ts`, `routes/folders.ts`, `routes/search.ts`) e a derivação
 * da situação precisa ser idêntica nas três — três cópias da mesma expressão
 * é precisamente como uma delas envelhece sozinha.
 */

/**
 * Situação do documento, derivada **no `SELECT`** (design.md D2). Não é
 * coluna e não depende de rotina: o relógio que decide é o do Postgres
 * (`current_date`), não o do processo Node nem o do dispositivo, exatamente
 * como a vigência de concessão já faz com `now()`.
 *
 * A ordem dos ramos é a regra: o estado **declarado** prevalece sobre a data
 * (US 10.4 cenário 4), e a ausência de data resolve para "sem controle de
 * revisão" antes de qualquer aritmética.
 *
 * Nenhum literal vem de entrada do usuário — são constantes do enum
 * compartilhado —, então o fragmento não tem superfície de injeção (mesmo
 * padrão de `resourceScopeClause` em `lib/access.ts`).
 */
export const DOCUMENT_STATUS_SQL = `CASE
    WHEN lifecycle_state = '${DocumentLifecycleState.OBSOLETE}' THEN '${DocumentStatus.OBSOLETE}'
    WHEN lifecycle_state = '${DocumentLifecycleState.IN_REVIEW}' THEN '${DocumentStatus.IN_REVIEW}'
    WHEN next_review_at IS NULL THEN '${DocumentStatus.UNCONTROLLED}'
    WHEN next_review_at < current_date THEN '${DocumentStatus.OVERDUE}'
    WHEN next_review_at <= current_date + ${REVIEW_DUE_SOON_DAYS} THEN '${DocumentStatus.DUE_SOON}'
    ELSE '${DocumentStatus.CURRENT}'
  END`;

/** Dias até a próxima revisão (negativo quando vencida), pelo relógio do banco. */
export const DAYS_UNTIL_REVIEW_SQL = `(next_review_at - current_date)`;

/**
 * Expressões derivadas para acrescentar a um `SELECT *` ou `RETURNING *` de
 * `files` — as rotas que já leem a linha inteira não precisam enumerar
 * colunas, só anexar o que não existe como coluna.
 */
export const FILE_DERIVED_COLUMNS = `${DOCUMENT_STATUS_SQL} AS document_status, ${DAYS_UNTIL_REVIEW_SQL} AS days_until_review`;

const FILE_SUMMARY_BASE_COLUMNS = `id, owner_id, folder_id, file_name, content_type, size_bytes, status, created_at,
     document_type, document_code, document_revision, responsible_sector, next_review_at, lifecycle_state`;

/**
 * Colunas do resumo de arquivo para as consultas que **listam** documentos
 * (listagem de pasta e busca): os campos de controle, a situação derivada e o
 * veredito de edição.
 *
 * `can_edit_control` reusa o mesmo fragmento de alcance que a consulta já
 * monta, agora para o verbo `rename` — o verbo que substituir exige e que a
 * edição dos dados passa a exigir. Sai de graça na mesma linha, sem
 * round-trip por item (mesmo padrão da coluna `allowed` do manifesto de
 * download, `lib/folder-tree.ts`). `ownerIdParam` é o placeholder já usado
 * para `ctx.userId` na consulta; para admin da unidade o fragmento não o
 * referencia (vira `TRUE`/literal de `unit_id`), e aí o parâmetro nem entra.
 */
export function fileSummaryColumns(ctx: TenantContext, ownerIdParam: string): string {
  const canEdit = resourceScopeClause(GrantResourceType.FILE, ownerIdParam, ctx, Permission.RENAME);
  return `${FILE_SUMMARY_BASE_COLUMNS}, (${canEdit}) AS can_edit_control, ${FILE_DERIVED_COLUMNS}`;
}

export interface FileSummaryRow {
  id: string;
  owner_id: string;
  folder_id: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: string | null;
  status: string;
  created_at: string;
  document_type: string | null;
  document_code: string | null;
  document_revision: number | null;
  responsible_sector: string | null;
  /** `date` do Postgres — o driver entrega `Date` à meia-noite local. */
  next_review_at: Date | string | null;
  lifecycle_state: string | null;
  document_status: string;
  days_until_review: number | null;
  /** Só vem nas consultas de listagem (ver `fileSummaryColumns`). */
  can_edit_control?: boolean;
}

/**
 * `YYYY-MM-DD` a partir do que o driver entregar. Coluna `date` vira `Date` à
 * meia-noite **local**, então os getters locais fazem o caminho de volta sem
 * deslocar o dia — `toISOString()` deslocaria para quem está a oeste de
 * Greenwich, transformando "vence em 01/03" em "28/02".
 */
function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const mes = String(value.getMonth() + 1).padStart(2, '0');
  const dia = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${mes}-${dia}`;
}

/** Projeção única do resumo de arquivo, com os dados de controle. */
export function toFileSummaryResponse(row: FileSummaryRow): FileSummaryResponse {
  return {
    id: row.id,
    ownerId: row.owner_id,
    folderId: row.folder_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    documentType: (row.document_type as DocumentType | null) ?? null,
    documentCode: row.document_code,
    documentRevision: row.document_revision === null ? null : Number(row.document_revision),
    responsibleSector: row.responsible_sector,
    nextReviewAt: toIsoDate(row.next_review_at),
    lifecycleState: (row.lifecycle_state as DocumentLifecycleState | null) ?? null,
    documentStatus: row.document_status as DocumentStatus,
    daysUntilReview: row.days_until_review === null ? null : Number(row.days_until_review),
    // Ausente nas consultas que não são de listagem: ausência é "não
    // oferecer", nunca um `false` inventado sobre quem talvez possa.
    ...(row.can_edit_control === undefined ? {} : { canEditControl: row.can_edit_control }),
  };
}

/**
 * Fragmento SQL que **retira** da listagem e da busca o documento declarado
 * obsoleto, para quem não é administrador da unidade (US 10.7, design.md D6).
 *
 * A regra é deliberadamente **restritiva**: só subtrai alcance, nunca concede
 * — por construção não consegue abrir furo de isolamento. Para o admin da
 * unidade da listagem resolve para `TRUE`, e o recorte por unidade continua
 * sendo o de `resourceScopeClause` (que para o `global_admin` compara
 * `unit_id` explicitamente): ser obsoleto nunca amplia alcance sobre conteúdo
 * de outra unidade.
 */
export function nonObsoleteClause(ctx: TenantContext): string {
  if (isAdminOfUnit(ctx, ctx.unitId)) return 'TRUE';
  return `lifecycle_state IS DISTINCT FROM '${DocumentLifecycleState.OBSOLETE}'`;
}

/** Campos que a publicação de **um** documento exige (US 10.5 cenário 1). */
export const REQUIRED_CONTROL_FIELDS = [
  'documentType',
  'documentCode',
  'documentRevision',
  'nextReviewAt',
] as const satisfies readonly (keyof DocumentControlInput)[];

/**
 * Dados de controle já validados. `undefined` em um campo significa "não
 * informado" e, na edição, **não mexe** no valor atual; `null` informado
 * explicitamente limpa o campo. A distinção é o que permite corrigir o
 * responsável sem apagar a data de revisão.
 */
export interface NormalizedDocumentControl {
  documentType?: DocumentType | null;
  documentCode?: string | null;
  documentRevision?: number | null;
  responsibleSector?: string | null;
  nextReviewAt?: string | null;
  lifecycleState?: DocumentLifecycleState | null;
}

export type ParseControlResult =
  | { ok: true; value: NormalizedDocumentControl }
  | { ok: false; error: 'invalid_document_type' }
  | { ok: false; error: 'invalid_request_body' }
  | { ok: false; error: 'document_control_required'; missing: (keyof DocumentControlInput)[] };

const CODE_MAX_LENGTH = 60;
const SECTOR_MAX_LENGTH = 120;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `true` só para uma data de calendário real — `2026-02-31` é recusada. */
function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [ano, mes, dia] = value.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

function normalizeText(value: unknown, maxLength: number): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return false;
  return trimmed;
}

/**
 * Valida e normaliza os dados de controle vindos do cliente. Entrada de
 * usuário nunca é confiável por padrão: tipo e estado são conferidos contra o
 * enum compartilhado, a data contra o calendário, e a revisão contra inteiro
 * não negativo.
 *
 * `requireAll` liga a exigência da publicação unitária e nomeia o que falta
 * (US 10.5 cenário 1) — a edição posterior usa a mesma função sem exigência,
 * para preencher aos poucos o que o lote dispensou.
 */
export function parseDocumentControl(
  raw: unknown,
  { requireAll }: { requireAll: boolean },
): ParseControlResult {
  const input: DocumentControlInput =
    raw === undefined || raw === null ? {} : (raw as DocumentControlInput);
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_request_body' };
  }

  const value: NormalizedDocumentControl = {};

  if (input.documentType !== undefined) {
    if (input.documentType === null) {
      value.documentType = null;
    } else if (!DOCUMENT_TYPES.includes(input.documentType)) {
      return { ok: false, error: 'invalid_document_type' };
    } else {
      value.documentType = input.documentType;
    }
  }

  if (input.lifecycleState !== undefined) {
    if (input.lifecycleState === null) {
      value.lifecycleState = null;
    } else if (!DOCUMENT_LIFECYCLE_STATES.includes(input.lifecycleState)) {
      return { ok: false, error: 'invalid_request_body' };
    } else {
      value.lifecycleState = input.lifecycleState;
    }
  }

  const code = normalizeText(input.documentCode, CODE_MAX_LENGTH);
  if (code === false) return { ok: false, error: 'invalid_request_body' };
  if (code !== undefined) value.documentCode = code;

  const sector = normalizeText(input.responsibleSector, SECTOR_MAX_LENGTH);
  if (sector === false) return { ok: false, error: 'invalid_request_body' };
  if (sector !== undefined) value.responsibleSector = sector;

  if (input.documentRevision !== undefined) {
    if (input.documentRevision === null) {
      value.documentRevision = null;
    } else if (
      typeof input.documentRevision !== 'number' ||
      !Number.isInteger(input.documentRevision) ||
      input.documentRevision < 0
    ) {
      return { ok: false, error: 'invalid_request_body' };
    } else {
      value.documentRevision = input.documentRevision;
    }
  }

  if (input.nextReviewAt !== undefined) {
    if (input.nextReviewAt === null) {
      value.nextReviewAt = null;
    } else if (typeof input.nextReviewAt !== 'string' || !isRealIsoDate(input.nextReviewAt)) {
      return { ok: false, error: 'invalid_request_body' };
    } else {
      value.nextReviewAt = input.nextReviewAt;
    }
  }

  if (requireAll) {
    const missing = REQUIRED_CONTROL_FIELDS.filter(
      (field) => value[field] === undefined || value[field] === null,
    );
    if (missing.length > 0) {
      return { ok: false, error: 'document_control_required', missing: [...missing] };
    }
  }

  return { ok: true, value };
}

/**
 * Documento **não excluído da mesma unidade** que já ocupa o código, ou
 * `null`. Comparação por `lower(...)`, igual ao índice único
 * `files_unit_document_code_uidx` — a leitura e a garantia precisam concordar,
 * senão a aplicação recusaria um caso que o banco aceitaria (ou o inverso).
 *
 * Roda na transação tenant já aberta, então a RLS por `unit_id` filtra por
 * baixo: o homônimo de outra unidade não aparece aqui e nada dele é revelado
 * (US 10.2 cenário 3).
 */
export async function findCodeOwner(
  client: PoolClient,
  code: string,
  options: { excludeFileId?: string } = {},
): Promise<{ id: string; file_name: string; owner_id: string; status: string } | null> {
  const params: string[] = [code];
  let exclusion = '';
  if (options.excludeFileId) {
    params.push(options.excludeFileId);
    exclusion = `AND id <> $${params.length}`;
  }
  const { rows } = await client.query<{
    id: string;
    file_name: string;
    owner_id: string;
    status: string;
  }>(
    `SELECT id, file_name, owner_id, status FROM files
     WHERE lower(document_code) = lower($1) AND deleted_at IS NULL ${exclusion}
     LIMIT 1`,
    params,
  );
  return rows[0] ?? null;
}

/**
 * `true` quando o erro do Postgres é a violação do índice único do código
 * (`23505` em `files_unit_document_code_uidx`). A checagem explícita de
 * `findCodeOwner` resolve o caso comum; esta é a rede para a **corrida** entre
 * duas requisições simultâneas, em que só o banco consegue decidir
 * (design.md D5).
 */
export function isDocumentCodeConflict(err: unknown): boolean {
  const candidate = err as { code?: unknown; constraint?: unknown } | null;
  return candidate?.code === '23505' && candidate?.constraint === 'files_unit_document_code_uidx';
}
