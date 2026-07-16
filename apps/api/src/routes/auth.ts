import { Router } from 'express';
import type { LoginRequest } from '@gdoc/shared';
import type { Ports } from '../ports/index.js';
import { config } from '../config.js';
import { attachTenantContext } from '../middleware/tenant-context.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../lib/session-cookie.js';

// Mesma unidade de bypass usada por tenant-context.ts: neste ponto do login
// ainda não sabemos a unidade da pessoa, então a busca por e-mail roda sob
// o mesmo mecanismo de bypass (papel global_admin), não um caminho especial.
const BOOTSTRAP_UNIT = '00000000-0000-0000-0000-000000000000';

interface UserAuthRow {
  id: string;
  unit_id: string;
  role: string;
  status: string;
  password_hash: string;
}

/**
 * `routes/auth.ts` — login/logout/me (US 1.2). Montado em `app.ts` **antes**
 * do middleware que exige sessão: `/auth/login` e `/auth/logout` precisam
 * funcionar sem sessão prévia. `/auth/me` aplica `attachTenantContext`
 * diretamente nesta rota (não no router inteiro), já que só ela exige
 * identidade resolvida.
 */
export function authRouter(ports: Ports): Router {
  const router = Router();

  router.post('/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body as LoginRequest;
      if (!email || !password) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const user = await ports.database.withTenantTransaction(
        { unitId: BOOTSTRAP_UNIT, userId: BOOTSTRAP_UNIT, role: 'global_admin' },
        async (client) => {
          const { rows } = await client.query<UserAuthRow>(
            'SELECT id, unit_id, role, status, password_hash FROM users WHERE email = $1',
            [email],
          );
          return rows[0] ?? null;
        },
      );

      // Resposta única e genérica para e-mail inexistente ou senha errada
      // (US 1.2, cenário 2): não revela qual dos dois foi o problema.
      if (!user || !(await ports.auth.verifyPassword(user.password_hash, password))) {
        res.status(401).json({ error: 'invalid credentials' });
        return;
      }

      if (user.status !== 'active') {
        res.status(403).json({ error: 'account disabled' });
        return;
      }

      const token = await ports.auth.issueSession({ sub: user.id });
      res.cookie(SESSION_COOKIE_NAME, token, {
        ...sessionCookieOptions(),
        maxAge: config.authSessionTtlSeconds * 1000,
      });
      res.json({ id: user.id, unitId: user.unit_id, role: user.role });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
    res.status(204).end();
  });

  router.get('/auth/me', attachTenantContext(ports), (req, res) => {
    const ctx = req.tenantContext!;
    res.json({ id: ctx.userId, unitId: ctx.unitId, role: ctx.role });
  });

  return router;
}
