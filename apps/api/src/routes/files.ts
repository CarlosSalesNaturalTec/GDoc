import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import { FileAccessAction } from '@gdoc/shared';
import { config } from '../config.js';

interface FileRow {
  id: string;
  unit_id: string;
  owner_id: string;
  object_path: string;
  file_name: string;
  content_type: string | null;
}

async function findFileById(ports: Ports, ctx: NonNullable<import('express').Request['tenantContext']>, fileId: string) {
  return ports.database.withTenantTransaction(ctx, async (client) => {
    const { rows } = await client.query<FileRow>('SELECT * FROM files WHERE id = $1', [fileId]);
    return rows[0] ?? null;
  });
}

async function recordAudit(
  ports: Ports,
  ctx: NonNullable<import('express').Request['tenantContext']>,
  file: FileRow,
  action: FileAccessAction,
) {
  await ports.database.withTenantTransaction(ctx, async (client) => {
    await client.query(
      'INSERT INTO audit_events (unit_id, user_id, file_id, action) VALUES ($1, $2, $3, $4)',
      [file.unit_id, ctx.userId, file.id, action],
    );
  });
}

export function filesRouter(ports: Ports): Router {
  const router = Router();

  router.post('/files/:id/view-url', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const file = await findFileById(ports, ctx, req.params.id);
      // RLS já restringe `findFileById` à unidade do usuário (ou bypass de
      // global_admin) — se nada voltou, o usuário não tem permissão de
      // enxergar esse arquivo. Nenhuma URL é emitida, nenhuma auditoria é
      // gravada.
      if (!file) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      await recordAudit(ports, ctx, file, FileAccessAction.VIEW);
      const signed = await ports.storage.getViewUrl(file.object_path);
      res.json({ url: signed.url, expiresAt: signed.expiresAt.toISOString(), action: FileAccessAction.VIEW });
    } catch (err) {
      next(err);
    }
  });

  router.post('/files/:id/download-url', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const file = await findFileById(ports, ctx, req.params.id);
      if (!file) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      await recordAudit(ports, ctx, file, FileAccessAction.DOWNLOAD);
      const signed = await ports.storage.getDownloadUrl(file.object_path, file.file_name);
      res.json({
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
        action: FileAccessAction.DOWNLOAD,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/files/upload-url', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const { fileName, contentType, declaredSizeBytes } = req.body as {
        fileName?: string;
        contentType?: string;
        declaredSizeBytes?: number;
      };

      if (!fileName || !contentType || !Number.isFinite(declaredSizeBytes) || declaredSizeBytes! < 0) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const objectId = randomUUID();
      const objectPath = ports.storage.buildObjectPath(ctx.unitId, ctx.userId, `${objectId}-${fileName}`);

      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<{ storage_used_bytes: string }>(
          'SELECT storage_used_bytes FROM users WHERE id = $1',
          [ctx.userId],
        );
        const currentUsage = Number(rows[0]?.storage_used_bytes ?? '0');
        if (currentUsage + declaredSizeBytes! > config.storageQuotaBytesPerUser) {
          return { ok: false as const };
        }

        await client.query(
          `INSERT INTO files (id, unit_id, owner_id, object_path, file_name, content_type, size_bytes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
          [objectId, ctx.unitId, ctx.userId, objectPath, fileName, contentType, declaredSizeBytes],
        );
        return { ok: true as const };
      });

      if (!outcome.ok) {
        res.status(400).json({ error: 'quota exceeded' });
        return;
      }

      const signed = await ports.storage.getUploadUrl(objectPath, contentType);
      res.json({ uploadUrl: signed.url, objectPath, expiresAt: signed.expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
