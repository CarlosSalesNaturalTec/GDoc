import type { PoolClient } from 'pg';
import { GrantResourceType, Permission, UserRole } from '@gdoc/shared';
import type { TenantContext } from '../ports/database-port.js';

/**
 * Regra de bypass de RLS (design.md D3, revisão do D6 do Épico 4): o bypass
 * de `global_admin` vale **só para agregados** (contagens/somas de painel,
 * Épico 8). Nenhuma rota de **conteúdo** (bytes de arquivo, listagem de
 * itens) pode conceder acesso apenas por o `SELECT` enxergar a linha sob
 * bypass — `hasAccess`/`visibleResourceClause`/`resourceScopeClause` sempre
 * comparam `resource.unit_id === ctx.unitId` explicitamente antes de
 * conceder pelo ramo admin, para que o `global_admin` nunca seja um "olho
 * universal" sobre bytes de outra unidade. Não reabrir esse furo em rotas
 * futuras: agregados podem usar o bypass; bytes/itens individuais, nunca.
 *
 * Épico 6 (lixeira, change `epico-6-lixeira-retencao`, design.md D2):
 * recurso na lixeira resolve como inexistente em toda via viva, inclusive
 * para o admin da unidade — `hasAccess` só enxerga `deleted_at IS NULL` por
 * padrão, e `visibleResourceClause` reforça o mesmo filtro. A exceção
 * deliberada é `hasAccess({ includeTrash: true })`, usada só pelas rotas de
 * `restore` (que precisam localizar o próprio recurso excluído) — nunca
 * combinar `includeTrash` com uma rota de conteúdo vivo.
 */

export function resourceTable(resourceType: GrantResourceType): 'folders' | 'files' {
  return resourceType === GrantResourceType.FOLDER ? 'folders' : 'files';
}

/**
 * `true` quando `ctx` é admin (unit_admin ou global_admin) **e** a unidade do
 * recurso é a mesma do contexto autenticado (design.md D1) — a comparação
 * explícita é o que trava o bypass de RLS do `global_admin` sobre conteúdo
 * de outra unidade (Opção B).
 */
export function isAdminOfUnit(ctx: TenantContext, resourceUnitId: string): boolean {
  return (ctx.role === UserRole.UNIT_ADMIN || ctx.role === UserRole.GLOBAL_ADMIN) && resourceUnitId === ctx.unitId;
}

/**
 * Resolução única de acesso a conteúdo (design.md D1/D2): **dono OU admin da
 * unidade do recurso OU grant do verbo exigido**, sem walk de ancestrais
 * (sem herança), fail-closed — recurso inexistente (ou escondido pela RLS de
 * outra unidade) resolve para `false`, sem distinguir os dois casos. Roda na
 * transação tenant já aberta pela rota chamadora, então a RLS por `unit_id`
 * já filtra por baixo.
 */
export async function hasAccess(
  client: PoolClient,
  ctx: TenantContext,
  resourceType: GrantResourceType,
  resourceId: string,
  permission: Permission,
  options: { includeTrash?: boolean } = {},
): Promise<boolean> {
  // `includeTrash` existe só para restore (design.md D5): restaurar exige o
  // mesmo alcance do delete sobre um recurso que, por definição, está na
  // lixeira — sem a opção, o filtro padrão de `deleted_at IS NULL` faria o
  // próprio item a restaurar resolver como inexistente.
  const deletedFilter = options.includeTrash ? '' : 'AND deleted_at IS NULL';
  const { rows } = await client.query<{ owner_id: string; unit_id: string }>(
    `SELECT owner_id, unit_id FROM ${resourceTable(resourceType)} WHERE id = $1 ${deletedFilter}`,
    [resourceId],
  );
  const resource = rows[0];
  if (!resource) return false;
  if (resource.owner_id === ctx.userId) return true;
  if (isAdminOfUnit(ctx, resource.unit_id)) return true;

  const { rows: grantRows } = await client.query(
    `SELECT 1 FROM grants
     WHERE subject_user_id = $1 AND resource_type = $2 AND resource_id = $3 AND permission = $4`,
    [ctx.userId, resourceType, resourceId, permission],
  );
  return grantRows.length > 0;
}

/**
 * Fragmento SQL de alcance (dono OU grant do verbo OU admin da unidade),
 * sem filtro de `deleted_at` — a parte comum entre a visibilidade viva
 * (`visibleResourceClause`, verbo `view`) e a lixeira (`GET /trash`, verbo
 * `delete`, design.md D9), que precisam do mesmo alcance mas de filtros
 * opostos de `deleted_at`. Para o admin da unidade da listagem
 * (`isAdminOfUnit(ctx, ctx.unitId)`, sempre verdadeiro para quem chegou até
 * aqui, já que a listagem é sempre da própria unidade), o alcance é **a
 * unidade inteira** — `TRUE` quando a RLS já trava as linhas à unidade (todo
 * papel exceto `global_admin`), ou `unit_id = '<ctx.unitId>'` para o
 * `global_admin`, travando explicitamente o bypass de RLS para que a
 * listagem não traga itens de outra unidade. Para o não-admin, mantém-se
 * "próprio OU liberado": `ownerIdParam` é o placeholder já usado para
 * `ctx.userId` na query (ex.: `'$1'`) — reaproveitado tanto como dono quanto
 * como `subject_user_id` do grant, sem parâmetro extra. `resourceType` é
 * sempre uma constante interna do enum, `ctx.unitId` é sempre o uuid do
 * próprio contexto autenticado — nenhum dos dois vem de entrada do usuário,
 * então não há superfície de injeção.
 */
export function resourceScopeClause(
  resourceType: GrantResourceType,
  ownerIdParam: string,
  ctx: TenantContext,
  permission: Permission = Permission.VIEW,
): string {
  if (isAdminOfUnit(ctx, ctx.unitId)) {
    return ctx.role === UserRole.GLOBAL_ADMIN ? `unit_id = '${ctx.unitId}'` : 'TRUE';
  }

  return `(owner_id = ${ownerIdParam} OR id IN (
    SELECT resource_id FROM grants
    WHERE subject_user_id = ${ownerIdParam} AND resource_type = '${resourceType}' AND permission = '${permission}'
  ))`;
}

/**
 * Fragmento SQL de visibilidade para listagem viva (design.md D2/D8):
 * `resourceScopeClause` (verbo `view`) mais `deleted_at IS NULL` — item na
 * lixeira nunca aparece na listagem, nem para o admin da unidade.
 */
export function visibleResourceClause(resourceType: GrantResourceType, ownerIdParam: string, ctx: TenantContext): string {
  return `deleted_at IS NULL AND ${resourceScopeClause(resourceType, ownerIdParam, ctx, Permission.VIEW)}`;
}
