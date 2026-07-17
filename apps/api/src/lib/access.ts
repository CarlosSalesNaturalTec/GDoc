import type { PoolClient } from 'pg';
import { GrantResourceType, type Permission } from '@gdoc/shared';
import type { TenantContext } from '../ports/database-port.js';

export function resourceTable(resourceType: GrantResourceType): 'folders' | 'files' {
  return resourceType === GrantResourceType.FOLDER ? 'folders' : 'files';
}

/**
 * Resolução única de acesso a conteúdo (design.md D2): **dono OU grant do
 * verbo exigido**, sem walk de ancestrais (sem herança), fail-closed —
 * recurso inexistente (ou escondido pela RLS de outra unidade) resolve para
 * `false`, sem distinguir os dois casos. Roda na transação tenant já aberta
 * pela rota chamadora, então a RLS por `unit_id` já filtra por baixo.
 */
export async function hasAccess(
  client: PoolClient,
  ctx: TenantContext,
  resourceType: GrantResourceType,
  resourceId: string,
  permission: Permission,
): Promise<boolean> {
  const { rows } = await client.query<{ owner_id: string }>(
    `SELECT owner_id FROM ${resourceTable(resourceType)} WHERE id = $1`,
    [resourceId],
  );
  const resource = rows[0];
  if (!resource) return false;
  if (resource.owner_id === ctx.userId) return true;

  const { rows: grantRows } = await client.query(
    `SELECT 1 FROM grants
     WHERE subject_user_id = $1 AND resource_type = $2 AND resource_id = $3 AND permission = $4`,
    [ctx.userId, resourceType, resourceId, permission],
  );
  return grantRows.length > 0;
}

/**
 * Fragmento SQL de visibilidade "próprio OU liberado" para listagem
 * (design.md D8): `ownerIdParam` é o placeholder já usado para `ctx.userId`
 * na query (ex.: `'$1'`) — reaproveitado tanto como dono quanto como
 * `subject_user_id` do grant, sem parâmetro extra. `resourceType` é sempre
 * uma constante interna do enum, nunca entrada do usuário.
 */
export function visibleResourceClause(resourceType: GrantResourceType, ownerIdParam: string): string {
  return `(owner_id = ${ownerIdParam} OR id IN (
    SELECT resource_id FROM grants
    WHERE subject_user_id = ${ownerIdParam} AND resource_type = '${resourceType}' AND permission = 'view'
  ))`;
}
