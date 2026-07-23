## 1. Shared (DTOs/enums)

- [x] 1.1 Criar `packages/shared/src/units.ts` com `UnitStatus` (`active`/`desativado`), `UnitResponse` (`id`, `name`, `status`, `createdAt`), `CreateUnitRequest` (`name`) e `UpdateUnitRequest` (`name?`, `status?`)
- [x] 1.2 Exportar os novos tipos em `packages/shared/src/index.ts` e recompilar (`npm run build --workspace packages/shared`)

## 2. Banco de dados

- [x] 2.1 Nova migration numerada (`0011_units_status_and_name_unique.sql`): `ALTER TABLE units ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','desativado'))` e `CREATE UNIQUE INDEX units_name_uidx ON units (name)`
- [x] 2.2 Verificar que `db/migrate.ts` aplica a nova migration em ordem (ordenação lexicográfica: `0011_` após `0010_`); migration executada com sucesso contra Postgres local (coluna `status` + índice `units_name_uidx` confirmados via `\d units`)

## 3. Backend — rotas de unidade

- [x] 3.1 Criar `apps/api/src/routes/units.ts` com `unitsRouter`: `POST /units`, `GET /units` (aceitar filtro de status ativo p/ seletor), `PATCH /units/:id`; todas exigindo `role === global_admin` (403 caso contrário), rodando em `withTenantTransaction`
- [x] 3.2 `POST /units`: criar unidade `active`; tratar violação de unicidade de nome como 409
- [x] 3.3 `PATCH /units/:id` renomear: aplicar unicidade de nome (409 em duplicado)
- [x] 3.4 `PATCH /units/:id` desativar: recusar (409, "unidade não está vazia") se `SELECT count(*) FROM users WHERE unit_id=$1 > 0`; recusar (4xx) se for a unidade do contexto (`ctx.unitId`) ou a de bootstrap; reativar sempre permitido
- [x] 3.5 Montar `unitsRouter` em `app.ts`, adicionar `/units` a `tenantScopedPrefixes`
- [x] 3.6 `POST /users` (`routes/users.ts`): recusar (fail-closed, 4xx) cadastro em unidade com `status='desativado'`

## 4. Sincronia dos prefixos de API (invariante dos 3 pontos)

- [x] 4.1 Adicionar `/units` a `API_PREFIXES` em `apps/api/src/lib/api-prefixes.ts`
- [x] 4.2 Adicionar `/units` a `API_PROXY_PREFIXES` em `apps/web/vite.config.ts`
- [x] 4.3 Adicionar `/units` a `api_proxy_prefixes` em `infra/terraform/locals.tf`

## 5. Web — módulo de unidades

- [x] 5.1 Criar `apps/web/src/unidades/queries.ts` (TanStack Query: `useUnits`, `useCreateUnit`, `useUpdateUnit`) contra `/units`
- [x] 5.2 Criar a página de gestão de unidades (listar nome/status; criar; renomear; ativar/desativar com confirmação), restrita a `global_admin` via guarda de rota
- [x] 5.3 Registrar a rota/entrada no `shell/AppShell.tsx` (item de menu só para `global_admin`)
- [x] 5.4 Tratar 409 de nome duplicado (aviso no campo) e 409/4xx de "unidade não está vazia"/própria/bootstrap (aviso claro, sem alterar o estado exibido)

## 6. Web — cadastro de pessoas com seletor de unidade

- [x] 6.1 `PessoaFormModal.tsx`: para `global_admin`, adicionar seletor de unidade alimentado por `GET /units` (só ativas) e enviar `unitId` no `POST /users`; para `unit_admin`, sem seletor (comportamento atual)
- [x] 6.2 `PessoasPage.tsx`: exibir o **nome** da unidade (resolvido via `GET /units`), não o UUID (coluna só para `global_admin`, coerente com `GET /units` ser 403 para `unit_admin`)

## 7. Testes

- [x] 7.1 Testes de `units` no backend: autorização por papel (403 p/ unit_admin/collaborator), unicidade de nome (409), desativar vazia OK, desativar não-vazia 409, própria/bootstrap recusadas, reativar OK
- [x] 7.2 Teste de `POST /users` recusando unidade desativada (em `units.test.ts`); `isolamento-unidade.test.ts`/RLS não exigem mudança (a coluna `status` não altera o isolamento por `unit_id`)
- [x] 7.3 Atualizar/estender testes web de `pessoas` (seletor de unidade por papel, nome da unidade na listagem) e adicionar testes da tela de unidades (`unidades.test.tsx`)
- [x] 7.4 Garantir `web-serving.test.ts` verde com o novo prefixo `/units` (suíte completa da API: 170/170 verde)

## 8. Fechamento

- [x] 8.1 `npm run lint` (verde), `npm run build` (verde), `npm run test` verdes em todos os workspaces (API 170/170; web 80/80)
- [x] 8.2 Revisar o seed de dev (`db/seed.ts`): unidades de seed já nascem `active` pelo default da coluna — nenhuma mudança necessária (validado rodando o seed contra base limpa)
