import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import type { TenantContext } from '../ports/database-port.js';
import { GrantResourceType, Permission } from '@gdoc/shared';
import type { CreateFolderRequest, FolderResponse, FileSummaryResponse } from '@gdoc/shared';
import type { PoolClient } from 'pg';
import { findFolderById, type FolderRow } from '../lib/folder-tree.js';
import { hasAccess, visibleResourceClause } from '../lib/access.js';

interface FileSummaryRow {
  id: string;
  owner_id: string;
  folder_id: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: string | null;
  status: string;
  created_at: string;
}

function toFolderResponse(row: FolderRow): FolderResponse {
  return {
    id: row.id,
    unitId: row.unit_id,
    ownerId: row.owner_id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toFileSummaryResponse(row: FileSummaryRow): FileSummaryResponse {
  return {
    id: row.id,
    ownerId: row.owner_id,
    folderId: row.folder_id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Sobe a cadeia `parent_id` a partir da pasta corrente até a raiz, montando
 * a trilha (design.md D5). O walk roda na mesma transação tenant já aberta
 * pelo chamador — RLS garante que nenhuma pasta de outra unidade apareça
 * aqui, e a invariante de criação (D4: subpasta só dentro de pasta própria)
 * garante que todo ancestral já pertence ao mesmo dono.
 */
async function buildBreadcrumb(client: PoolClient, folder: FolderRow): Promise<FolderRow[]> {
  const breadcrumb: FolderRow[] = [];
  let parentId = folder.parent_id;
  while (parentId) {
    const parent = await findFolderById(client, parentId);
    if (!parent) break;
    breadcrumb.unshift(parent);
    parentId = parent.parent_id;
  }
  return breadcrumb;
}

/**
 * Itens próprios OU com grant `view`, por tipo (design.md D8) — fecha a
 * US 2.1 cenário 2. Sem herança: filhos de uma pasta liberada só aparecem
 * se também forem próprios ou liberados, nunca por estarem dentro dela.
 */
async function listContents(
  client: PoolClient,
  ctx: TenantContext,
  folderId: string | null,
): Promise<{ folders: FolderRow[]; files: FileSummaryRow[] }> {
  const parentClause = folderId === null ? 'parent_id IS NULL' : 'parent_id = $2';
  const folderParams = folderId === null ? [ctx.userId] : [ctx.userId, folderId];
  const { rows: folders } = await client.query<FolderRow>(
    `SELECT * FROM folders WHERE ${visibleResourceClause(GrantResourceType.FOLDER, '$1')} AND ${parentClause} ORDER BY name`,
    folderParams,
  );

  const folderClause = folderId === null ? 'folder_id IS NULL' : 'folder_id = $2';
  const fileParams = folderId === null ? [ctx.userId] : [ctx.userId, folderId];
  const { rows: files } = await client.query<FileSummaryRow>(
    `SELECT id, owner_id, folder_id, file_name, content_type, size_bytes, status, created_at
     FROM files WHERE ${visibleResourceClause(GrantResourceType.FILE, '$1')} AND ${folderClause} ORDER BY file_name`,
    fileParams,
  );

  return { folders, files };
}

export function foldersRouter(ports: Ports): Router {
  const router = Router();

  router.post('/folders', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const { name, parentId } = req.body as CreateFolderRequest;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        if (parentId) {
          const parent = await findFolderById(client, parentId);
          // Pai inexistente (ou de outra unidade, escondido pela RLS) e pai
          // de outra pessoa resolvem igual — 403, sem distinguir os casos
          // (fail-closed, não vaza existência; mesmo tratamento do endpoint
          // de contents e de `findAccessibleFile` em routes/files.ts).
          if (!parent || parent.owner_id !== ctx.userId) return { status: 403 as const };
        }

        const { rows } = await client.query<FolderRow>(
          `INSERT INTO folders (unit_id, owner_id, parent_id, name) VALUES ($1, $2, $3, $4) RETURNING *`,
          [ctx.unitId, ctx.userId, parentId ?? null, name],
        );
        return { status: 201 as const, folder: rows[0]! };
      });

      if (outcome.status !== 201) {
        res.status(outcome.status).json({ error: 'forbidden' });
        return;
      }

      res.status(201).json(toFolderResponse(outcome.folder));
    } catch (err) {
      next(err);
    }
  });

  // Precisa vir antes de `/folders/:id/contents` — senão "root" seria
  // capturado como `:id`.
  router.get('/folders/root/contents', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const { folders, files } = await ports.database.withTenantTransaction(ctx, (client) =>
        listContents(client, ctx, null),
      );

      res.json({
        folder: null,
        breadcrumb: [],
        folders: folders.map(toFolderResponse),
        files: files.map(toFileSummaryResponse),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/folders/:id/contents', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        const folder = await findFolderById(client, req.params.id);
        // Dono-ou-grant `view` (design.md D2): pasta inexistente (ou
        // escondida pela RLS de outra unidade) e pasta existente sem `view`
        // resolvem igual — 403, sem distinguir os dois casos (fail-closed,
        // sem vazar existência; mesmo tratamento de `findAccessibleFile` em
        // routes/files.ts). Distinguir com 404 vazaria que a pasta existe na
        // unidade do solicitante.
        if (!folder) return { status: 403 as const };
        const allowed = await hasAccess(client, ctx, GrantResourceType.FOLDER, folder.id, Permission.VIEW);
        if (!allowed) return { status: 403 as const };

        const breadcrumb = await buildBreadcrumb(client, folder);
        const { folders, files } = await listContents(client, ctx, folder.id);
        return { status: 200 as const, folder, breadcrumb, folders, files };
      });

      if (outcome.status !== 200) {
        res.status(outcome.status).json({ error: 'forbidden' });
        return;
      }

      res.json({
        folder: toFolderResponse(outcome.folder),
        breadcrumb: outcome.breadcrumb.map(toFolderResponse),
        folders: outcome.folders.map(toFolderResponse),
        files: outcome.files.map(toFileSummaryResponse),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
