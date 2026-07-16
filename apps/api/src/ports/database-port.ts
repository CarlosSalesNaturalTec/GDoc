import type { PoolClient } from 'pg';
import type { UserRole } from '@gdoc/shared';

export interface TenantContext {
  unitId: string;
  userId: string;
  role: UserRole;
}

/**
 * DatabasePort — mesmo Postgres em dev e prod. A parte relevante do seam é
 * garantir que toda query tenant-scoped rode dentro de uma transação com
 * `SET LOCAL app.current_unit` / `app.user_role`, para que a RLS do banco
 * seja a linha de defesa real (ver migrations 0002_enable_rls.sql).
 */
export interface DatabasePort {
  /** Executa `fn` dentro de uma transação com o contexto de tenant aplicado via SET LOCAL. */
  withTenantTransaction<T>(
    ctx: TenantContext,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T>;

  /** Executa `fn` dentro de uma transação sem contexto de tenant (uso interno/migrações). */
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;

  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;

  close(): Promise<void>;
}
