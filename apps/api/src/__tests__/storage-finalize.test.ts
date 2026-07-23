import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass } from './test-db.js';
import { runBackfill } from '../jobs/backfill-pending-finalize.js';
import type { Ports } from '../ports/index.js';

/** Envelope de push do Pub/Sub com o metadata do GCS (JSON_API_V1) em base64. */
function gcsPushEnvelope(meta: { name: string; size: number; bucket?: string }) {
  const data = Buffer.from(
    JSON.stringify({
      name: meta.name,
      size: String(meta.size),
      bucket: meta.bucket ?? 'test-bucket',
    }),
  ).toString('base64');
  return { message: { data, messageId: 'm1' }, subscription: 'sub' };
}

async function usageOf(pool: Pool, userId: string): Promise<number> {
  const { rows } = await withSystemBypass(pool, (client) =>
    client.query<{ storage_used_bytes: string }>(
      'SELECT storage_used_bytes FROM users WHERE id = $1',
      [userId],
    ),
  );
  return Number(rows[0]?.storage_used_bytes ?? '0');
}

async function setUsage(pool: Pool, userId: string, bytes: number): Promise<void> {
  await withSystemBypass(pool, (client) =>
    client.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [bytes, userId]),
  );
}

async function insertFile(
  pool: Pool,
  opts: {
    unitId: string;
    ownerId: string;
    objectPath: string;
    pendingObjectPath?: string | null;
    fileName: string;
    sizeBytes?: number | null;
    status: string;
  },
): Promise<string> {
  const { rows } = await withSystemBypass(pool, (client) =>
    client.query<{ id: string }>(
      `INSERT INTO files (unit_id, owner_id, object_path, pending_object_path, file_name, content_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, 'text/plain', $6, $7) RETURNING id`,
      [
        opts.unitId,
        opts.ownerId,
        opts.objectPath,
        opts.pendingObjectPath ?? null,
        opts.fileName,
        opts.sizeBytes ?? null,
        opts.status,
      ],
    ),
  );
  return rows[0]!.id;
}

async function statusOf(pool: Pool, fileId: string) {
  const { rows } = await withSystemBypass(pool, (client) =>
    client.query<{ status: string; size_bytes: string | null; object_path: string; pending_object_path: string | null }>(
      'SELECT status, size_bytes, object_path, pending_object_path FROM files WHERE id = $1',
      [fileId],
    ),
  );
  return rows[0]!;
}

