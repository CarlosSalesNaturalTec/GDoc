import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../ports/database-port.js';
import type { Ports } from '../ports/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    tenantContext?: TenantContext;
  }
}

const BOOTSTRAP_UNIT = '00000000-0000-0000-0000-000000000000';

/**
 * Resolve a identidade do usuário da requisição e popula `req.tenantContext`.
 *
 * NOTA: a resolução de identidade aqui é um placeholder deliberado —
 * Épico 1 (login/sessão) é fora de escopo desta mudança de fundação. Em
 * produção isso lerá o usuário autenticado de uma sessão/JWT; por ora lê
 * um header simples, apenas para exercitar o seam de tenancy nos testes e
 * na prova ponta a ponta.
 *
 * A resolução em si roda dentro de uma transação com contexto de bypass
 * (papel `global_admin`) porque, neste ponto, ainda não sabemos a unidade
 * do usuário — é exatamente o mesmo mecanismo de RLS usado pelo restante
 * da aplicação, não um caminho especial. Cada operação de dados da rota,
 * depois, abre sua própria transação com `withTenantTransaction` usando o
 * contexto já resolvido (SET LOCAL por transação, nunca por sessão).
 */
export function attachTenantContext(ports: Ports) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.header('x-gdoc-user-id');
    if (!userId) {
      res.status(401).json({ error: 'missing x-gdoc-user-id header' });
      return;
    }

    try {
      const identity = await ports.database.withTenantTransaction(
        { unitId: BOOTSTRAP_UNIT, userId, role: 'global_admin' },
        async (client) => {
          const { rows } = await client.query<{ id: string; unit_id: string; role: string }>(
            'SELECT id, unit_id, role FROM users WHERE id = $1',
            [userId],
          );
          return rows[0];
        },
      );

      if (!identity) {
        res.status(401).json({ error: 'unknown user' });
        return;
      }

      req.tenantContext = {
        unitId: identity.unit_id,
        userId: identity.id,
        role: identity.role as TenantContext['role'],
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
