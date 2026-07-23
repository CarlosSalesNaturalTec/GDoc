import { Router } from 'express';
import { UserRole, UnitStatus } from '@gdoc/shared';
import type { CreatePersonRequest, UpdatePersonRequest, PersonResponse } from '@gdoc/shared';
import type { Ports } from '../ports/index.js';
import type { TenantContext } from '../ports/database-port.js';

interface PersonRow {
  id: string;
  unit_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  job_title: string | null;
  work_area: string | null;
  notes: string | null;
  role: string;
  status: string;
  created_at: string;
}

const PERSON_COLUMNS = 'id, unit_id, full_name, email, phone, job_title, work_area, notes, role, status, created_at';

function toPersonResponse(row: PersonRow): PersonResponse {
  return {
    id: row.id,
    unitId: row.unit_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    workArea: row.work_area,
    notes: row.notes,
    role: row.role as PersonResponse['role'],
    status: row.status as PersonResponse['status'],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isAdmin(ctx: TenantContext): boolean {
  return ctx.role === UserRole.GLOBAL_ADMIN || ctx.role === UserRole.UNIT_ADMIN;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}

/**
 * `routes/users.ts` — CRUD de pessoas pela administração (US 1.1). Alcance
 * por papel imposto em duas camadas (design.md Decisão D4): a checagem de
 * papel aqui bloqueia `collaborator` de plano, e a RLS (mesma
 * `withTenantTransaction` de sempre) garante que `unit_admin` nunca
 * enxergue/altere pessoa de outra unidade mesmo que a checagem de
 * aplicação falhasse.
 */
export function usersRouter(ports: Ports): Router {
  const router = Router();

  router.post('/users', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      if (!isAdmin(ctx)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const body = req.body as CreatePersonRequest;
      if (!body.fullName || !body.email || !body.password) {
        res.status(400).json({ error: 'invalid request body' });
        return;
      }

      const role = body.role ?? UserRole.COLLABORATOR;
      if (ctx.role === UserRole.UNIT_ADMIN && role === UserRole.GLOBAL_ADMIN) {
        res.status(403).json({ error: 'cannot create global_admin' });
        return;
      }

      // unit_admin é sempre forçado à própria unidade, ignorando o que foi
      // informado (US 5.1, cenário "unit_admin não cria fora da própria
      // unidade"); global_admin pode escolher, com fallback para a própria.
      const unitId = ctx.role === UserRole.UNIT_ADMIN ? ctx.unitId : (body.unitId ?? ctx.unitId);

      const passwordHash = await ports.auth.hashPassword(body.password);

      // Fail-closed (change `gestao-de-unidades`, D2/D7): não cadastra em
      // unidade desativada. Checado no servidor (não só escondido no seletor
      // do front) e na mesma transação do insert, para o global_admin não
      // burlar via `unitId` forjado. `unit_admin` está preso à própria unidade
      // (sempre ativa enquanto ele existe), então na prática só barra o
      // global_admin escolhendo uma unidade desativada.
      // `email_conflict` não é uma variante aqui: a violação de unicidade é
      // lançada pelo insert e capturada no `catch` externo (409).
      type CreateOutcome = { kind: 'ok'; row: PersonRow } | { kind: 'unit_disabled' };

      let outcome: CreateOutcome;
      try {
        outcome = await ports.database.withTenantTransaction<CreateOutcome>(ctx, async (client) => {
          const { rows: unitRows } = await client.query<{ status: string }>(
            'SELECT status FROM units WHERE id = $1',
            [unitId],
          );
          if (unitRows[0]?.status === UnitStatus.DISABLED) {
            return { kind: 'unit_disabled' };
          }

          const { rows } = await client.query<PersonRow>(
            `INSERT INTO users (unit_id, email, password_hash, role, full_name, phone, job_title, work_area, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${PERSON_COLUMNS}`,
            [
              unitId,
              body.email,
              passwordHash,
              role,
              body.fullName,
              body.phone ?? null,
              body.jobTitle ?? null,
              body.workArea ?? null,
              body.notes ?? null,
            ],
          );
          return { kind: 'ok', row: rows[0]! };
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({ error: 'email already in use' });
          return;
        }
        throw err;
      }

      if (outcome.kind === 'unit_disabled') {
        res.status(409).json({ error: 'unit is disabled' });
        return;
      }

      res.status(201).json(toPersonResponse(outcome.row));
    } catch (err) {
      next(err);
    }
  });

  router.get('/users', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      if (!isAdmin(ctx)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      // Nenhum filtro de unidade aqui: a RLS já restringe unit_admin à
      // própria unidade e dá bypass a global_admin (US 5.1).
      const rows = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<PersonRow>(
          `SELECT ${PERSON_COLUMNS} FROM users ORDER BY created_at`,
        );
        return rows;
      });

      res.json(rows.map(toPersonResponse));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id', async (req, res, next) => {
    try {
      const ctx = req.tenantContext!;
      if (!isAdmin(ctx)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const body = req.body as UpdatePersonRequest;
      if (ctx.role === UserRole.UNIT_ADMIN && body.role === UserRole.GLOBAL_ADMIN) {
        res.status(403).json({ error: 'cannot elevate to global_admin' });
        return;
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];
      const setField = (column: string, value: unknown) => {
        values.push(value);
        setClauses.push(`${column} = $${values.length}`);
      };
      if (body.fullName !== undefined) setField('full_name', body.fullName);
      if (body.phone !== undefined) setField('phone', body.phone);
      if (body.jobTitle !== undefined) setField('job_title', body.jobTitle);
      if (body.workArea !== undefined) setField('work_area', body.workArea);
      if (body.notes !== undefined) setField('notes', body.notes);
      if (body.status !== undefined) setField('status', body.status);
      if (body.role !== undefined) setField('role', body.role);

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'no fields to update' });
        return;
      }

      values.push(req.params.id);

      // RLS filtra as linhas visíveis para UPDATE antes do WHERE por id
      // rodar: se a pessoa pertence a outra unidade, 0 linhas voltam — sem
      // erro, sem dado alterado (US 5.1, cenário "edição respeita o
      // alcance"). Mesmo tratamento 403 usado por routes/files.ts para
      // "linha escondida pela RLS".
      const row = await ports.database.withTenantTransaction(ctx, async (client) => {
        const { rows } = await client.query<PersonRow>(
          `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING ${PERSON_COLUMNS}`,
          values,
        );
        return rows[0] ?? null;
      });

      if (!row) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      res.json(toPersonResponse(row));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
