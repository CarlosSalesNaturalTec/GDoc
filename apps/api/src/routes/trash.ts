import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import { GrantResourceType, Permission } from '@gdoc/shared';
import type { TrashEntryResponse, TrashListResponse } from '@gdoc/shared';
import { config } from '../config.js';
import { isAdminOfUnit, resourceScopeClause } from '../lib/access.js';

interface TrashRow {
  id: string;
  name: string;
  deleted_at: string;
}

function toEntry(row: TrashRow, type: GrantResourceType): TrashEntryResponse {
  const deletedAt = new Date(row.deleted_at);
  const expiresAt = new Date(deletedAt.getTime() + config.trashRetentionDays * 24 * 60 * 60 * 1000);
  return {
    id: row.id,
    type,
    name: row.name,
    deletedAt: deletedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * `GET /trash` — raízes de exclusão no alcance do solicitante: próprias,
 * com grant `delete`, ou toda a unidade se admin (design.md D9). Mesmo
 * fragmento de alcance de `hasAccess`/`visibleResourceClause`
 * (`resourceScopeClause`), mas com o filtro de `deleted_at` invertido — só
 * raízes (`trash_root_id = id`) aparecem, nunca descendentes soltos.
 */
export function trashRouter(ports: Ports): Router {
  const router = Router();

  router.get('/trash', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const admin = isAdminOfUnit(ctx, ctx.unitId);
      const params: string[] = admin ? [] : [ctx.userId];
      const ownerPlaceholder = admin ? '' : `$${params.length}`;

      const folderScope = resourceScopeClause(GrantResourceType.FOLDER, ownerPlaceholder, ctx, Permission.DELETE);
      const fileScope = resourceScopeClause(GrantResourceType.FILE, ownerPlaceholder, ctx, Permission.DELETE);

      const { folders, files } = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows: folders } = await client.query<TrashRow>(
          `SELECT id, name, deleted_at FROM folders
           WHERE deleted_at IS NOT NULL AND trash_root_id = id AND ${folderScope}
           ORDER BY deleted_at DESC`,
          params,
        );
        const { rows: files } = await client.query<TrashRow>(
          `SELECT id, file_name AS name, deleted_at FROM files
           WHERE deleted_at IS NOT NULL AND trash_root_id = id AND ${fileScope}
           ORDER BY deleted_at DESC`,
          params,
        );
        return { folders, files };
      });

      const items: TrashEntryResponse[] = [
        ...folders.map((row) => toEntry(row, GrantResourceType.FOLDER)),
        ...files.map((row) => toEntry(row, GrantResourceType.FILE)),
      ];
      const response: TrashListResponse = { items };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
