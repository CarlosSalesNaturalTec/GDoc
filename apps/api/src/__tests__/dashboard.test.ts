import { randomUUID } from 'node:crypto';
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
import type { DashboardResponse } from '@gdoc/shared';
import { config } from '../config.js';

/** Mesma lógica de `trailing12MonthKeys` da rota — usada só para gerar dados de teste determinísticos. */
function monthKey(offsetMonthsAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonthsAgo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTimestamp(offsetMonthsAgo: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonthsAgo, 15)).toISOString();
}

describe('Painel gerencial agregado de uso (Épico 8, US 8.2)', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;
  let unitAdminAId: string;

  interface InsertFileOptions {
    contentType: string | null;
    sizeBytes: number;
    status?: 'pending' | 'active' | 'over_quota';
    createdAt?: string;
    deleted?: boolean;
  }

  async function insertFile(unitId: string, ownerId: string, opts: InsertFileOptions): Promise<void> {
    await withSystemBypass(pool, (client) =>
      client.query(
        `INSERT INTO files (unit_id, owner_id, object_path, file_name, content_type, size_bytes, status, created_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), CASE WHEN $9 THEN now() ELSE NULL END)`,
        [
          unitId,
          ownerId,
          `dashboard-test/${randomUUID()}`,
          'dashboard-test-file',
          opts.contentType,
          opts.sizeBytes,
          opts.status ?? 'active',
          opts.createdAt ?? null,
          opts.deleted ?? false,
        ],
      ),
    );
  }

  async function setStorageUsed(userId: string, bytes: number): Promise<void> {
    await withSystemBypass(pool, (client) =>
      client.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [bytes, userId]),
    );
  }

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, 'unit-admin-a@dashboard.test', 'x', 'unit_admin')
         RETURNING id`,
        [ids.unitA],
      ),
    );
    unitAdminAId = rows[0]!.id;

    const secrets = new EnvSecretsPort();
    ports = {
      database: new PgDatabasePort(),
      storage: new InMemoryStoragePort(),
      secrets,
      auth: new Argon2AuthPort(secrets),
    };

    // Unit A — arquivos ativos contáveis (image, pdf, office, MIME desconhecido → other).
    await insertFile(ids.unitA, ids.userA, { contentType: 'image/png', sizeBytes: 1000, createdAt: monthTimestamp(0) });
    await insertFile(ids.unitA, ids.userA, { contentType: 'application/pdf', sizeBytes: 2000, createdAt: monthTimestamp(0) });
    await insertFile(ids.unitA, ids.userA, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 500,
      createdAt: monthTimestamp(2),
    });
    await insertFile(ids.unitA, ids.userA, {
      contentType: 'application/x-nonexistent-mime',
      sizeBytes: 300,
      createdAt: monthTimestamp(13), // fora da janela de 12 meses do gráfico, mas conta em filesByType/cards
    });
    // Itens que NÃO devem entrar em nenhuma métrica (task 4.5).
    await insertFile(ids.unitA, ids.userA, { contentType: 'text/csv', sizeBytes: 999_999, status: 'pending' });
    await insertFile(ids.unitA, ids.userA, { contentType: 'image/jpeg', sizeBytes: 999_999, status: 'over_quota' });
    await insertFile(ids.unitA, ids.userA, { contentType: 'video/mp4', sizeBytes: 999_999, deleted: true });

    // Unit B — categoria exclusiva (audio) para provar isolamento de unidade.
    await insertFile(ids.unitB, ids.userB, { contentType: 'audio/mpeg', sizeBytes: 700, createdAt: monthTimestamp(0) });
    await insertFile(ids.unitB, ids.userB, { contentType: 'image/png', sizeBytes: 1300, createdAt: monthTimestamp(0) });

    await setStorageUsed(ids.userA, 4000);
    await setStorageUsed(unitAdminAId, 1000);
    await setStorageUsed(ids.globalAdmin, 0);
    await setStorageUsed(ids.userB, 2500);
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  function findByCategory(response: DashboardResponse, category: string): number {
    return response.filesByType.find((e) => e.category === category)?.count ?? 0;
  }

  it('collaborator recebe 403 e nenhum agregado (task 4.4)', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, ids.userA));
    expect(res.status).toBe(403);
    expect(res.body.cards).toBeUndefined();
  });

  it('unit_admin vê agregados só da própria unidade, sem dados da outra (task 4.2)', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, unitAdminAId));
    expect(res.status).toBe(200);
    const body = res.body as DashboardResponse;

    // 4 arquivos vivos e efetivos em A (pending/over_quota/lixeira excluídos — task 4.5).
    expect(body.cards.totalFiles).toBe(4);
    expect(findByCategory(body, 'image')).toBe(1);
    expect(findByCategory(body, 'pdf')).toBe(1);
    expect(findByCategory(body, 'office')).toBe(1);
    expect(findByCategory(body, 'other')).toBe(1);
    expect(findByCategory(body, 'audio')).toBe(0); // exclusivo da unidade B

    // Pessoas de A: userA, o admin global seedado em A e o novo unit_admin.
    expect(body.storage.userCount).toBe(3);
    expect(body.storage.usedBytes).toBe(4000 + 0 + 1000);
    expect(body.cards.totalPeople).toBe(3);
    expect(body.cards.usedBytes).toBe(5000);
  });

  it('global_admin vê o consolidado das duas unidades (task 4.3)', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, ids.globalAdmin));
    expect(res.status).toBe(200);
    const body = res.body as DashboardResponse;

    expect(body.cards.totalFiles).toBe(6);
    expect(findByCategory(body, 'image')).toBe(2);
    expect(findByCategory(body, 'pdf')).toBe(1);
    expect(findByCategory(body, 'office')).toBe(1);
    expect(findByCategory(body, 'audio')).toBe(1);
    expect(findByCategory(body, 'other')).toBe(1);

    expect(body.storage.userCount).toBe(4);
    expect(body.storage.usedBytes).toBe(7500);
  });

  it('filesByType categoriza corretamente, incluindo MIME desconhecido → other (task 4.6)', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, unitAdminAId));
    const body = res.body as DashboardResponse;
    expect(findByCategory(body, 'other')).toBe(1);
    expect(findByCategory(body, 'image')).toBe(1);
    expect(findByCategory(body, 'pdf')).toBe(1);
    expect(findByCategory(body, 'office')).toBe(1);
  });

  it('uploadsByMonth tem 12 entradas com zero-fill e ordem cronológica (task 4.7)', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, unitAdminAId));
    const body = res.body as DashboardResponse;

    expect(body.uploadsByMonth).toHaveLength(12);
    const months = body.uploadsByMonth.map((e) => e.month);
    const sorted = [...months].sort();
    expect(months).toEqual(sorted);
    expect(months[11]).toBe(monthKey(0));

    const byMonth = new Map(body.uploadsByMonth.map((e) => [e.month, e.count]));
    expect(byMonth.get(monthKey(0))).toBe(2); // fileA1 + fileA2
    expect(byMonth.get(monthKey(2))).toBe(1); // fileA3
    // fileA4 (13 meses atrás) não entra na série de 12 meses.
    const totalInSeries = body.uploadsByMonth.reduce((sum, e) => sum + e.count, 0);
    expect(totalInSeries).toBe(3);
  });

  it('storage calcula usedBytes/capacityBytes/availableBytes a partir de storage_used_bytes e da cota (task 4.8)', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, unitAdminAId));
    const body = res.body as DashboardResponse;

    const expectedCapacity = config.storageQuotaBytesPerUser * 3;
    expect(body.storage.quotaBytesPerUser).toBe(config.storageQuotaBytesPerUser);
    expect(body.storage.capacityBytes).toBe(expectedCapacity);
    expect(body.storage.availableBytes).toBe(expectedCapacity - 5000);
    expect(body.cards.quotaUsedPct).toBeCloseTo(5000 / expectedCapacity, 10);
  });

  it('capacidade zero (nenhuma pessoa/cota no alcance) não gera erro de divisão — capacidade e % zero (spec "Alcance sem pessoas")', async () => {
    const originalQuota = config.storageQuotaBytesPerUser;
    // O alcance sempre inclui o próprio solicitante (nunca há zero pessoas de
    // fato em uma chamada autenticada); zerar a cota reproduz o mesmo estado
    // de guarda (capacityBytes = 0) que o cenário do spec descreve.
    config.storageQuotaBytesPerUser = 0;
    try {
      const app = createApp(ports);
      const res = await request(app).get('/dashboard').set('Cookie', await sessionCookieFor(ports, unitAdminAId));
      expect(res.status).toBe(200);
      const body = res.body as DashboardResponse;
      expect(body.storage.capacityBytes).toBe(0);
      expect(body.storage.availableBytes).toBe(0);
      expect(body.cards.quotaUsedPct).toBe(0);
      expect(Number.isFinite(body.cards.quotaUsedPct)).toBe(true);
    } finally {
      config.storageQuotaBytesPerUser = originalQuota;
    }
  });
});
