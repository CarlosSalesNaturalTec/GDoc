import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';
import { config } from '../config.js';

async function createActiveFile(
  pool: Pool,
  opts: { unitId: string; ownerId: string; objectPath: string; fileName: string; sizeBytes: number },
): Promise<string> {
  const { rows } = await withSystemBypass(pool, (client) =>
    client.query<{ id: string }>(
      `INSERT INTO files (unit_id, owner_id, object_path, file_name, content_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, 'text/plain', $5, 'active') RETURNING id`,
      [opts.unitId, opts.ownerId, opts.objectPath, opts.fileName, opts.sizeBytes],
    ),
  );
  return rows[0]!.id;
}

describe('Gestão de arquivo: renomear e substituir (US 2.2)', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;
  let userA2Id: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, 'collab-a2@test.dev', 'x', 'collaborator') RETURNING id`,
        [ids.unitA],
      ),
    );
    userA2Id = rows[0]!.id;

    const secrets = new EnvSecretsPort();
    ports = {
      database: new PgDatabasePort(),
      storage: new InMemoryStoragePort(),
      secrets,
      auth: new Argon2AuthPort(secrets),
    };
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  it('dono renomeia arquivo: nome atualizado, conteúdo inalterado, evento registrado', async () => {
    const app = createApp(ports);
    const fileId = await createActiveFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/rename-1',
      fileName: 'antigo.txt',
      sizeBytes: 100,
    });

    const res = await request(app)
      .patch(`/files/${fileId}`)
      .set('Cookie', await sessionCookieFor(ports, ids.userA))
      .send({ fileName: 'novo.txt' });

    expect(res.status).toBe(200);
    expect(res.body.fileName).toBe('novo.txt');

    const row = await withSystemBypass(pool, (client) =>
      client.query('SELECT object_path FROM files WHERE id = $1', [fileId]),
    );
    expect(row.rows[0]?.object_path).toBe('unitA/rename-1');

    const audit = await withSystemBypass(pool, (client) =>
      client.query('SELECT action FROM audit_events WHERE file_id = $1', [fileId]),
    );
    expect(audit.rows).toEqual([{ action: 'rename' }]);
  });

  it('renomeação sem permissão é bloqueada e nada é alterado', async () => {
    const app = createApp(ports);
    const fileId = await createActiveFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/rename-2',
      fileName: 'protegido.txt',
      sizeBytes: 100,
    });

    const res = await request(app)
      .patch(`/files/${fileId}`)
      .set('Cookie', await sessionCookieFor(ports, userA2Id))
      .send({ fileName: 'hackeado.txt' });

    expect(res.status).toBe(403);

    const row = await withSystemBypass(pool, (client) =>
      client.query('SELECT file_name FROM files WHERE id = $1', [fileId]),
    );
    expect(row.rows[0]?.file_name).toBe('protegido.txt');
  });

  it('dono substitui arquivo: mesmo local lógico, versão anterior indisponível, cota ajustada e evento registrado', async () => {
    const app = createApp(ports);
    const fileId = await createActiveFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/replace-1-old',
      fileName: 'relatorio.txt',
      sizeBytes: 100,
    });
    await withSystemBypass(pool, (client) =>
      client.query('UPDATE users SET storage_used_bytes = 100 WHERE id = $1', [ids.userA]),
    );

    const replace = await request(app)
      .post(`/files/${fileId}/replace-url`)
      .set('Cookie', await sessionCookieFor(ports, ids.userA))
      .send({ contentType: 'text/plain', declaredSizeBytes: 300 });

    expect(replace.status).toBe(200);
    const newObjectPath = replace.body.objectPath as string;
    expect(newObjectPath).not.toBe('unitA/replace-1-old');

    const pending = await withSystemBypass(pool, (client) =>
      client.query('SELECT object_path, pending_object_path, status, file_name FROM files WHERE id = $1', [fileId]),
    );
    // Antes do finalize o ponteiro vivo continua na versão vigente; o path
    // novo fica reservado em pending_object_path.
    expect(pending.rows[0]?.object_path).toBe('unitA/replace-1-old');
    expect(pending.rows[0]?.pending_object_path).toBe(newObjectPath);
    expect(pending.rows[0]?.status).toBe('replacing');
    expect(pending.rows[0]?.file_name).toBe('relatorio.txt');

    const finalize = await request(app)
      .post('/internal/storage-events')
      .send({ bucket: 'test-bucket', objectPath: newObjectPath, sizeBytes: 300 });
    expect(finalize.status).toBe(200);

    const after = await withSystemBypass(pool, (client) =>
      client.query('SELECT object_path, pending_object_path, status, size_bytes FROM files WHERE id = $1', [fileId]),
    );
    // Só após o finalize o ponteiro vivo é promovido para o objeto novo.
    expect(after.rows[0]?.object_path).toBe(newObjectPath);
    expect(after.rows[0]?.pending_object_path).toBeNull();
    expect(after.rows[0]?.status).toBe('active');
    expect(Number(after.rows[0]?.size_bytes)).toBe(300);

    const user = await withSystemBypass(pool, (client) =>
      client.query('SELECT storage_used_bytes FROM users WHERE id = $1', [ids.userA]),
    );
    // 100 (uso anterior) - 100 (tamanho antigo) + 300 (tamanho novo) = 300 — sem contar em dobro.
    expect(Number(user.rows[0]?.storage_used_bytes)).toBe(300);

    const audit = await withSystemBypass(pool, (client) =>
      client.query('SELECT action FROM audit_events WHERE file_id = $1', [fileId]),
    );
    expect(audit.rows).toEqual([{ action: 'replace' }]);

    const oldPathStillIndexed = await withSystemBypass(pool, (client) =>
      client.query('SELECT 1 FROM files WHERE object_path = $1', ['unitA/replace-1-old']),
    );
    expect(oldPathStillIndexed.rows).toHaveLength(0);
  });

  it('substituição abandonada (URL emitida, upload nunca concluído) mantém o arquivo vigente íntegro e consultável', async () => {
    const app = createApp(ports);
    const fileId = await createActiveFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/replace-abandoned-old',
      fileName: 'vivo.txt',
      sizeBytes: 100,
    });
    await withSystemBypass(pool, (client) =>
      client.query('UPDATE users SET storage_used_bytes = 100 WHERE id = $1', [ids.userA]),
    );
    const cookie = await sessionCookieFor(ports, ids.userA);

    const replace = await request(app)
      .post(`/files/${fileId}/replace-url`)
      .set('Cookie', cookie)
      .send({ contentType: 'text/plain', declaredSizeBytes: 300 });
    expect(replace.status).toBe(200);

    // Simula abandono: a URL foi emitida mas o novo objeto nunca é
    // finalizado (nenhum POST /internal/storage-events). O ponteiro vivo
    // precisa continuar na versão original.
    const row = await withSystemBypass(pool, (client) =>
      client.query('SELECT object_path, pending_object_path FROM files WHERE id = $1', [fileId]),
    );
    expect(row.rows[0]?.object_path).toBe('unitA/replace-abandoned-old');
    expect(row.rows[0]?.pending_object_path).toBe(replace.body.objectPath);

    // A cota do dono não foi alterada (nada foi enviado de fato).
    const user = await withSystemBypass(pool, (client) =>
      client.query('SELECT storage_used_bytes FROM users WHERE id = $1', [ids.userA]),
    );
    expect(Number(user.rows[0]?.storage_used_bytes)).toBe(100);

    // E o arquivo vigente continua consultável: a view-url é emitida para o
    // objeto original, não para o path pendente inexistente.
    const viewUrl = await request(app).post(`/files/${fileId}/view-url`).set('Cookie', cookie);
    expect(viewUrl.status).toBe(200);
    expect(viewUrl.body.url).toContain('unitA/replace-abandoned-old');
  });

  it('substituição sem permissão é bloqueada e o arquivo vigente permanece intacto', async () => {
    const app = createApp(ports);
    const fileId = await createActiveFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/replace-2-old',
      fileName: 'contrato.txt',
      sizeBytes: 100,
    });

    const res = await request(app)
      .post(`/files/${fileId}/replace-url`)
      .set('Cookie', await sessionCookieFor(ports, userA2Id))
      .send({ contentType: 'text/plain', declaredSizeBytes: 50 });

    expect(res.status).toBe(403);

    const row = await withSystemBypass(pool, (client) =>
      client.query('SELECT object_path, status FROM files WHERE id = $1', [fileId]),
    );
    expect(row.rows[0]?.object_path).toBe('unitA/replace-2-old');
    expect(row.rows[0]?.status).toBe('active');
  });

  it('substituição respeita a cota pelo delta: bloqueia quando a nova versão estouraria a cota', async () => {
    const app = createApp(ports);
    const oldSize = 100;
    const fileId = await createActiveFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/replace-3-old',
      fileName: 'grande.bin',
      sizeBytes: oldSize,
    });
    const nearQuotaUsage = config.storageQuotaBytesPerUser - 50;
    await withSystemBypass(pool, (client) =>
      client.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [nearQuotaUsage, ids.userA]),
    );

    // uso atual - tamanho antigo + tamanho novo > cota
    const oversizedDeclaration = oldSize + 1000;
    const res = await request(app)
      .post(`/files/${fileId}/replace-url`)
      .set('Cookie', await sessionCookieFor(ports, ids.userA))
      .send({ contentType: 'application/octet-stream', declaredSizeBytes: oversizedDeclaration });

    expect(res.status).toBe(400);

    const row = await withSystemBypass(pool, (client) =>
      client.query('SELECT object_path, status FROM files WHERE id = $1', [fileId]),
    );
    expect(row.rows[0]?.object_path).toBe('unitA/replace-3-old');
    expect(row.rows[0]?.status).toBe('active');

    const user = await withSystemBypass(pool, (client) =>
      client.query('SELECT storage_used_bytes FROM users WHERE id = $1', [ids.userA]),
    );
    expect(Number(user.rows[0]?.storage_used_bytes)).toBe(nearQuotaUsage);
  });
});
