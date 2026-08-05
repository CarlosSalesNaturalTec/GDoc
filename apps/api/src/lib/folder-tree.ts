import type { PoolClient } from 'pg';
import { GrantResourceType, Permission } from '@gdoc/shared';
import type { TenantContext } from '../ports/database-port.js';
import { hasAccess, isAdminOfUnit, resourceScopeClause, visibleResourceClause } from './access.js';

export interface FolderRow {
  id: string;
  unit_id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

/**
 * Pasta na lixeira resolve como inexistente (design.md D2) — breadcrumb,
 * validação de âncora de upload e a rota de conteúdo não enxergam pasta
 * excluída; a lixeira e o restore consultam `folders` diretamente, sem
 * passar por aqui.
 */
export async function findFolderById(client: PoolClient, folderId: string): Promise<FolderRow | null> {
  const { rows } = await client.query<FolderRow>(
    'SELECT * FROM folders WHERE id = $1 AND deleted_at IS NULL',
    [folderId],
  );
  return rows[0] ?? null;
}

export type AnchorValidation =
  | { ok: true; anchor: FolderRow | null }
  | { ok: false; status: 404 | 403 };

/**
 * Valida a pasta-âncora (`parentId`/`destinationFolderId`): RLS já restringe
 * a leitura à unidade do usuário — pasta de outra unidade simplesmente não
 * aparece aqui, sem distinguir "não existe" de "é de outra unidade"
 * (design.md D3/D4: "sem vazar"). `anchorId` ausente/`null` = raiz. Enviar
 * para pasta própria segue livre (posse); para pasta de outra pessoa exige
 * grant `upload` sobre ela (Épico 4, design.md D3).
 */
export async function validateAnchor(
  client: PoolClient,
  ctx: TenantContext,
  anchorId: string | null | undefined,
): Promise<AnchorValidation> {
  if (!anchorId) return { ok: true, anchor: null };
  const anchor = await findFolderById(client, anchorId);
  if (!anchor) return { ok: false, status: 404 };
  const allowed = await hasAccess(client, ctx, GrantResourceType.FOLDER, anchor.id, Permission.UPLOAD);
  if (!allowed) return { ok: false, status: 403 };
  return { ok: true, anchor };
}

/**
 * Normaliza um `relativePath` em segmentos, rejeitando vazios, `.`/`..` e
 * separadores estranhos — barreira contra path traversal (design.md D3):
 * o caminho nunca vira caminho físico no bucket, só define a árvore lógica
 * de `folders`, mas ainda assim não pode escapar da âncora.
 */
export function normalizeRelativePath(relativePath: string): string[] | null {
  if (typeof relativePath !== 'string') return null;
  const trimmed = relativePath.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.includes('\\') || trimmed.includes('\0')) return null;

  const segments = trimmed.split('/').map((segment) => segment.trim());
  for (const segment of segments) {
    if (segment.length === 0) return null;
    if (segment === '.' || segment === '..') return null;
  }
  return segments;
}

async function findOrCreateChild(
  client: PoolClient,
  ctx: TenantContext,
  parentId: string | null,
  name: string,
): Promise<FolderRow> {
  const readExisting = () =>
    client.query<FolderRow>(
      `SELECT * FROM folders
       WHERE unit_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND lower(name) = lower($3) AND deleted_at IS NULL`,
      [ctx.unitId, parentId, name],
    );

  const { rows: existing } = await readExisting();
  if (existing[0]) return existing[0];

  // `ON CONFLICT` casa com o índice único parcial `folders_unit_parent_name_uidx`
  // (migração 0006, restrito a `deleted_at IS NULL` pela 0008 — épico 6:
  // pasta excluída não bloqueia recriar o nome) para os níveis internos,
  // tornando a criação idempotente sob concorrência. Na raiz (`parent_id`
  // NULL) o índice não pega colisões — dois NULL não são iguais em Postgres
  // (design.md D4) — então a idempotência da raiz depende só da leitura
  // acima; aceito e documentado, mesma classe de gap do D2.
  await client.query(
    `INSERT INTO folders (unit_id, owner_id, parent_id, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (unit_id, parent_id, lower(name)) WHERE deleted_at IS NULL DO NOTHING`,
    [ctx.unitId, ctx.userId, parentId, name],
  );

  const { rows: after } = await readExisting();
  return after[0]!;
}

/**
 * Garante a existência da cadeia de pastas de `relativePath` sob `anchorId`
 * (design.md D3), criando os níveis que faltarem e reaproveitando os
 * existentes, e devolve o `id` da pasta-folha. `relativePath` ausente
 * devolve a própria âncora, sem tocar o banco.
 */
