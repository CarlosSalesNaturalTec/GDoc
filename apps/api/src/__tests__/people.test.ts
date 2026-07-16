import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import * as argon2 from 'argon2';
import { UserRole } from '@gdoc/shared';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';

describe('Gestão de pessoas: POST/GET/PATCH /users', () => {
  let pool: Pool;
  let ports: Ports;
  let unitA: string;
  let unitB: string;
  let globalAdminId: string;
  let unitAdminAId: string;
  let unitAdminBId: string;
  let collaboratorAId: string;
  let collaboratorA2Id: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;

    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });

    const ids = await withSystemBypass(pool, async (client) => {
      const { rows: unitRows } = await client.query<{ id: string }>(
        `INSERT INTO units (name) VALUES ('Unidade A'), ('Unidade B') RETURNING id`,
      );
      const [uA, uB] = unitRows;

      const { rows: userRows } = await client.query<{ id: string; role: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role, full_name) VALUES
           ($1, 'global-admin@test.dev', $3, 'global_admin', 'Global Admin'),
           ($1, 'unit-admin-a@test.dev', $3, 'unit_admin', 'Admin A'),
           ($2, 'unit-admin-b@test.dev', $3, 'unit_admin', 'Admin B'),
           ($1, 'collab-a@test.dev', $3, 'collaborator', 'Colaborador A'),
           ($1, 'collab-a2@test.dev', $3, 'collaborator', 'Colaborador A2')
         RETURNING id, role`,
        [uA!.id, uB!.id, passwordHash],
      );

      return { unitA: uA!.id, unitB: uB!.id, users: userRows };
    });

    unitA = ids.unitA;
    unitB = ids.unitB;
    globalAdminId = ids.users[0]!.id;
    unitAdminAId = ids.users[1]!.id;
    unitAdminBId = ids.users[2]!.id;
    collaboratorAId = ids.users[3]!.id;
    collaboratorA2Id = ids.users[4]!.id;

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

  it('admin cadastra pessoa com e-mail ainda não utilizado: conta fica apta a login', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/users')
      .set('Cookie', await sessionCookieFor(ports, unitAdminAId))
      .send({
        fullName: 'Nova Pessoa',
        email: 'nova-pessoa@test.dev',
        password: 'initial-password',
        phone: '+55 11 90000-0000',
        jobTitle: 'Analista',
        workArea: 'Financeiro',
        notes: 'observação',
      });

    expect(res.status).toBe(201);
    expect(res.body.unitId).toBe(unitA);
    expect(res.body.email).toBe('nova-pessoa@test.dev');
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'nova-pessoa@test.dev', password: 'initial-password' });
    expect(login.status).toBe(200);
  });

  it('e-mail duplicado é recusado sem criar conta', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/users')
      .set('Cookie', await sessionCookieFor(ports, unitAdminAId))
      .send({ fullName: 'Duplicado', email: 'collab-a@test.dev', password: 'whatever-password' });

    expect(res.status).toBe(409);
  });

  it('collaborator não pode cadastrar pessoas', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/users')
      .set('Cookie', await sessionCookieFor(ports, collaboratorAId))
      .send({ fullName: 'X', email: 'x@test.dev', password: 'whatever-password' });

    expect(res.status).toBe(403);
  });

  it('unit_admin que tenta criar em outra unidade é forçado à própria unidade', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/users')
      .set('Cookie', await sessionCookieFor(ports, unitAdminAId))
      .send({ fullName: 'Cross Unit', email: 'cross-unit@test.dev', password: 'whatever-password', unitId: unitB });

    expect(res.status).toBe(201);
    expect(res.body.unitId).toBe(unitA);
  });

  it('unit_admin não pode criar pessoa com papel global_admin', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/users')
      .set('Cookie', await sessionCookieFor(ports, unitAdminAId))
      .send({
        fullName: 'Tentativa Elevação',
        email: 'elevacao@test.dev',
        password: 'whatever-password',
        role: UserRole.GLOBAL_ADMIN,
      });

    expect(res.status).toBe(403);
  });

  it('unit_admin lista apenas pessoas da própria unidade', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/users').set('Cookie', await sessionCookieFor(ports, unitAdminAId));

    expect(res.status).toBe(200);
    expect(res.body.every((p: { unitId: string }) => p.unitId === unitA)).toBe(true);
    expect(res.body.some((p: { unitId: string }) => p.unitId === unitB)).toBe(false);
  });

  it('global_admin agrega pessoas de todas as unidades', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/users').set('Cookie', await sessionCookieFor(ports, globalAdminId));

    expect(res.status).toBe(200);
    expect(res.body.some((p: { unitId: string }) => p.unitId === unitA)).toBe(true);
    expect(res.body.some((p: { unitId: string }) => p.unitId === unitB)).toBe(true);
  });

  it('collaborator recebe 403 em GET /users', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/users').set('Cookie', await sessionCookieFor(ports, collaboratorAId));
    expect(res.status).toBe(403);
  });

  it('desativação impede novo login preservando os dados da pessoa', async () => {
    const app = createApp(ports);
    const patch = await request(app)
      .patch(`/users/${collaboratorAId}`)
      .set('Cookie', await sessionCookieFor(ports, unitAdminAId))
      .send({ status: 'disabled' });

    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('disabled');
    expect(patch.body.fullName).toBe('Colaborador A');

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'collab-a@test.dev', password: 'correct-password' });
    expect(login.status).toBe(403);
  });

  it('unit_admin não pode editar pessoa de outra unidade', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .patch(`/users/${unitAdminBId}`)
      .set('Cookie', await sessionCookieFor(ports, unitAdminAId))
      .send({ fullName: 'Tentativa de edição' });

    expect(res.status).toBe(403);

    const unchanged = await withSystemBypass(pool, (client) =>
      client.query('SELECT full_name FROM users WHERE id = $1', [unitAdminBId]),
    );
    expect(unchanged.rows[0]?.full_name).toBe('Admin B');
  });

  it('collaborator recebe 403 em PATCH /users/:id', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .patch(`/users/${unitAdminAId}`)
      .set('Cookie', await sessionCookieFor(ports, collaboratorA2Id))
      .send({ fullName: 'Não deveria funcionar' });

    expect(res.status).toBe(403);
  });
});
