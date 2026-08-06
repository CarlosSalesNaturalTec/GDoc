import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { InAppNotificationPort } from '../adapters/in-app-notification-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';

/**
 * Change `expiracao-permissoes`, capability `notificacoes` — leitura, marcação
 * de lida e isolamento por unidade/pessoa (design.md D4/D5, tasks.md 9.10).
 */
describe('routes/notifications.ts — caixa de notificações', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const secrets = new EnvSecretsPort();
    const database = new PgDatabasePort();
    ports = {
      database,
      notifications: new InAppNotificationPort(database),
      storage: new InMemoryStoragePort(),
      secrets,
      auth: new Argon2AuthPort(secrets),
    };

    // Notificações semeadas diretamente (bypass) para userA (unitA) e userB
    // (unitB) — o teste de isolamento não depende do job nem da rota de
    // concessão para existir.
    await withSystemBypass(pool, (client) =>
      client.query(
        `INSERT INTO notifications (unit_id, recipient_user_id, kind, payload, source_ref) VALUES
           ($1, $2, 'grant_created', '{"resourceType":"file","resourceId":"r1","permissions":["view"],"expiresAt":"2099-01-01T00:00:00.000Z"}', 'seed:a:1'),
           ($3, $4, 'grant_created', '{"resourceType":"file","resourceId":"r2","permissions":["view"],"expiresAt":"2099-01-01T00:00:00.000Z"}', 'seed:b:1')`,
        [ids.unitA, ids.userA, ids.unitB, ids.userB],
      ),
    );
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  it('pessoa vê apenas as próprias notificações; contagem de não lidas reflete só as suas', async () => {
    const app = createApp(ports);
    const cookieA = await sessionCookieFor(ports, ids.userA);

    const list = await request(app).get('/notifications').set('Cookie', cookieA);
    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0].payload.resourceId).toBe('r1');

    const count = await request(app).get('/notifications/unread-count').set('Cookie', cookieA);
    expect(count.status).toBe(200);
    expect(count.body.count).toBe(1);
  });

  it('notificação não atravessa unidade nem pessoa (userB não vê a notificação de userA)', async () => {
    const app = createApp(ports);
    const cookieB = await sessionCookieFor(ports, ids.userB);

    const list = await request(app).get('/notifications').set('Cookie', cookieB);
    expect(list.status).toBe(200);
    const resourceIds = list.body.notifications.map((n: { payload: { resourceId: string } }) => n.payload.resourceId);
    expect(resourceIds).not.toContain('r1');
  });

  it('global_admin não alcança notificações de outra unidade nem de outra pessoa', async () => {
    const app = createApp(ports);
    const cookieGlobalAdmin = await sessionCookieFor(ports, ids.globalAdmin);

    const list = await request(app).get('/notifications').set('Cookie', cookieGlobalAdmin);
    expect(list.status).toBe(200);
    // global_admin é da unitA (seedTwoUnits) mas isso não importa: a rota
    // filtra por recipient_user_id = ele mesmo, não por unit_id do bypass.
    const resourceIds = list.body.notifications.map((n: { payload: { resourceId: string } }) => n.payload.resourceId);
    expect(resourceIds).not.toContain('r1');
    expect(resourceIds).not.toContain('r2');
  });

  it('marcar como lida preserva a notificação e reduz a contagem de não lidas; é idempotente', async () => {
    const app = createApp(ports);
    const cookieA = await sessionCookieFor(ports, ids.userA);

    const before = await request(app).get('/notifications').set('Cookie', cookieA);
    const notificationId = before.body.notifications[0].id;
    expect(before.body.notifications[0].readAt).toBeNull();

    const markRead = await request(app).post(`/notifications/${notificationId}/read`).set('Cookie', cookieA);
    expect(markRead.status).toBe(204);

    const after = await request(app).get('/notifications').set('Cookie', cookieA);
    expect(after.body.notifications).toHaveLength(1);
    expect(after.body.notifications[0].readAt).not.toBeNull();

    const count = await request(app).get('/notifications/unread-count').set('Cookie', cookieA);
    expect(count.body.count).toBe(0);

    // Idempotente: marcar de novo não falha nem altera o resultado.
    const markAgain = await request(app).post(`/notifications/${notificationId}/read`).set('Cookie', cookieA);
    expect(markAgain.status).toBe(204);
  });

  it('marcar como lida notificação de outra pessoa falha (404), sem vazar existência', async () => {
    const app = createApp(ports);
    const cookieA = await sessionCookieFor(ports, ids.userA);

    const listB = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>('SELECT id FROM notifications WHERE recipient_user_id = $1', [ids.userB]),
    );
    const otherPersonNotificationId = listB.rows[0]!.id;

    const res = await request(app).post(`/notifications/${otherPersonNotificationId}/read`).set('Cookie', cookieA);
    expect(res.status).toBe(404);
  });
});
