import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import * as argon2 from 'argon2';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';

describe('Autenticação: /auth/login, /auth/logout, /auth/me', () => {
  let pool: Pool;
  let ports: Ports;
  let unitId: string;
  let activeUserId: string;
  let disabledUserId: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;

    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });

    const ids = await withSystemBypass(pool, async (client) => {
      const { rows: unitRows } = await client.query<{ id: string }>(
        `INSERT INTO units (name) VALUES ('Unidade Auth') RETURNING id`,
      );
      const unit = unitRows[0]!;

      const { rows: userRows } = await client.query<{ id: string; status: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role, full_name, status) VALUES
           ($1, 'ativo@test.dev', $2, 'collaborator', 'Pessoa Ativa', 'active'),
           ($1, 'desativado@test.dev', $2, 'collaborator', 'Pessoa Desativada', 'disabled')
         RETURNING id, status`,
        [unit.id, passwordHash],
      );

      return { unitId: unit.id, users: userRows };
    });

    unitId = ids.unitId;
    activeUserId = ids.users.find((u) => u.status === 'active')!.id;
    disabledUserId = ids.users.find((u) => u.status === 'disabled')!.id;

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

  it('login com credenciais corretas emite sessão (cookie HttpOnly)', async () => {
    const app = createApp(ports);
    const res = await request(app).post('/auth/login').send({ email: 'ativo@test.dev', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: activeUserId, unitId, role: 'collaborator' });

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c: string) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('e-mail inexistente é recusado com resposta genérica', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nao-existe@test.dev', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid credentials');
  });

  it('senha incorreta é recusada com a mesma resposta genérica', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ativo@test.dev', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid credentials');
  });

  it('conta desativada não autentica mesmo com credenciais corretas', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'desativado@test.dev', password: 'correct-password' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('GET /auth/me devolve id/unidade/papel sem senha nem hash', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/auth/me').set('Cookie', await sessionCookieFor(ports, activeUserId));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: activeUserId, unitId, role: 'collaborator' });
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('GET /auth/me sem sessão é rejeitado', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('sessão de conta desativada é recusada mesmo antes de expirar', async () => {
    const app = createApp(ports);
    const res = await request(app).get('/auth/me').set('Cookie', await sessionCookieFor(ports, disabledUserId));
    expect(res.status).toBe(401);
  });

  it('logout encerra a sessão: requisições seguintes são tratadas como não autenticadas', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, activeUserId);

    const meBefore = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(meBefore.status).toBe(200);

    const logout = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    const clearedCookie = logout.headers['set-cookie'];
    expect(clearedCookie).toBeDefined();
  });
});
