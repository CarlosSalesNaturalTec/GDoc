import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

const INSECURE_DEV_PASSWORD = 'dev-password-only';
const DEFAULT_UNIT_NAME = 'Administração';
const DEFAULT_ADMIN_NAME = 'Administrador Global';

interface BootstrapCredentials {
  email: string;
  password: string;
  unitName: string;
  adminName: string;
}

/**
 * Fail-closed (design.md D3): lê direto de `process.env`, não dos defaults
 * de dev em `config.bootstrapAdmin`, para que o default inseguro conhecido
 * nunca vire um admin real.
 */
function readCredentials(): BootstrapCredentials {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'bootstrap: variáveis obrigatórias ausentes. Defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD.',
    );
  }
  if (password === INSECURE_DEV_PASSWORD) {
    throw new Error(
      `bootstrap: BOOTSTRAP_ADMIN_PASSWORD não pode ser a senha padrão de desenvolvimento ('${INSECURE_DEV_PASSWORD}'). Defina uma senha própria.`,
    );
  }

  return {
    email,
    password,
    unitName: process.env.BOOTSTRAP_ADMIN_UNIT || DEFAULT_UNIT_NAME,
    adminName: process.env.BOOTSTRAP_ADMIN_NAME || DEFAULT_ADMIN_NAME,
  };
}

/**
 * Bootstrap de produção (design.md D1/D2/D4): aplica as migrações pendentes
 * e cria **somente** o `global_admin` inicial — nunca dados de demonstração.
 * Idempotente: se já existe qualquer `global_admin`, é no-op (retorna
 * `false`). Retorna `true` quando o admin é criado.
 */
export async function bootstrapAdmin(pool?: Pool): Promise<boolean> {
  const credentials = readCredentials();

  const ownedPool = pool ?? new Pool({ connectionString: config.databaseUrl });
  try {
    await runMigrations(ownedPool);

    const passwordHash = await argon2.hash(credentials.password, { type: argon2.argon2id });

    // FORCE ROW LEVEL SECURITY (0002_enable_rls.sql) esconde até a contagem
    // de uma query solta fora de transação — a checagem de idempotência
    // precisa do mesmo bypass `app.user_role = 'global_admin'` da escrita,
    // por isso roda dentro da mesma transação (também evita um TOCTOU entre
    // checar e criar).
    const client = await ownedPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_role', 'global_admin', true)");

      const { rows: adminRows } = await client.query<{ count: string }>(
        "SELECT count(*)::text FROM users WHERE role = 'global_admin'",
      );
      if (Number(adminRows[0]?.count ?? '0') > 0) {
        await client.query('COMMIT');
        return false;
      }

      const { rows: existingUnitRows } = await client.query<{ id: string }>(
        'SELECT id FROM units WHERE name = $1',
        [credentials.unitName],
      );
      let unitId = existingUnitRows[0]?.id;
      if (!unitId) {
        const { rows: insertedUnitRows } = await client.query<{ id: string }>(
          'INSERT INTO units (name) VALUES ($1) RETURNING id',
          [credentials.unitName],
        );
        unitId = insertedUnitRows[0]?.id;
      }
      if (!unitId) throw new Error('bootstrap: falha ao criar/obter a unidade do administrador');

      await client.query(
        `INSERT INTO users (unit_id, email, password_hash, role, full_name)
         VALUES ($1, $2, $3, 'global_admin', $4)`,
        [unitId, credentials.email, passwordHash, credentials.adminName],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if ((err as { code?: string }).code === '23505') {
        throw new Error(`bootstrap: já existe um usuário com o e-mail ${credentials.email}.`);
      }
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
  bootstrapAdmin()
    .then((created) => {
      console.log(
        created ? 'Administrador global criado.' : 'Bootstrap ignorado (já existe um global_admin).',
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
