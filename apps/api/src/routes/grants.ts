import { Router } from 'express';
import { GrantResourceType, Permission, UserRole } from '@gdoc/shared';
import type { CreateGrantRequest, GrantListResponse, GrantResponse } from '@gdoc/shared';
import type { Ports } from '../ports/index.js';
import type { TenantContext } from '../ports/database-port.js';
import { resourceTable } from '../lib/access.js';

interface GrantRow {
  id: string;
  unit_id: string;
  subject_user_id: string;
  resource_type: string;
  resource_id: string;
  permission: string;
  granted_by: string;
  created_at: string;
}

function toGrantResponse(row: GrantRow): GrantResponse {
  return {
    id: row.id,
    unitId: row.unit_id,
    subjectUserId: row.subject_user_id,
    resourceType: row.resource_type as GrantResourceType,
    resourceId: row.resource_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isAdmin(ctx: TenantContext): boolean {
  return ctx.role === UserRole.GLOBAL_ADMIN || ctx.role === UserRole.UNIT_ADMIN;
}

const RESOURCE_TYPES: string[] = Object.values(GrantResourceType);
const PERMISSIONS: string[] = Object.values(Permission);

/**
 * `routes/grants.ts` — conceder/listar/revogar permissão granular por
 * pessoa (US 4.1), restrito à administração (design.md D5). Mesma dupla
 * camada de `routes/users.ts`: a checagem de papel aqui barra o
 * `collaborator` de plano, e a RLS (`withTenantTransaction`) garante que
 * `unit_admin` nunca opere fora da própria unidade mesmo se a checagem de
 * aplicação falhasse.
 */
export function grantsRouter(ports: Ports): Router {
  const router = Router();

  router.post('/grants', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      if (!isAdmin(ctx)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const body = req.body as CreateGrantRequest;
      if (
        !body.subjectUserId ||
        !RESOURCE_TYPES.includes(body.resourceType) ||
        !body.resourceId ||
        !Array.isArray(body.permissions) ||
        body.permissions.length === 0 ||
        !body.permissions.every((permission) => PERMISSIONS.includes(permission))
      ) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        // RLS já restringe a leitura à unidade do admin (ou bypass de
        // global_admin) — recurso ou pessoa de outra unidade simplesmente
        // não aparecem aqui, sem distinguir "não existe" de "é de outra
        // unidade" (design.md D5: "sem vazar existência").
        const { rows: resourceRows } = await client.query<{ unit_id: string }>(
          `SELECT unit_id FROM ${resourceTable(body.resourceType)} WHERE id = $1`,
          [body.resourceId],
        );
        const resource = resourceRows[0];
        if (!resource) return { status: 404 as const };

        const { rows: subjectRows } = await client.query('SELECT id FROM users WHERE id = $1', [
          body.subjectUserId,
        ]);
        if (!subjectRows[0]) return { status: 404 as const };

        const rows: GrantRow[] = [];
        for (const permission of body.permissions) {
          const { rows: inserted } = await client.query<GrantRow>(
            `INSERT INTO grants (unit_id, subject_user_id, resource_type, resource_id, permission, granted_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (unit_id, subject_user_id, resource_type, resource_id, permission) DO NOTHING
             RETURNING *`,
            [resource.unit_id, body.subjectUserId, body.resourceType, body.resourceId, permission, ctx.userId],
          );
          if (inserted[0]) {
            rows.push(inserted[0]);
            continue;
          }
          // Já concedido (idempotência, design.md D1): devolve a linha
          // existente, sem duplicar nem falhar.
          const { rows: existing } = await client.query<GrantRow>(
            `SELECT * FROM grants
             WHERE unit_id = $1 AND subject_user_id = $2 AND resource_type = $3 AND resource_id = $4 AND permission = $5`,
            [resource.unit_id, body.subjectUserId, body.resourceType, body.resourceId, permission],
          );
          rows.push(existing[0]!);
        }
        return { status: 201 as const, rows };
      });

      if (outcome.status !== 201) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      const response: GrantListResponse = { grants: outcome.rows.map(toGrantResponse) };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  });

  router.get('/grants', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      if (!isAdmin(ctx)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const resourceType = req.query.resourceType;
      const resourceId = req.query.resourceId;
      if (typeof resourceType !== 'string' || !RESOURCE_TYPES.includes(resourceType) || typeof resourceId !== 'string' || !resourceId) {
        res.status(400).json({ error: 'invalid query' });
        return;
      }

      // Nenhum filtro de unidade aqui: a RLS já restringe unit_admin à
      // própria unidade e dá bypass a global_admin (mesmo padrão de
      // routes/users.ts).
      const rows = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<GrantRow>(
          'SELECT * FROM grants WHERE resource_type = $1 AND resource_id = $2 ORDER BY created_at',
          [resourceType, resourceId],
        );
        return rows;
      });

      const response: GrantListResponse = { grants: rows.map(toGrantResponse) };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/grants/:id', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      if (!isAdmin(ctx)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      // RLS filtra a linha visível para DELETE antes do WHERE por id rodar:
      // grant de outra unidade não aparece, 0 linhas removidas.
      const deleted = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query('DELETE FROM grants WHERE id = $1 RETURNING id', [req.params.id]);
        return rows[0] ?? null;
      });

      if (!deleted) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
