import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import { GrantResourceType } from '@gdoc/shared';
import type { SearchFilesResponse, FileSummaryResponse } from '@gdoc/shared';
import { isAdminOfUnit, visibleResourceClause } from '../lib/access.js';
import { categoryContentTypeClause, isValidFileCategory, parseDateBoundary, exclusiveDayAfter } from '../lib/search-filters.js';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Único valor de string de um query param — `req.query` também aceita array/objeto, que a busca não trata (design.md D6: entrada malformada ⇒ 400). */
function singleQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Limite superior fixo (design.md D1) — paginação por cursor fica para quando o volume exigir.
const RESULT_LIMIT = 500;

/**
 * Busca transversal de arquivos por nome + filtros combináveis (US 9.1). É
 * `listContents` (routes/folders.ts) sem âncora de pasta e com filtros
 * adicionais: mesma fronteira de permissão (`visibleResourceClause`, verbo
 * `view`), mesma RLS por unidade da transação tenant, mesma exclusão de
 * lixeira (design.md D2/D3).
 */
export function searchRouter(ports: Ports): Router {
  const router = Router();

  router.get('/files/search', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;

      const q = singleQueryValue(req.query.q);
      const type = singleQueryValue(req.query.type);
      const author = singleQueryValue(req.query.author);
      const dateFromRaw = singleQueryValue(req.query.dateFrom);
      const dateToRaw = singleQueryValue(req.query.dateTo);

      if (type !== undefined && !isValidFileCategory(type)) {
        res.status(400).json({ error: 'invalid type filter' });
        return;
      }
      if (author !== undefined && !UUID_RE.test(author)) {
        res.status(400).json({ error: 'invalid author filter' });
        return;
      }

      let dateFrom: Date | null = null;
      if (dateFromRaw !== undefined) {
        dateFrom = parseDateBoundary(dateFromRaw);
        if (!dateFrom) {
          res.status(400).json({ error: 'invalid dateFrom filter' });
          return;
        }
      }

      let dateToExclusive: Date | null = null;
      if (dateToRaw !== undefined) {
        const dateTo = parseDateBoundary(dateToRaw);
        if (!dateTo) {
          res.status(400).json({ error: 'invalid dateTo filter' });
          return;
        }
        dateToExclusive = exclusiveDayAfter(dateTo);
      }

      const files = await ports.database.withTenantTransaction(ctx, async (client) => {
        // Admin da unidade (design.md D2, mesmo cuidado de `listContents`): o
        // fragmento de visibilidade vira `TRUE`/literal de `unit_id`, sem
        // referenciar `ownerPlaceholder` — por isso o placeholder do dono só
        // entra nos parâmetros quando não-admin, senão o driver rejeita um
        // `$n` sem uso correspondente na query.
        const admin = isAdminOfUnit(ctx, ctx.unitId);
        const params: unknown[] = admin ? [] : [ctx.userId];
        const ownerPlaceholder = admin ? '' : `$${params.length}`;

        let where = visibleResourceClause(GrantResourceType.FILE, ownerPlaceholder, ctx);

        if (q !== undefined) {
          params.push(q);
          where += ` AND file_name ILIKE '%' || $${params.length} || '%'`;
        }
        if (type !== undefined) {
          where += ` AND ${categoryContentTypeClause(type)}`;
        }
        if (author !== undefined) {
          params.push(author);
          where += ` AND owner_id = $${params.length}`;
        }
        if (dateFrom) {
          params.push(dateFrom.toISOString());
          where += ` AND created_at >= $${params.length}`;
        }
        if (dateToExclusive) {
          params.push(dateToExclusive.toISOString());
          where += ` AND created_at < $${params.length}`;
        }

        const { rows } = await client.query<FileSummaryRow>(
          `SELECT id, owner_id, folder_id, file_name, content_type, size_bytes, status, created_at
           FROM files WHERE ${where} ORDER BY created_at DESC LIMIT ${RESULT_LIMIT}`,
          params,
        );
        return rows;
      });

      const response: SearchFilesResponse = { files: files.map(toFileSummaryResponse) };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