export async function ensureFolderPath(
  client: PoolClient,
  ctx: TenantContext,
  anchorId: string | null,
  relativePath: string | undefined,
): Promise<{ ok: true; folderId: string | null } | { ok: false; error: string }> {
  if (relativePath === undefined) return { ok: true, folderId: anchorId };

  const segments = normalizeRelativePath(relativePath);
  if (!segments) return { ok: false, error: 'invalid path' };

  let parentId = anchorId;
  for (const name of segments) {
    const folder = await findOrCreateChild(client, ctx, parentId, name);
    parentId = folder.id;
  }
  return { ok: true, folderId: parentId };
}

interface SubtreeFileRow {
  id: string;
  unit_id: string;
  owner_id: string;
  object_path: string;
  file_name: string;
  size_bytes: string | null;
  allowed: boolean;
}

/**
 * Uma pasta em profundidade da travessia (design.md D2): subpastas SHALL vir
 * já filtradas por `view` (mesmo fragmento de `listContents`,
 * `routes/folders.ts`) e arquivos SHALL vir com a coluna `allowed` calculada
 * em SQL a partir do mesmo fragmento de acesso, agora para o verbo
 * `download` — sem round-trip extra por item.
 */
async function listSubtreeLevel(
  client: PoolClient,
  ctx: TenantContext,
  folderId: string | null,
): Promise<{ folders: FolderRow[]; files: SubtreeFileRow[] }> {
  const admin = isAdminOfUnit(ctx, ctx.unitId);
  const params: string[] = admin ? [] : [ctx.userId];
  const ownerPlaceholder = admin ? '' : `$${params.length}`;

  let anchorClause = '';
  if (folderId !== null) {
    params.push(folderId);
    anchorClause = `$${params.length}`;
  }

  const parentClause = folderId === null ? 'parent_id IS NULL' : `parent_id = ${anchorClause}`;
  const { rows: folders } = await client.query<FolderRow>(
    `SELECT * FROM folders WHERE ${visibleResourceClause(GrantResourceType.FOLDER, ownerPlaceholder, ctx)} AND ${parentClause} ORDER BY name`,
    params,
  );

  const folderClause = folderId === null ? 'folder_id IS NULL' : `folder_id = ${anchorClause}`;
  const { rows: files } = await client.query<SubtreeFileRow>(
    `SELECT id, unit_id, owner_id, object_path, file_name, size_bytes,
       (${resourceScopeClause(GrantResourceType.FILE, ownerPlaceholder, ctx, Permission.DOWNLOAD)}) AS allowed
     FROM files WHERE deleted_at IS NULL AND ${folderClause} ORDER BY file_name`,
    params,
  );

  return { folders, files };
}

export interface SubtreeManifestEntry {
  fileId: string;
  unitId: string;
  objectPath: string;
  fileName: string;
  sizeBytes: number;
  relativePath: string;
}

export interface SubtreeManifest {
  entries: SubtreeManifestEntry[];
  /** Arquivos vivos na subárvore **visível** ao solicitante (design.md D3) — não conta o
   * que está dentro de subpastas podadas por falta de `view` (design.md D2), para não
   * vazar a existência de conteúdo que o solicitante não pode nem abrir. */
  totalFiles: number;
}

/**
 * Percorre a subárvore **viva** (`deleted_at IS NULL`) a partir de
 * `rootFolderId` (`null` = raiz da unidade), produzindo o caminho relativo de
 * cada arquivo permitido (inverso de `normalizeRelativePath`, design.md D7).
 * A checagem de `view` sobre a própria pasta pedida é responsabilidade do
 * chamador — esta função só decide sobre a descendência (design.md D2):
 * subpasta sem `view` é podada com toda a sua descendência (task 2.2), e
 * pastas cujo conteúdo foi integralmente filtrado nunca geram entrada própria
 * — só arquivos viram entrada (task 2.3).
 */
export async function traverseFolderSubtree(
  client: PoolClient,
  ctx: TenantContext,
  rootFolderId: string | null,
): Promise<SubtreeManifest> {
  const entries: SubtreeManifestEntry[] = [];
  let totalFiles = 0;

  async function walk(folderId: string | null, pathSegments: string[]): Promise<void> {
    const { folders, files } = await listSubtreeLevel(client, ctx, folderId);

    totalFiles += files.length;
    for (const file of files) {
      if (!file.allowed) continue;
      entries.push({
        fileId: file.id,
        unitId: file.unit_id,
        objectPath: file.object_path,
        fileName: file.file_name,
        sizeBytes: Number(file.size_bytes ?? '0'),
        relativePath: [...pathSegments, file.file_name].join('/'),
      });
    }

    for (const folder of folders) {
      await walk(folder.id, [...pathSegments, folder.name]);
    }
  }

  await walk(rootFolderId, []);
  return { entries, totalFiles };
}
