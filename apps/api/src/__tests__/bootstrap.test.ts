import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { config } from '../config.js';
import { setupTestDatabase, withSystemBypass } from './test-db.js';
import { bootstrapAdmin } from '../db/bootstrap.js';
import { seedIfEmpty } from '../db/seed.js';

/**
 * `users`/`units` têm FORCE ROW LEVEL SECURITY — uma query solta em `pool`
 * fora de uma transação com `SET LOCAL app.user_role` não enxerga nenhuma
 * linha (fail-closed), então toda leitura de verificação passa por
 * `withSystemBypass` (mesmo bypass que um admin global usaria).
 */
async function countUsers(pool: Pool): Promise<number> {
  return withSystemBypass(pool, async (client) => {
    const { rows } = await client.query<{ count: string }>('SELECT count(*)::text FROM users');
    return Number(rows[0]?.count ?? '0');
  });
}

/**
 * Change bootstrap-admin-producao — cobre as tarefas 3.1-3.5 do tasks.md:
 * fail-closed sem credenciais, recusa da senha de dev, criação exclusiva do
 * global_admin em banco vazio, idempotência, e a trava de produção no seed
 * de desenvolvimento (design.md D3-D5).
 */
describe('bootstrap de produção (bootstrap.ts)', () => {
  let pool: Pool;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE audit_events, files, users, units RESTART IDENTITY CASCADE');
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.BOOTSTRAP_ADMIN_UNIT;
    delete process.env.BOOTSTRAP_ADMIN_NAME;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('3.1 falha quando faltam BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD e não escreve nada', async () => {
    await expect(bootstrapAdmin(pool)).rejects.toThrow(/BOOTSTRAP_ADMIN_EMAIL/);

    expect(await countUsers(pool)).toBe(0);
  });

  it('3.2 recusa a senha padrão de desenvolvimento e não escreve nada', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@producao.dev';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'dev-password-only';

    await expect(bootstrapAdmin(pool)).rejects.toThrow(/senha padrão de desenvolvimento/);

    expect(await countUsers(pool)).toBe(0);
  });

  it('3.3 banco vazio cria exatamente um global_admin na unidade informada, sem dados de demonstração', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@producao.dev';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'uma-senha-bem-forte';
    process.env.BOOTSTRAP_ADMIN_UNIT = 'Unidade Bootstrap';

    const created = await bootstrapAdmin(pool);
    expect(created).toBe(true);

    const { users, units } = await withSystemBypass(pool, async (client) => {
      const { rows: users } = await client.query<{ email: string; role: string }>(
        'SELECT email, role FROM users',
      );
      const { rows: units } = await client.query<{ name: string }>('SELECT name FROM units');
      return { users, units };
    });

    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('admin@producao.dev');
    expect(users[0]?.role).toBe('global_admin');

    expect(units).toHaveLength(1);
    expect(units[0]?.name).toBe('Unidade Bootstrap');
  });

  it('3.4 idempotência: reexecutar com um global_admin presente é no-op', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@producao.dev';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'uma-senha-bem-forte';

    expect(await bootstrapAdmin(pool)).toBe(true);

    // Segunda execução com um e-mail diferente: se não fosse no-op, criaria
    // um segundo usuário (ou colidiria) — a asserção de contagem == 1 prova
    // que nada foi alterado.
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'outro-admin@producao.dev';
    const secondRun = await bootstrapAdmin(pool);
    expect(secondRun).toBe(false);

    const users = await withSystemBypass(pool, (client) =>
      client.query<{ email: string }>('SELECT email FROM users').then((r) => r.rows),
    );
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('admin@producao.dev');
  });
});

describe('trava de produção no seed de dev (seed.ts)', () => {
  let pool: Pool;
  const originalNodeEnv = config.nodeEnv;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE audit_events, files, users, units RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    config.nodeEnv = originalNodeEnv;
    await pool.end();
  });

  it('3.5a aborta em produção e não cria nenhuma unidade ou usuário de demonstração', async () => {
    config.nodeEnv = 'production';
    try {
      await expect(seedIfEmpty(pool)).rejects.toThrow(/produção/);

      expect(await countUsers(pool)).toBe(0);
    } finally {
      config.nodeEnv = originalNodeEnv;
    }
  });

  it('3.5b fora de produção mantém o comportamento atual (cria o dataset de exemplo em banco vazio)', async () => {
    config.nodeEnv = 'development';
    try {
      const seeded = await seedIfEmpty(pool);
      expect(seeded).toBe(true);

      expect(await countUsers(pool)).toBeGreaterThan(0);
    } finally {
      config.nodeEnv = originalNodeEnv;
    }
  });
});
