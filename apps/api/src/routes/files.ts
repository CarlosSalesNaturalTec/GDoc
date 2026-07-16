import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import { AuditAction, FileAccessAction } from '@gdoc/shared';
import type {
  BatchUploadItemResult,
  BatchUploadUrlRequest,
  FileSummaryResponse,
  RenameFileRequest,
  ReplaceFileRequest,
  UploadUrlRequest,
} from '@gdoc/shared';
import { config } from '../config.js';
import { ensureFolderPath, validateAnchor } from '../lib/folder-tree.js';

interface FileRow {
  id: string;
  unit_id: string;
  owner_id: string;
  folder_id: string | null;
  object_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: string | null;
  status: string;
  created_at: string;
}

function toFileSummaryResponse(row: FileRow): FileSummaryResponse {
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
  action: AuditAction,
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
      const { fileName, contentType, declaredSizeBytes, folderId } = req.body as UploadUrlRequest;

      if (!fileName || !contentType || !Number.isFinite(declaredSizeBytes) || declaredSizeBytes! < 0) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const objectId = randomUUID();
      const objectPath = ports.storage.buildObjectPath(ctx.unitId, ctx.userId, `${objectId}-${fileName}`);

      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        if (folderId) {
          // RLS restringe a leitura à unidade do remetente — pasta de outra
          // unidade não aparece aqui (navegacao spec: "a pasta de destino
          // SHALL pertencer à mesma unidade do remetente").
          const { rows } = await client.query('SELECT id FROM folders WHERE id = $1', [folderId]);
          if (!rows[0]) return { ok: false as const, reason: 'folder not found' as const };
        }

        const { rows } = await client.query<{ storage_used_bytes: string }>(
          'SELECT storage_used_bytes FROM users WHERE id = $1',
          [ctx.userId],
        );
        const currentUsage = Number(rows[0]?.storage_used_bytes ?? '0');
        if (currentUsage + declaredSizeBytes! > config.storageQuotaBytesPerUser) {
          return { ok: false as const, reason: 'quota exceeded' as const };
        }

        await client.query(
          `INSERT INTO files (id, unit_id, owner_id, folder_id, object_path, file_name, content_type, size_bytes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
          [objectId, ctx.unitId, ctx.userId, folderId ?? null, objectPath, fileName, contentType, declaredSizeBytes],
        );
        return { ok: true as const };
      });

      if (!outcome.ok) {
        res.status(outcome.reason === 'folder not found' ? 404 : 400).json({ error: outcome.reason });
        return;
      }

      const signed = await ports.storage.getUploadUrl(objectPath, contentType);
      res.json({ uploadUrl: signed.url, objectPath, expiresAt: signed.expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/files/upload-urls', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const { destinationFolderId, items } = req.body as BatchUploadUrlRequest;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      type PreparedItem =
        | { fileName: string; ok: true; objectPath: string; contentType: string; folderId: string | null }
        | { fileName: string; ok: false; error: string };

      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        // Pré-condição global (design.md D1): destino inválido/de outra
        // unidade derruba o lote inteiro, sem vazar existência — diferente
        // dos erros por item, que não abortam os demais.
        const anchor = await validateAnchor(client, ctx, destinationFolderId);
        if (!anchor.ok) return { ok: false as const, status: anchor.status };

        const { rows: usageRows } = await client.query<{ storage_used_bytes: string }>(
          'SELECT storage_used_bytes FROM users WHERE id = $1',
          [ctx.userId],
        );
        const baseUsage = Number(usageRows[0]?.storage_used_bytes ?? '0');

        // Reserva consciente do lote (design.md D2): soma o que já está
        // pendente/em substituição, e cresce a cada item aceito no próprio
        // lote — sem isso, itens do mesmo lote veem a mesma folga e furam a
        // cota em conjunto.
        const { rows: pendingRows } = await client.query<{ total: string | null }>(
          `SELECT SUM(size_bytes) AS total FROM files WHERE owner_id = $1 AND status IN ('pending', 'replacing')`,
          [ctx.userId],
        );
        let reserved = Number(pendingRows[0]?.total ?? '0');

        const prepared: PreparedItem[] = [];

        for (const item of items) {
          const { fileName, contentType, declaredSizeBytes, relativePath } = item ?? ({} as (typeof items)[number]);

          if (!fileName || !contentType || !Number.isFinite(declaredSizeBytes) || declaredSizeBytes! < 0) {
            prepared.push({ fileName: fileName ?? '', ok: false, error: 'invalid item' });
            continue;
          }

          const pathResult = await ensureFolderPath(client, ctx, anchor.anchor?.id ?? null, relativePath);
          if (!pathResult.ok) {
            prepared.push({ fileName, ok: false, error: pathResult.error });
            continue;
          }

          const available = config.storageQuotaBytesPerUser - baseUsage - reserved;
          if (declaredSizeBytes! > available) {
            prepared.push({ fileName, ok: false, error: 'quota exceeded' });
            continue;
          }

          const objectId = randomUUID();
          const objectPath = ports.storage.buildObjectPath(ctx.unitId, ctx.userId, `${objectId}-${fileName}`);

          await client.query(
            `INSERT INTO files (id, unit_id, owner_id, folder_id, object_path, file_name, content_type, size_bytes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
            [objectId, ctx.unitId, ctx.userId, pathResult.folderId, objectPath, fileName, contentType, declaredSizeBytes],
          );
          reserved += declaredSizeBytes!;

          prepared.push({ fileName, ok: true, objectPath, contentType, folderId: pathResult.folderId });
        }

        return { ok: true as const, prepared };
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.status === 404 ? 'destination not found' : 'forbidden' });
        return;
      }

      // Assinatura fora da transação (mesmo padrão do upload-url singular):
      // evita manter a transação aberta durante N chamadas de rede ao signer.
      const results: BatchUploadItemResult[] = await Promise.all(
        outcome.prepared.map(async (item) => {
          if (!item.ok) return { fileName: item.fileName, ok: false, error: item.error };
          const signed = await ports.storage.getUploadUrl(item.objectPath, item.contentType);
          return {
            fileName: item.fileName,
            ok: true,
            uploadUrl: signed.url,
            objectPath: item.objectPath,
            folderId: item.folderId,
            expiresAt: signed.expiresAt.toISOString(),
          };
        }),
      );

      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/files/:id', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const { fileName } = req.body as RenameFileRequest;
      if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const file = await findFileById(ports, ctx, req.params.id);
      // Checagem por dono até o Épico 4 (design.md D6) — arquivo não
      // visível pela RLS ou de outro dono recebe o mesmo 403, sem
      // distinguir os dois casos.
      if (!file || file.owner_id !== ctx.userId) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const updated = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<FileRow>(
          'UPDATE files SET file_name = $1 WHERE id = $2 RETURNING *',
          [fileName, file.id],
        );
        return rows[0]!;
      });

      await recordAudit(ports, ctx, updated, AuditAction.RENAME);
      res.json(toFileSummaryResponse(updated));
    } catch (err) {
      next(err);
    }
  });

  router.post('/files/:id/replace-url', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      const { contentType, declaredSizeBytes } = req.body as ReplaceFileRequest;
      if (!contentType || !Number.isFinite(declaredSizeBytes) || declaredSizeBytes! < 0) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const file = await findFileById(ports, ctx, req.params.id);
      if (!file || file.owner_id !== ctx.userId) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const objectId = randomUUID();
      const newObjectPath = ports.storage.buildObjectPath(ctx.unitId, ctx.userId, `${objectId}-${file.file_name}`);

      const outcome = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<{ storage_used_bytes: string }>(
          'SELECT storage_used_bytes FROM users WHERE id = $1',
          [ctx.userId],
        );
        const currentUsage = Number(rows[0]?.storage_used_bytes ?? '0');
        const oldSize = Number(file.size_bytes ?? '0');
        // Cota pelo delta (design.md D6): a versão antiga já está contada
        // em `storage_used_bytes`, então só a diferença importa.
        const projectedUsage = currentUsage - oldSize + declaredSizeBytes!;
        if (projectedUsage > config.storageQuotaBytesPerUser) {
          return { ok: false as const };
        }

        // O ponteiro vivo (`object_path`) NÃO muda aqui: se o upload da nova
        // versão for abandonado, o arquivo vigente continua íntegro e
        // consultável. `pending_object_path` guarda o destino do objeto novo
        // até o finalize (routes/storage-events.ts) promover o ponteiro.
        // `status = 'replacing'` (não 'pending') preserva `size_bytes`
        // vigente na linha para o finalize calcular o delta real sem contar
        // em dobro. `folder_id` e `file_name` também são preservados.
        await client.query(`UPDATE files SET pending_object_path = $1, status = 'replacing' WHERE id = $2`, [
          newObjectPath,
          file.id,
        ]);
        return { ok: true as const };
      });

      if (!outcome.ok) {
        res.status(400).json({ error: 'quota exceeded' });
        return;
      }

      const signed = await ports.storage.getUploadUrl(newObjectPath, contentType);
      res.json({ uploadUrl: signed.url, objectPath: newObjectPath, expiresAt: signed.expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
