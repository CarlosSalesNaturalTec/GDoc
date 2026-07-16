import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations(pool?: Pool): Promise<string[]> {
  const ownedPool = pool ?? new Pool({ connectionString: config.databaseUrl });
  const applied: string[] = [];
  try {
    await ensureMigrationsTable(ownedPool);
    const { rows } = await ownedPool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const alreadyApplied = new Set(rows.map((r) => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      if (alreadyApplied.has(filename)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
      const client = await ownedPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        applied.push(filename);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed: ${filename}\n${(err as Error).message}`);
      } finally {
        client.release();
      }
    }
    return applied;
  } finally {
    if (!pool) await ownedPool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then((applied) => {
      if (applied.length === 0) {
        console.log('No pending migrations.');
      } else {
        console.log(`Applied ${applied.length} migration(s):`, applied.join(', '));
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