describe('Finalize pós-upload (Pub/Sub push + OIDC + backfill)', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);
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

  // --- 4.1: envelope de produção reconcilia e promove -----------------------

  it('envelope do Pub/Sub (upload novo) promove pending → active e soma a cota', async () => {
    const app = createApp(ports);
    await setUsage(pool, ids.userA, 0);
    const fileId = await insertFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/pubsub-new-1',
      fileName: 'novo.txt',
      status: 'pending',
    });

    const res = await request(app)
      .post('/internal/storage-events')
      .send(gcsPushEnvelope({ name: 'unitA/pubsub-new-1', size: 4096 }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');

    const file = await statusOf(pool, fileId);
    expect(file.status).toBe('active');
    expect(Number(file.size_bytes)).toBe(4096);
    expect(await usageOf(pool, ids.userA)).toBe(4096);
  });

  it('envelope do Pub/Sub (substituição) promove replacing → active sem contar em dobro', async () => {
    const app = createApp(ports);
    await setUsage(pool, ids.userA, 100);
    const fileId = await insertFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/repl-old',
      pendingObjectPath: 'unitA/repl-new',
      fileName: 'relatorio.txt',
      sizeBytes: 100,
      status: 'replacing',
    });

    const res = await request(app)
      .post('/internal/storage-events')
      .send(gcsPushEnvelope({ name: 'unitA/repl-new', size: 250 }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');

    const file = await statusOf(pool, fileId);
    expect(file.status).toBe('active');
    expect(file.object_path).toBe('unitA/repl-new');
    expect(file.pending_object_path).toBeNull();
    expect(Number(file.size_bytes)).toBe(250);
    // 100 - 100 (antiga) + 250 (nova) = 250.
    expect(await usageOf(pool, ids.userA)).toBe(250);

    const audit = await withSystemBypass(pool, (client) =>
      client.query('SELECT action FROM audit_events WHERE file_id = $1', [fileId]),
    );
    expect(audit.rows).toEqual([{ action: 'replace' }]);
  });

  // --- 4.4: payload simplificado de dev continua funcionando -----------------

  it('payload simplificado (dev/E2E) continua promovendo pending → active', async () => {
    const app = createApp(ports);
    await setUsage(pool, ids.userA, 0);
    const fileId = await insertFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/simple-1',
      fileName: 'simples.txt',
      status: 'pending',
    });

    const res = await request(app)
      .post('/internal/storage-events')
      .send({ bucket: 'test-bucket', objectPath: 'unitA/simple-1', sizeBytes: 512 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    const file = await statusOf(pool, fileId);
    expect(file.status).toBe('active');
    expect(Number(file.size_bytes)).toBe(512);
  });

  it('payload realmente inválido continua retornando 400', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/internal/storage-events')
      .send({ bucket: 'test-bucket' }); // sem objectPath/sizeBytes
    expect(res.status).toBe(400);

    const envelopeInvalido = await request(app)
      .post('/internal/storage-events')
      .send({ message: { data: 'nao-e-base64-json-valido!!!' } });
    expect(envelopeInvalido.status).toBe(400);
  });

  // --- 4.3: objeto desconhecido é reconhecido (2xx), sem reprocessar ---------

  it('objeto desconhecido responde 2xx (ack) sem alterar cota/status', async () => {
    const app = createApp(ports);
    await setUsage(pool, ids.userA, 42);

    const res = await request(app)
      .post('/internal/storage-events')
      .send(gcsPushEnvelope({ name: 'unitA/nao-existe', size: 999 }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
    expect(await usageOf(pool, ids.userA)).toBe(42);
  });

  // --- 4.2: autenticação OIDC (validação ligada) ----------------------------

  it('com validação ligada: sem token → 401 e nenhum efeito no banco', async () => {
    const app = createApp(ports, {
      storageEvents: { validationEnabled: true, verifyOidc: async (t) => t === 'good-token' },
    });
    await setUsage(pool, ids.userA, 0);
    const fileId = await insertFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/oidc-1',
      fileName: 'protegido.txt',
      status: 'pending',
    });

    const res = await request(app)
      .post('/internal/storage-events')
      .send(gcsPushEnvelope({ name: 'unitA/oidc-1', size: 300 }));

    expect(res.status).toBe(401);
    const file = await statusOf(pool, fileId);
    expect(file.status).toBe('pending');
    expect(file.size_bytes).toBeNull();
    expect(await usageOf(pool, ids.userA)).toBe(0);
  });

  it('com validação ligada: token inválido → 401', async () => {
    const app = createApp(ports, {
      storageEvents: { validationEnabled: true, verifyOidc: async (t) => t === 'good-token' },
    });
    const res = await request(app)
      .post('/internal/storage-events')
      .set('Authorization', 'Bearer token-errado')
      .send(gcsPushEnvelope({ name: 'unitA/oidc-1', size: 300 }));
    expect(res.status).toBe(401);
  });

  it('com validação ligada: token válido → reconcilia (200 active)', async () => {
    const app = createApp(ports, {
      storageEvents: { validationEnabled: true, verifyOidc: async (t) => t === 'good-token' },
    });
    await setUsage(pool, ids.userA, 0);
    const fileId = await insertFile(pool, {
      unitId: ids.unitA,
      ownerId: ids.userA,
      objectPath: 'unitA/oidc-ok',
      fileName: 'ok.txt',
      status: 'pending',
    });

    const res = await request(app)
      .post('/internal/storage-events')
      .set('Authorization', 'Bearer good-token')
      .send(gcsPushEnvelope({ name: 'unitA/oidc-ok', size: 128 }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect((await statusOf(pool, fileId)).status).toBe('active');
  });

  // --- 5.1: backfill dos registros presos -----------------------------------

  it('backfill promove pendente cujo objeto existe no storage e ignora o ausente', async () => {
    const storage = ports.storage as InMemoryStoragePort;
    await setUsage(pool, ids.userB, 0);

    const finalizado = await insertFile(pool, {
      unitId: ids.unitB,
      ownerId: ids.userB,
      objectPath: 'unitB/bf-finalizado',
      fileName: 'bf-ok.txt',
      status: 'pending',
    });
    const semObjeto = await insertFile(pool, {
      unitId: ids.unitB,
      ownerId: ids.userB,
      objectPath: 'unitB/bf-sem-objeto',
      fileName: 'bf-miss.txt',
      status: 'pending',
    });
    // Só o primeiro tem bytes de fato no bucket.
    storage.setObject('unitB/bf-finalizado', 2048);

    const summary = await runBackfill(ports);
    expect(summary.reconciled).toBeGreaterThanOrEqual(1);

    const ok = await statusOf(pool, finalizado);
    expect(ok.status).toBe('active');
    expect(Number(ok.size_bytes)).toBe(2048);

    const miss = await statusOf(pool, semObjeto);
    expect(miss.status).toBe('pending');
  });
});
