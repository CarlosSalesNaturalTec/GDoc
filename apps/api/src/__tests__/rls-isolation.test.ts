import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import type { PgDatabasePort } from '../adapters/pg-database-port.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass } from './test-db.js';

describe('RLS: isolamento por unidade', () => {
  let pool: Pool;
  let database: PgDatabasePort;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    database = setup.database;
    ids = await seedTwoUnits(pool);

    // um arquivo em cada unidade
    await withSystemBypass(pool, (client) =>
      client.query(
        `INSERT INTO files (unit_id, owner_id, object_path, file_name, status)
         VALUES ($1, $2, 'unitA/f1', 'a.txt', 'active'), ($3, $4, 'unitB/f1', 'b.txt', 'active')`,
        [ids.unitA, ids.userA, ids.unitB, ids.userB],
      ),
    );
  });

  afterAll(async () => {
    await database.close();
    await pool.end();
  });

  it('usuário da unidade A não enxerga arquivos da unidade B', async () => {
    const rows = await database.withTenantTransaction(
      { unitId: ids.unitA, userId: ids.userA, role: 'collaborator' },
      (client) => client.query('SELECT object_path FROM files').then((r) => r.rows),
    );
    expect(rows.map((r) => r.object_path)).toEqual(['unitA/f1']);
  });

  it('usuário da unidade B não enxerga arquivos da unidade A', async () => {
    const rows = await database.withTenantTransaction(
      { unitId: ids.unitB, userId: ids.userB, role: 'collaborator' },
      (client) => client.query('SELECT object_path FROM files').then((r) => r.rows),
    );
    expect(rows.map((r) => r.object_path)).toEqual(['unitB/f1']);
  });

  it('sem contexto de tenant nenhuma linha é retornada (fail-closed)', async () => {
    const rows = await database.withTransaction((client) =>
      client.query('SELECT object_path FROM files').then((r) => r.rows),
    );
    expect(rows).toEqual([]);
  });

  it('admin global agrega todas as unidades', async () => {
    const rows = await database.withTenantTransaction(
      { unitId: ids.unitA, userId: ids.globalAdmin, role: 'global_admin' },
      (client) => client.query('SELECT object_path FROM files ORDER BY object_path').then((r) => r.rows),
    );
    expect(rows.map((r) => r.object_path)).toEqual(['unitA/f1', 'unitB/f1']);
  });
});
