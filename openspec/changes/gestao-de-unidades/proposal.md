## Why

Hoje o multi-unidade do GDoc existe apenas na camada de dados (coluna `unit_id` e RLS por unidade em `0002_enable_rls.sql`), mas **não há superfície de gestão de unidades**: unidades nascem só no `bootstrap.ts`/`seed.ts`, não existe rota de unidades, e o cadastro de pessoas nunca coleta a unidade. Na prática, um `global_admin` fica **preso à unidade do bootstrap** — não consegue criar uma nova unidade nem alocar uma pessoa em outra unidade. Isso contradiz o PRD: a US 1.1 descreve o cadastro "informando nome, **unidade**, ..." e a persona **Administrador Global** "enxerga todas as unidades... **define administradores de unidade**".

## What Changes

- **Novo backend de unidades** (`global_admin` apenas): `POST /units` (criar), `GET /units` (listar), `PATCH /units/:id` (renomear e/ou ativar/desativar). `unit_admin` e `collaborator` NÃO gerenciam unidades (403).
- **Status de unidade**: nova coluna `units.status` (`active`/`desativado`), espelhando o padrão de `PersonStatus`. Desativar é **reversível e não-destrutivo**, guardado pela precondição **"unidade vazia"** (zero pessoas vinculadas) — não cascateia status para as pessoas.
- **Nome de unidade único**: `units.name` passa a ter unicidade; renomear para um nome já existente é recusado (409).
- **Cadastro de pessoa recusa unidade desativada**: `POST /users` passa a rejeitar (fail-closed) `unitId` de unidade `desativado`.
- **BREAKING (comportamento de spec `web-pessoas`)**: o formulário de cadastro passa a **mostrar seletor de unidade e enviar `unitId` para o `global_admin`** — invertendo a "Opção A" atual ("NÃO SHALL enviar `unitId` nem mostrar seletor"). O `unit_admin` continua **sem** seletor (preso à própria unidade, como hoje).
- **Nova tela de gestão de unidades** na SPA (listar, criar, renomear, ativar/desativar), restrita ao `global_admin`.
- **Exibir o nome da unidade** (não o UUID) na listagem de pessoas.
- **Sincronia dos 3 pontos de prefixo de API** ao adicionar `/units`: `lib/api-prefixes.ts`, `apps/web/vite.config.ts` e `infra/terraform/locals.tf`.

## Capabilities

### New Capabilities
- `gestao-unidades`: backend de gestão de unidades pelo `global_admin` — criar, listar, renomear e ativar/desativar unidades, com status, unicidade de nome e a precondição de "unidade vazia" para desativar. Referencia PRD US 1.1 e US 5.1.
- `web-unidades`: tela da SPA para o `global_admin` gerenciar unidades (listar/criar/renomear/ativar/desativar), consumindo as rotas de `gestao-unidades`, sem ser linha de defesa.

### Modified Capabilities
- `web-pessoas`: o requisito "Cadastro de pessoa com senha inicial" muda — para o `global_admin`, a SPA passa a mostrar seletor de unidade (alimentado por `GET /units`, só ativas) e a enviar `unitId`; o `unit_admin` segue sem seletor. A listagem passa a exibir o **nome** da unidade em vez do UUID.
- `gestao-pessoas`: o requisito de cadastro (`POST /users`) passa a **recusar** (fail-closed) a criação de pessoa em unidade `desativado`.

## Impact

- **DB**: migration adicionando `units.status` e índice único em `units.name`.
- **api**: novo `routes/units.ts` + `unitsRouter` montado em `app.ts` (com `/units` em `tenantScopedPrefixes` e `API_PREFIXES`); ajuste em `routes/users.ts` (recusa unidade desativada). Testes de segurança/isolamento (`isolamento-unidade`, RLS) estendidos.
- **web**: novo módulo de unidades (tela + queries) no shell; `PessoaFormModal` (seletor de unidade) e `PessoasPage` (nome da unidade).
- **shared**: DTOs/enums de unidade (`UnitResponse`, `CreateUnitRequest`, `UpdateUnitRequest`, `UnitStatus`), consumidos de `dist/`.
- **infra**: `infra/terraform/locals.tf` (`api_proxy_prefixes`) e `apps/web/vite.config.ts` (`API_PROXY_PREFIXES`) ganham `/units`.

## Out of Scope (mudança futura)

- **Mover pessoa entre unidades** (hoje só via novo cadastro na unidade destino). Sem isso, a única forma de esvaziar uma unidade para desativá-la é desativar/recriar suas pessoas — aceitável no MVP.
- **Excluir** unidade permanentemente (só ativar/desativar; FKs de conteúdo/auditoria tornam a exclusão destrutiva e fora do MVP).
- **Compartilhamento entre unidades** (explicitamente fora do MVP no PRD).
- **`unit_admin` gerenciando a própria unidade** (renomear a própria unidade): fica só com o `global_admin` nesta fatia.
