import { Pool, type PoolClient } from 'pg';
import { config } from '../config.js';
import { runMigrations } from '../db/migrate.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import type { Ports } from '../ports/index.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';

export async function setupTestDatabase() {
  const pool = new Pool({ connectionString: config.databaseUrl });
  await runMigrations(pool);
  await pool.query('TRUNCATE audit_events, files, users, units RESTART IDENTITY CASCADE');
  return { pool, database: new PgDatabasePort() };
}

/**
 * As tabelas de fundação têm FORCE ROW LEVEL SECURITY — até o dono das
 * tabelas é restringido pela policy. Setup de teste (como um seed real)
 * precisa rodar sob o papel global_admin, o mesmo bypass que qualquer
 * admin global usaria em produção.
 */
export async function withSystemBypass<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_role', 'global_admin', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Emite uma sessão válida para `userId` e devolve o par pronto para
 * `.set('Cookie', ...)` no supertest — substitui o antigo header
 * `x-gdoc-user-id` nos testes, agora que a identidade vem da sessão
 * autenticada (ver middleware/tenant-context.ts).
 */
export async function sessionCookieFor(ports: Ports, userId: string): Promise<string> {
  const token = await ports.auth.issueSession({ sub: userId });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

export async function seedTwoUnits(pool: Pool) {
  return withSystemBypass(pool, async (client) => {
    const { rows: units } = await client.query<{ id: string }>(
      `INSERT INTO units (name) VALUES ('Unidade A'), ('Unidade B') RETURNING id`,
    );
    const [unitA, unitB] = units;
    if (!unitA || !unitB) throw new Error('expected two units');

    const { rows: users } = await client.query<{ id: string; role: string }>(
      `INSERT INTO users (unit_id, email, password_hash, role) VALUES
         ($1, 'collab-a@test.dev', 'x', 'collaborator'),
         ($2, 'collab-b@test.dev', 'x', 'collaborator'),
         ($1, 'admin-global@test.dev', 'x', 'global_admin')
       RETURNING id, role`,
      [unitA.id, unitB.id],
    );

    return {
      unitA: unitA.id,
      unitB: unitB.id,
      userA: users[0]!.id,
      userB: users[1]!.id,
      globalAdmin: users[2]!.id,
    };
  });
}
