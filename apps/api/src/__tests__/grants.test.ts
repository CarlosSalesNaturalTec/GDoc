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

describe('Endpoints de gestão de permissão (routes/grants.ts, admin-only)', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;
  let unitAdminAId: string;
  let unitAdminBId: string;
  let userA2Id: string;
  let fileAId: string;
  let folderBId: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const { rows: users } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES
           ($1, 'unit-admin-a@test.dev', 'x', 'unit_admin'),
           ($2, 'unit-admin-b@test.dev', 'x', 'unit_admin'),
           ($1, 'collab-a2@test.dev', 'x', 'collaborator')
         RETURNING id`,
        [ids.unitA, ids.unitB],
      ),
    );
    [unitAdminAId, unitAdminBId, userA2Id] = users.map((u) => u.id) as [string, string, string];

    const { rows: files } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO files (unit_id, owner_id, object_path, file_name, status)
         VALUES ($1, $2, 'unitA/f1', 'a.txt', 'active') RETURNING id`,
        [ids.unitA, ids.userA],
      ),
    );
    fileAId = files[0]!.id;

    const { rows: folders } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO folders (unit_id, owner_id, name) VALUES ($1, $2, 'Pasta B') RETURNING id`,
        [ids.unitB, ids.userB],
      ),
    );
    folderBId = folders[0]!.id;

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

  it('collaborator recebe 403 ao conceder, listar ou revogar', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);

    const create = await request(app)
      .post('/grants')
      .set('Cookie', cookie)
      .send({ subjectUserId: userA2Id, resourceType: 'file', resourceId: fileAId, permissions: ['view'] });
    expect(create.status).toBe(403);

    const list = await request(app)
      .get(`/grants?resourceType=file&resourceId=${fileAId}`)
      .set('Cookie', cookie);
    expect(list.status).toBe(403);

    const del = await request(app).delete('/grants/00000000-0000-0000-0000-000000000000').set('Cookie', cookie);
    expect(del.status).toBe(403);
  });

  it('admin concede múltiplos verbos numa chamada, idempotente ao reconceder', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, unitAdminAId);

    const first = await request(app)
      .post('/grants')
      .set('Cookie', cookie)
      .send({ subjectUserId: userA2Id, resourceType: 'file', resourceId: fileAId, permissions: ['view', 'download'] });
    expect(first.status).toBe(201);
    expect(first.body.grants).toHaveLength(2);

    const second = await request(app)
      .post('/grants')
      .set('Cookie', cookie)
      .send({ subjectUserId: userA2Id, resourceType: 'file', resourceId: fileAId, permissions: ['view'] });
    expect(second.status).toBe(201);
    expect(second.body.grants).toHaveLength(1);

    const rows = await withSystemBypass(pool, (client) =>
      client.query('SELECT permission FROM grants WHERE subject_user_id = $1 AND resource_id = $2', [
        userA2Id,
        fileAId,
      ]),
    );
    expect(rows.rows).toHaveLength(2);
  });

  it('admin lista as concessões do recurso e revoga apenas o verbo indicado', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, unitAdminAId);

    const list = await request(app).get(`/grants?resourceType=file&resourceId=${fileAId}`).set('Cookie', cookie);
    expect(list.status).toBe(200);
    const permissions = list.body.grants.map((g: { permission: string }) => g.permission).sort();
    expect(permissions).toEqual(['download', 'view']);

    const viewGrant = list.body.grants.find((g: { permission: string }) => g.permission === 'view');
    const del = await request(app).delete(`/grants/${viewGrant.id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);

    const after = await request(app).get(`/grants?resourceType=file&resourceId=${fileAId}`).set('Cookie', cookie);
    expect(after.body.grants.map((g: { permission: string }) => g.permission)).toEqual(['download']);
  });

  it('unit_admin não concede sobre recurso de outra unidade, sem vazar existência', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, unitAdminAId);

    const create = await request(app)
      .post('/grants')
      .set('Cookie', cookie)
      .send({ subjectUserId: userA2Id, resourceType: 'folder', resourceId: folderBId, permissions: ['view'] });
    expect(create.status).toBe(404);

    const created = await withSystemBypass(pool, (client) =>
      client.query('SELECT 1 FROM grants WHERE resource_id = $1', [folderBId]),
    );
    expect(created.rows).toHaveLength(0);
  });

  it('unit_admin não concede a pessoa de outra unidade', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, unitAdminAId);

    const create = await request(app)
      .post('/grants')
      .set('Cookie', cookie)
      .send({ subjectUserId: ids.userB, resourceType: 'file', resourceId: fileAId, permissions: ['view'] });
    expect(create.status).toBe(404);
  });

  it('RLS: unit_admin de uma unidade não enxerga grant de outra unidade, mesmo pedindo o mesmo recurso', async () => {
    const app = createApp(ports);
    const cookieB = await sessionCookieFor(ports, unitAdminBId);

    const list = await request(app).get(`/grants?resourceType=file&resourceId=${fileAId}`).set('Cookie', cookieB);
    expect(list.status).toBe(200);
    expect(list.body.grants).toEqual([]);
  });
});
