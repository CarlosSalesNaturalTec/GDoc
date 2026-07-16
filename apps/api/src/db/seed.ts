import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { config } from '../config.js';

/**
 * Seed condicional de desenvolvimento: só popula se `users` estiver vazia
 * (idempotente — reexecutar o SessionStart hook não duplica dados).
 * Cria duas unidades e um usuário de cada papel, só para exercitar RLS
 * e a prova ponta a ponta. Nenhum dado de feature do PRD.
 */
export async function seedIfEmpty(pool?: Pool): Promise<boolean> {
  const ownedPool = pool ?? new Pool({ connectionString: config.databaseUrl });
  try {
    const { rows } = await ownedPool.query<{ count: string }>('SELECT count(*)::text FROM users');
    if (Number(rows[0]?.count ?? '0') > 0) {
      return false;
    }

    const passwordHash = await argon2.hash('dev-password-only', { type: argon2.argon2id });

    // As tabelas têm FORCE ROW LEVEL SECURITY (ver 0002_enable_rls.sql):
    // mesmo o dono das tabelas é restringido pela policy, então o seed
    // precisa rodar sob o papel global_admin (o mesmo bypass que qualquer
    // admin global usaria), não como uma conexão "especial".
    const client = await ownedPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_role', 'global_admin', true)");

      const { rows: unitRows } = await client.query<{ id: string }>(
        `INSERT INTO units (name) VALUES ('Unidade A'), ('Unidade B') RETURNING id`,
      );
      const [unitA, unitB] = unitRows;
      if (!unitA || !unitB) throw new Error('seed: expected two units to be created');

      // global_admin também precisa de um unit_id (FK NOT NULL) — usa a
      // Unidade A como "casa" administrativa; a RLS dá bypass pelo papel,
      // não pelo unit_id, então isso não limita seu alcance.
      await client.query(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES
           ($1, 'colaborador.a@gdoc.dev', $3, 'collaborator'),
           ($1, 'admin.a@gdoc.dev', $3, 'unit_admin'),
           ($2, 'colaborador.b@gdoc.dev', $3, 'collaborator'),
           ($1, 'admin.global@gdoc.dev', $3, 'global_admin')`,
        [unitA.id, unitB.id, passwordHash],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return true;
  } finally {
    if (!pool) await ownedPool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedIfEmpty()
    .then((seeded) => {
      console.log(seeded ? 'Seed applied.' : 'Seed skipped (users already present).');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
