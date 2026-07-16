import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import { config } from '../config.js';
import type { StorageFinalizeNotification } from '@gdoc/shared';

const SYSTEM_UNIT = '00000000-0000-0000-0000-000000000000';

/**
 * Reconciliação pós-upload. Em produção, o alvo real de um push
 * subscription do Pub/Sub disparado pela notificação de finalização de
 * objeto do GCS (ver infra/terraform). Em dev, sem Pub/Sub, este mesmo
 * endpoint é chamado diretamente (pela prova E2E ou manualmente) com o
 * mesmo payload — o código de reconciliação é idêntico nos dois mundos.
 */
export function storageEventsRouter(ports: Ports): Router {
  const router = Router();

  router.post('/internal/storage-events', async (req, res, next) => {
    try {
      const { objectPath, sizeBytes } = req.body as StorageFinalizeNotification;
      if (!objectPath || !Number.isFinite(sizeBytes)) {
        res.status(400).json({ error: 'invalid notification payload' });
        return;
      }

      const result = await ports.database.withTenantTransaction(
        { unitId: SYSTEM_UNIT, userId: SYSTEM_UNIT, role: 'global_admin' },
        async (client) => {
          const { rows } = await client.query<{
            id: string;
            owner_id: string;
            unit_id: string;
          }>('SELECT id, owner_id, unit_id FROM files WHERE object_path = $1', [objectPath]);
          const file = rows[0];
          if (!file) return { found: false as const };

          const { rows: userRows } = await client.query<{ storage_used_bytes: string }>(
            'SELECT storage_used_bytes FROM users WHERE id = $1',
            [file.owner_id],
          );
          const newUsage = Number(userRows[0]?.storage_used_bytes ?? '0') + sizeBytes;
          const overQuota = newUsage > config.storageQuotaBytesPerUser;

          await client.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [
            newUsage,
            file.owner_id,
          ]);
          await client.query('UPDATE files SET size_bytes = $1, status = $2 WHERE id = $3', [
            sizeBytes,
            overQuota ? 'over_quota' : 'active',
            file.id,
          ]);

          return { found: true as const, overQuota };
        },
      );

      if (!result.found) {
        res.status(404).json({ error: 'unknown object_path' });
        return;
      }

      res.json({ status: result.overQuota ? 'over_quota' : 'active' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
