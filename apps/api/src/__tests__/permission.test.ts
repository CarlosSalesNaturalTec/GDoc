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

describe('Endpoints de URL assinada: checagem de permissão', () => {
  let pool: Pool;
  let ports: Ports;
  let storage: InMemoryStoragePort;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;
  let fileAId: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO files (unit_id, owner_id, object_path, file_name, status)
         VALUES ($1, $2, 'unitA/f1', 'a.txt', 'active') RETURNING id`,
        [ids.unitA, ids.userA],
      ),
    );
    fileAId = rows[0]!.id;

    storage = new InMemoryStoragePort();
    const secrets = new EnvSecretsPort();
    ports = {
      database: new PgDatabasePort(),
      storage,
      secrets,
      auth: new Argon2AuthPort(secrets),
    };
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  it('usuário sem permissão não recebe URL nem gera auditoria', async () => {
    const app = createApp(ports);

    const res = await request(app)
      .post(`/files/${fileAId}/view-url`)
      .set('Cookie', await sessionCookieFor(ports, ids.userB)); // userB é de outra unidade

    expect(res.status).toBe(403);
    expect(storage.calls).toHaveLength(0);

    const audit = await withSystemBypass(pool, (client) =>
      client.query('SELECT * FROM audit_events WHERE file_id = $1', [fileAId]),
    );
    expect(audit.rows).toHaveLength(0);
  });

  it('usuário com permissão recebe URL de visualização e gera auditoria "view"', async () => {
    const app = createApp(ports);

    const res = await request(app)
      .post(`/files/${fileAId}/view-url`)
      .set('Cookie', await sessionCookieFor(ports, ids.userA));

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('view');
    expect(storage.calls).toEqual([{ method: 'view', objectPath: 'unitA/f1' }]);

    const audit = await withSystemBypass(pool, (client) =>
      client.query('SELECT action FROM audit_events WHERE file_id = $1', [fileAId]),
    );
    expect(audit.rows).toEqual([{ action: 'view' }]);
  });
});
