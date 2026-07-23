import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';

/**
 * Testes de `routes/units.ts` (change `gestao-de-unidades`, US 1.1/5.1).
 * Codificam os invariantes: só `global_admin` gerencia unidades; nome único;
 * desativar exige unidade vazia; própria unidade e bootstrap são protegidas;
 * reativar é sempre permitido (design.md D1/D2/D3/D6).
 */
describe('Gestão de unidades: POST/GET/PATCH /units', () => {
  let pool: Pool;
  let ports: Ports;
  let bootstrapUnit: string; // unidade mais antiga (do global_admin)
  let emptyUnit: string; // unidade sem pessoas
  let globalAdminId: string;
  let unitAdminId: string;
  let collaboratorId: string;

  async function seed() {
    // `bootstrapUnit` nasce numa transação PRÓPRIA e anterior, tendo assim o
    // menor `created_at` de forma determinística — replicando produção, onde o
    // bootstrap cria a primeira e única unidade sozinho, antes de qualquer
    // outra. (Numa única transação, `now()` seria idêntico para todas as
    // unidades e o desempate por id de uuid aleatório seria não-determinístico.)
    const boot = await withSystemBypass(pool, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO units (name) VALUES ('Administração') RETURNING id`,
      );
      return rows[0]!.id;
    });

    return withSystemBypass(pool, async (client) => {
      const { rows: emptyUnitRows } = await client.query<{ id: string }>(
        `INSERT INTO units (name) VALUES ('Unidade Vazia') RETURNING id`,
      );
      const empty = emptyUnitRows[0]!.id;

      const { rows: userRows } = await client.query<{ id: string; role: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role, full_name) VALUES
           ($1, 'global-admin@test.dev', 'x', 'global_admin', 'Global Admin'),
           ($1, 'unit-admin@test.dev', 'x', 'unit_admin', 'Unit Admin'),
           ($1, 'collab@test.dev', 'x', 'collaborator', 'Colaborador')
         RETURNING id, role`,
        [boot],
      );

      return {
        bootstrapUnit: boot,
        emptyUnit: empty,
        globalAdminId: userRows[0]!.id,
        unitAdminId: userRows[1]!.id,
        collaboratorId: userRows[2]!.id,
      };
    });
  }

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
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

  beforeEach(async () => {
    await pool.query('TRUNCATE audit_events, files, users, units RESTART IDENTITY CASCADE');
    const ids = await seed();
    bootstrapUnit = ids.bootstrapUnit;
    emptyUnit = ids.emptyUnit;
    globalAdminId = ids.globalAdminId;
    unitAdminId = ids.unitAdminId;
    collaboratorId = ids.collaboratorId;
  });

  // --- Autorização por papel (design.md D1) ---

  it('unit_admin recebe 403 em POST/GET/PATCH /units', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, unitAdminId);

    expect((await request(app).get('/units').set('Cookie', cookie)).status).toBe(403);
    expect(
      (await request(app).post('/units').set('Cookie', cookie).send({ name: 'X' })).status,
    ).toBe(403);
    expect(
      (await request(app).patch(`/units/${emptyUnit}`).set('Cookie', cookie).send({ name: 'Y' }))
        .status,
    ).toBe(403);
  });

  it('collaborator recebe 403 em qualquer rota de /units', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, collaboratorId);

    expect((await request(app).get('/units').set('Cookie', cookie)).status).toBe(403);
    expect(
      (await request(app).post('/units').set('Cookie', cookie).send({ name: 'X' })).status,
    ).toBe(403);
  });

  // --- Criar (design.md D6) ---

  it('global_admin cria unidade com status ativo', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/units')
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ name: 'Nova Unidade' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Nova Unidade');
    expect(res.body.status).toBe('active');
  });

  it('criar com nome já existente é recusado com 409', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/units')
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ name: 'Unidade Vazia' });

    expect(res.status).toBe(409);
  });

  it('criar sem nome é recusado com 400', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/units')
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ name: '   ' });

    expect(res.status).toBe(400);
  });

  // --- Listar (design.md D4/D7) ---

  it('GET /units lista todas as unidades para o global_admin', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .get('/units')
      .set('Cookie', await sessionCookieFor(ports, globalAdminId));

    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((u) => u.name);
    expect(names).toContain('Administração');
    expect(names).toContain('Unidade Vazia');
  });

  it('GET /units?status=active traz só as ativas (para o seletor)', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, globalAdminId);

    // desativa a unidade vazia
    await request(app).patch(`/units/${emptyUnit}`).set('Cookie', cookie).send({ status: 'desativado' });

    const res = await request(app).get('/units?status=active').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((u) => u.id);
    expect(ids).toContain(bootstrapUnit);
    expect(ids).not.toContain(emptyUnit);
  });

  // --- Renomear (design.md D6) ---

  it('renomear preserva id e aplica o novo nome', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .patch(`/units/${emptyUnit}`)
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ name: 'Vazia Renomeada' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(emptyUnit);
    expect(res.body.name).toBe('Vazia Renomeada');
  });

  it('renomear para nome já usado é recusado com 409', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .patch(`/units/${emptyUnit}`)
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ name: 'Administração' });

    expect(res.status).toBe(409);
  });

  // --- Desativar / reativar (design.md D2/D3) ---

  it('desativar unidade vazia é permitido', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .patch(`/units/${emptyUnit}`)
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ status: 'desativado' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('desativado');
  });

  it('desativar unidade com pessoas é recusado com 409 (unit not empty)', async () => {
    const app = createApp(ports);
    // adiciona uma pessoa à unidade vazia, tornando-a não-vazia
    await withSystemBypass(pool, (client) =>
      client.query(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, 'p@test.dev', 'x', 'collaborator')`,
        [emptyUnit],
      ),
    );

    const res = await request(app)
      .patch(`/units/${emptyUnit}`)
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ status: 'desativado' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('unit not empty');
  });

  it('desativar a própria unidade do global_admin é recusado', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .patch(`/units/${bootstrapUnit}`)
      .set('Cookie', await sessionCookieFor(ports, globalAdminId))
      .send({ status: 'desativado' });

    // bootstrapUnit é tanto a própria unidade do admin quanto a de bootstrap
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('cannot deactivate own or bootstrap unit');
  });

  it('desativar a unidade de bootstrap (mesmo vazia, por um admin de outra unidade) é recusado', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, globalAdminId);

    // cria uma segunda unidade e move o global_admin para ela, esvaziando a de
    // bootstrap — o guarda de bootstrap (D3) ainda deve recusar.
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(`INSERT INTO units (name) VALUES ('Outra') RETURNING id`),
    );
    const otherUnit = rows[0]!.id;
    await withSystemBypass(pool, (client) =>
      client.query('UPDATE users SET unit_id = $1 WHERE id = $2', [otherUnit, globalAdminId]),
    );
    // move também os demais usuários da bootstrap para esvaziá-la
    await withSystemBypass(pool, (client) =>
      client.query('UPDATE users SET unit_id = $1 WHERE unit_id = $2', [otherUnit, bootstrapUnit]),
    );

    const res = await request(app)
      .patch(`/units/${bootstrapUnit}`)
      .set('Cookie', cookie)
      .send({ status: 'desativado' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('cannot deactivate own or bootstrap unit');
  });

  it('reativar uma unidade desativada é sempre permitido', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, globalAdminId);

    await request(app).patch(`/units/${emptyUnit}`).set('Cookie', cookie).send({ status: 'desativado' });
    const res = await request(app)
      .patch(`/units/${emptyUnit}`)
      .set('Cookie', cookie)
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  // --- Cadastro de pessoa recusa unidade desativada (design.md D2/D7) ---

  it('POST /users em unidade desativada é recusado (fail-closed) sem criar conta', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, globalAdminId);

    // desativa a unidade vazia, depois tenta cadastrar nela
    await request(app).patch(`/units/${emptyUnit}`).set('Cookie', cookie).send({ status: 'desativado' });

    const res = await request(app)
      .post('/users')
      .set('Cookie', cookie)
      .send({
        fullName: 'Pessoa em Unidade Desativada',
        email: 'desativada@test.dev',
        password: 'initial-password',
        unitId: emptyUnit,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('unit is disabled');

    const { rows } = await withSystemBypass(pool, (client) =>
      client.query('SELECT count(*)::int AS c FROM users WHERE email = $1', ['desativada@test.dev']),
    );
    expect(rows[0]!.c).toBe(0);
  });
});
