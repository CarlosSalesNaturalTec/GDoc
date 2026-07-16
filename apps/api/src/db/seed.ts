import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { config } from '../config.js';

/**
 * Seed condicional de desenvolvimento. Idempotente por "existe algum
 * `global_admin`?" (não por "`users` está vazia"), para que reexecutar
 * depois que a administração já cadastrou pessoas continue sendo no-op
 * (US 1.1, cenário "seed é no-op quando já há administrador").
 *
 * Quando não há nenhum `global_admin`: se a base estiver totalmente vazia,
 * cria o dataset de exemplo (duas unidades, um usuário de cada papel — só
 * para exercitar RLS e a prova ponta a ponta; nenhum dado de feature do
 * PRD além disso), usando as credenciais de bootstrap
 * (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`) para o
 * `global_admin`. Se já houver pessoas mas nenhum `global_admin` (caso
 * raro), cria só o bootstrap numa unidade "Administração" dedicada —
 * resolve o círculo "admin cria pessoa <-> pessoa precisa existir para
 * logar" (design.md Decisão D5).
 */
export async function seedIfEmpty(pool?: Pool): Promise<boolean> {
  const ownedPool = pool ?? new Pool({ connectionString: config.databaseUrl });
  try {
    const { rows: adminRows } = await ownedPool.query<{ count: string }>(
      "SELECT count(*)::text FROM users WHERE role = 'global_admin'",
    );
    if (Number(adminRows[0]?.count ?? '0') > 0) {
      return false;
    }

    const { rows: totalRows } = await ownedPool.query<{ count: string }>(
      'SELECT count(*)::text FROM users',
    );
    const isEmpty = Number(totalRows[0]?.count ?? '0') === 0;

    // As tabelas têm FORCE ROW LEVEL SECURITY (ver 0002_enable_rls.sql):
    // mesmo o dono das tabelas é restringido pela policy, então o seed
    // precisa rodar sob o papel global_admin (o mesmo bypass que qualquer
    // admin global usaria), não como uma conexão "especial".
    const client = await ownedPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_role', 'global_admin', true)");

      const bootstrapPasswordHash = await argon2.hash(config.bootstrapAdmin.password, {
        type: argon2.argon2id,
      });

      if (isEmpty) {
        const demoPasswordHash = await argon2.hash('dev-password-only', { type: argon2.argon2id });

        const { rows: unitRows } = await client.query<{ id: string }>(
          `INSERT INTO units (name) VALUES ('Unidade A'), ('Unidade B') RETURNING id`,
        );
        const [unitA, unitB] = unitRows;
        if (!unitA || !unitB) throw new Error('seed: expected two units to be created');

        await client.query(
          `INSERT INTO users (unit_id, email, password_hash, role, full_name) VALUES
             ($1, 'colaborador.a@gdoc.dev', $3, 'collaborator', 'Colaborador A'),
             ($1, 'admin.a@gdoc.dev', $3, 'unit_admin', 'Admin Unidade A'),
             ($2, 'colaborador.b@gdoc.dev', $3, 'collaborator', 'Colaborador B'),
             ($1, $4, $5, 'global_admin', 'Administrador Global')`,
          [unitA.id, unitB.id, demoPasswordHash, config.bootstrapAdmin.email, bootstrapPasswordHash],
        );
      } else {
        const { rows: unitRows } = await client.query<{ id: string }>(
          `INSERT INTO units (name) VALUES ('Administração') RETURNING id`,
        );
        const unit = unitRows[0];
        if (!unit) throw new Error('seed: expected bootstrap unit to be created');

        await client.query(
          `INSERT INTO users (unit_id, email, password_hash, role, full_name)
           VALUES ($1, $2, $3, 'global_admin', 'Administrador Global')`,
          [unit.id, config.bootstrapAdmin.email, bootstrapPasswordHash],
        );
      }

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
      console.log(seeded ? 'Seed applied.' : 'Seed skipped (global_admin already present).');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
