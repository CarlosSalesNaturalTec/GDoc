import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../ports/database-port.js';
import type { Ports } from '../ports/index.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';

declare module 'express-serve-static-core' {
  interface Request {
    tenantContext?: TenantContext;
  }
}

const BOOTSTRAP_UNIT = '00000000-0000-0000-0000-000000000000';

/**
 * Resolve a identidade autenticada da requisição (sessão em cookie
 * `HttpOnly`, ver routes/auth.ts) e popula `req.tenantContext`.
 *
 * `unit_id`, papel e status são relidos do banco a cada requisição — nunca
 * confiados do token — para que desativar uma conta encerre o acesso de
 * imediato, mesmo com uma sessão ainda não expirada em mãos (US 1.2,
 * cenário 3; design.md Decisão D1).
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
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'not authenticated' });
      return;
    }

    const claims = await ports.auth.verifySession(token);
    if (!claims) {
      res.status(401).json({ error: 'not authenticated' });
      return;
    }

    try {
      const identity = await ports.database.withTenantTransaction(
        { unitId: BOOTSTRAP_UNIT, userId: claims.sub, role: 'global_admin' },
        async (client) => {
          const { rows } = await client.query<{
            id: string;
            unit_id: string;
            role: string;
            status: string;
          }>('SELECT id, unit_id, role, status FROM users WHERE id = $1', [claims.sub]);
          return rows[0];
        },
      );

      if (!identity || identity.status !== 'active') {
        res.status(401).json({ error: 'not authenticated' });
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
