import { Router } from 'express';
import type {
  GrantNotificationPayload,
  NotificationKind,
  NotificationListResponse,
  NotificationResponse,
  UnreadNotificationCountResponse,
} from '@gdoc/shared';
import type { Ports } from '../ports/index.js';

interface NotificationRow {
  id: string;
  kind: string;
  payload: GrantNotificationPayload;
  created_at: string;
  read_at: string | null;
}

function toNotificationResponse(row: NotificationRow): NotificationResponse {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

/**
 * `routes/notifications.ts` — leitura da própria caixa de notificações
 * (design.md D4, capability `notificacoes`). Toda query filtra
 * explicitamente por `recipient_user_id = ctx.userId` **e** `unit_id =
 * ctx.unitId`, sem depender só da RLS — mesma trava aplicada em
 * `lib/access.ts` para o bypass de `global_admin`: mesmo um admin global só
 * enxerga as próprias notificações, nunca as de outra pessoa ou unidade.
 */
export function notificationsRouter(ports: Ports): Router {
  const router = Router();

  router.get('/notifications', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const rows = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<NotificationRow>(
          `SELECT id, kind, payload, created_at, read_at FROM notifications
           WHERE recipient_user_id = $1 AND unit_id = $2
           ORDER BY created_at DESC`,
          [ctx.userId, ctx.unitId],
        );
        return rows;
      });

      const response: NotificationListResponse = { notifications: rows.map(toNotificationResponse) };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications/unread-count', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const count = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<{ count: string }>(
          `SELECT count(*) FROM notifications WHERE recipient_user_id = $1 AND unit_id = $2 AND read_at IS NULL`,
          [ctx.userId, ctx.unitId],
        );
        return Number(rows[0]?.count ?? '0');
      });

      const response: UnreadNotificationCountResponse = { count };
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/:id/read', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      // `COALESCE` preserva o instante original da primeira leitura — marcar
      // como lida de novo é idempotente, não sobrescreve `read_at`.
      const updated = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query(
          `UPDATE notifications SET read_at = COALESCE(read_at, now())
           WHERE id = $1 AND recipient_user_id = $2 AND unit_id = $3
           RETURNING id`,
          [req.params.id, ctx.userId, ctx.unitId],
        );
        return rows[0] ?? null;
      });

      if (!updated) {
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
