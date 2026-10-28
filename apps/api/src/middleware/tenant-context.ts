import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../ports/database-port.js';
import type { Ports } from '../ports/index.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';

/**
 * Nome da pessoa e da sua unidade, resolvidos na **mesma** releitura que
 * popula `tenantContext` (change `shell-e-inicio`, design.md D3). Separado de
 * `TenantContext` de propósito: aquele é o contexto de isolamento que vai para
 * o `SET LOCAL` de toda transação, e não é lugar de dado de apresentação.
 *
 * `fullName` vazio = conta sem nome cadastrado; nunca o identificador interno.
 */
export interface IdentityDisplay {
  fullName: string;
  unitName: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    tenantContext?: TenantContext;
    identityDisplay?: IdentityDisplay;
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
 * O nome da pessoa e o da sua unidade saem da **mesma** leitura, em
 * `req.identityDisplay` (change `shell-e-inicio`, design.md D3): é o que faz
 * um nome alterado no cadastro aparecer na requisição seguinte sem novo login,
 * pela mesma razão que a releitura existe. Nenhum round-trip extra — só duas
 * colunas e um `JOIN` na consulta que já acontecia.
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
            password_changed_at: string;
            full_name: string | null;
            unit_name: string;
          }>(
            `SELECT u.id, u.unit_id, u.role, u.status, u.password_changed_at,
                    u.full_name, un.name AS unit_name
             FROM users u JOIN units un ON un.id = u.unit_id
             WHERE u.id = $1`,
            [claims.sub],
          );
          return rows[0];
        },
      );

      if (!identity || identity.status !== 'active') {
        res.status(401).json({ error: 'not authenticated' });
        return;
      }

      // Sessão emitida antes da última troca de senha é recusada (change
      // `troca-de-senha`, design.md D1) — mesmo ponto em que se recusa a
      // sessão de conta desativada, sem depender de expirar o token nem
      // consultar tabela de sessões.
      const passwordChangedAtSeconds = Math.floor(
        new Date(identity.password_changed_at).getTime() / 1000,
      );
      if (claims.iat < passwordChangedAtSeconds) {
        res.status(401).json({ error: 'not authenticated' });
        return;
      }

      req.tenantContext = {
        unitId: identity.unit_id,
        userId: identity.id,
        role: identity.role as TenantContext['role'],
      };
      // Conta sem nome cadastrado resolve para vazio, nunca para o
      // identificador (capability `autenticacao`, cenário 3).
      req.identityDisplay = {
        fullName: identity.full_name ?? '',
        unitName: identity.unit_name,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
