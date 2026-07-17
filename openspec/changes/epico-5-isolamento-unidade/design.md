## Context

O isolamento entre unidades hoje se apoia em duas camadas:

1. **RLS por `unit_id`** (`0002_enable_rls.sql`) — fronteira dura no banco; uma
   query com bug ainda assim não cruza unidade porque o Postgres filtra as
   linhas. Bypass só para `app.user_role = 'global_admin'`.
2. **Autorização na aplicação** — `apps/api/src/lib/access.ts` centraliza a
   regra de acesso a **conteúdo**: `hasAccess()` (checagem por requisição) e
   `visibleResourceClause()` (fragmento SQL de listagem). Hoje ambas são
   **dono-OU-grant**, para **todos** os papéis (Épico 4, design D2/D6).

O Épico 4 deixou explícito, no seu D6, que o alcance administrativo amplo sobre
conteúdo seria o Épico 5: *"a resolução ganhará o ramo 'admin da unidade do
recurso'"*. Esta mudança implementa esse ramo e, no mesmo movimento, **revisa a
decisão do `global_admin`** que o D6 havia congelado.

Estado atual relevante:

- `TenantContext = { unitId, userId, role }` — o `global_admin` **tem** uma
  `unitId` real (a sua unidade de origem, relida do banco a cada requisição em
  `middleware/tenant-context.ts`).
- `hasAccess(client, ctx, resourceType, resourceId, permission)` faz
  `SELECT owner_id FROM <tabela> WHERE id = $1` (sob RLS da transação) e retorna
  `owner_id == ctx.userId OR EXISTS grant(...)`. **Não** lê `unit_id`.
- `visibleResourceClause(resourceType, ownerIdParam)` monta `(owner_id = $n OR
  id IN (SELECT resource_id FROM grants WHERE subject_user_id = $n AND ...))`.
- Para `unit_admin`, a RLS já restringe todo `SELECT` à própria unidade. Para
  `global_admin`, a RLS **não** restringe (bypass) — então qualquer listagem/
  leitura sob ctx de `global_admin` enxerga todas as unidades por baixo.

Restrições herdadas e não renegociadas (config.yaml + CLAUDE.md): RLS é a
fronteira real (nunca depender só da app para isolamento); `SET LOCAL` por
transação (pooler em modo transação); bucket privado, permissão checada no
servidor **antes** de qualquer URL assinada, TTL curto diferenciado por
operação; migração aplicada não é editada.

## Goals / Non-Goals

**Goals:**

- Ramo administrativo na resolução de acesso: **dono OU grant OU admin da
  unidade do recurso**, imposto num único ponto (`lib/access.ts`) e reusado por
  todas as rotas de conteúdo (US 5.1, cenário 1).
- Alcance de listagem do admin: ver **todos** os itens da sua unidade (não só
  próprios/liberados), mantendo o não-admin no comportamento do Épico 4.
- Revisão do `global_admin` (Opção B): conteúdo amarrado a uma unidade
  (`resource.unit_id == ctx.unitId`), agregados cross-unit preservados via
  bypass — bypass passa a valer **para agregados, não para bytes**.
- Isolamento do colaborador verificável (US 5.1, cenário 2): nunca alcança
  conteúdo de outra unidade, nem por listagem, nem por id direto, nem por busca
  futura.
- Zero migração de schema: alcance derivado de `role` + `unit_id` existentes;
  RLS de `0002` intacta.

**Non-Goals:**

- **Troca de escopo de unidade pelo `global_admin`** (impersonar outra unidade
  para operar conteúdo lá) — mecanismo de sessão/UI; fatia futura. Conteúdo de
  outra unidade, para o `global_admin`, exige autogrant auditado por enquanto.
- **Painel/agregados do Épico 8** — aqui só se **preserva** o bypass para
  agregados; nenhum endpoint de painel é criado.
- **Busca/filtros do Épico 9** — o isolamento na busca é declarado como
  invariante, mas a busca é implementada no Épico 9.
- Mover/renomear/excluir **pasta**; lixeira; expiração de permissão — outros
  épicos.

## Decisions

### D1 — Ramo admin em `hasAccess`: dono OU grant OU admin-da-unidade-do-recurso

`hasAccess` passa a ler também `unit_id` do recurso e a aplicar o ramo admin:

```
hasAccess(ctx, resourceType, resourceId, permission):
    SELECT owner_id, unit_id FROM <tabela> WHERE id = $1     -- sob RLS da tx
    if !resource: return false                                -- fail-closed
    if resource.owner_id == ctx.userId: return true           -- dono
    if isAdminOfUnit(ctx, resource.unit_id): return true       -- NOVO ramo admin
    return EXISTS grant(subject=ctx.userId, resource, permission)
```

com o helper:

```
isAdminOfUnit(ctx, resourceUnitId) :=
   (ctx.role == 'unit_admin' OR ctx.role == 'global_admin')
   AND resourceUnitId == ctx.unitId
```

Efeitos por papel:

- **`unit_admin`**: acessa qualquer recurso da própria unidade em **qualquer
  verbo** (`view`/`download`/`rename`/`upload`), sem grant nem posse — é o
  cerne da US 5.1 cenário 1. A RLS já garante que ele nunca veja recurso de
  outra unidade, então o `SELECT` inicial já devolve `false` (linha inexistente
  sob RLS) para recurso alheio.
- **`global_admin`**: o `SELECT` **enxerga** a linha de qualquer unidade
  (bypass), mas o teste `resourceUnitId == ctx.unitId` só concede na **sua**
  unidade — logo, conteúdo cross-unit é **negado** na app mesmo com a linha
  visível. É exatamente a Opção B: o admin global não é olho universal sobre
  bytes.
- **`collaborator`**: `isAdminOfUnit` é sempre falso ⇒ comportamento idêntico
  ao Épico 4 (dono-ou-grant).

_Por que ler `unit_id` do recurso e comparar com `ctx.unitId`, em vez de
confiar na RLS para o admin?_ Porque para `global_admin` a RLS **não** filtra
(bypass), então sem a comparação explícita o ramo admin vazaria conteúdo
cross-unit. Para `unit_admin` a comparação é redundante-mas-barata (a RLS já
garantiria), e mantém a regra **uniforme e legível num só lugar**, sem depender
de qual papel tem bypass.

_Alternativa descartada:_ dar ao ramo admin `return true` só com base no papel
(sem checar `unit_id`). Funciona para `unit_admin` (RLS cobre), mas reabre o
furo do `global_admin` cross-unit — exatamente o que a Opção B fecha.

### D2 — `visibleResourceClause` ganha o modo admin: unidade inteira

A listagem (`GET /folders/:id/contents` e raiz) hoje injeta o fragmento
"próprio OU liberado". Para o admin, o alcance é **a unidade inteira**:

- Quando `isAdminOfUnit(ctx, <unidade da listagem>)` for verdadeiro, o
  fragmento de visibilidade vira `TRUE` (mostra todos os filhos), pois a RLS já
  restringe as linhas à unidade — **exceto** para `global_admin`, onde é
  preciso adicionar `unit_id = <ctx.unitId>` ao fragmento, senão o bypass de
  RLS traria filhos de outras unidades para a listagem.
- Para o não-admin, mantém-se `(owner_id = $n OR id IN (grants view...))`.

Implementação: `visibleResourceClause` passa a receber o `ctx` (ou um flag
`adminScopeUnitId?: string`) e decide o fragmento. Contrato:

```
visibleResourceClause(resourceType, ownerIdParam, ctx):
  if ctx é admin da unidade da listagem:
     if global_admin: return `unit_id = '<ctx.unitId>'`      -- trava o bypass
     else:            return `TRUE`                            -- RLS já trava
  else:
     return `(owner_id = <p> OR id IN (SELECT resource_id FROM grants ...))`
```

A "unidade da listagem" é a `unit_id` da pasta-âncora sendo aberta (ou
`ctx.unitId` na raiz). Como abrir a pasta já passou por `hasAccess` (D1), sabe-se
que, se admin chegou aqui, a pasta é da sua unidade — então comparar com
`ctx.unitId` é seguro. `unit_id` é injetado como literal só a partir de
`ctx.unitId` (uuid validado do próprio contexto autenticado), nunca de entrada
do usuário — mantém o padrão de não-parametrização já usado por `resourceType`.

### D3 — Bypass de RLS: para agregados, não para bytes

A decisão-chave da revisão do D6. O bypass de `global_admin` continua existindo
na policy RLS (necessário ao painel do Épico 8, que soma/contam linhas de todas
as unidades). O que muda é a **camada de aplicação**: nenhuma rota de
**conteúdo** (`view-url`, `download-url`, `replace-url`, `PATCH /files/:id`,
`upload-url(s)`, `contents`) deixa o `global_admin` agir fora da própria unidade
— D1/D2 impõem `unit_id == ctx.unitId`. Assim:

```
                       ┌────────────────────────────────────────────┐
                       │            global_admin ctx                │
        ┌──────────────┴───────────────┐        ┌───────────────────┴──────────┐
        │  CONTEÚDO (bytes/rotas)      │        │  AGREGADOS (painel, Épico 8) │
        │  hasAccess / visibleClause   │        │  COUNT/SUM cross-unit        │
        │  → travado em ctx.unitId      │        │  → usa bypass de RLS         │
        │  (Opção B)                    │        │  (preservado)                │
        └──────────────────────────────┘        └──────────────────────────────┘
```

Regra prática para futuras rotas: *bytes e listagem de itens ⇒ passar por
`lib/access.ts` (trava por unidade); contagem/soma agregada de painel ⇒ pode
usar bypass, nunca devolve bytes.* Documentar isso no cabeçalho de
`lib/access.ts` para não reabrir o furo.

### D4 — Onde o admin **concede** vs onde **acessa**

Fronteira com o Épico 4 (grants) e com o CRUD de pessoas: os endpoints
administrativos (`/grants`, `/users`) já impõem papel + RLS e **não mudam** —
`unit_admin` já opera só na sua unidade lá. Esta fatia só acrescenta o
**acesso a conteúdo** (ler/listar/renomear/baixar itens da unidade) ao mesmo
alcance. O admin continua podendo se autoconceder grant (trilha `granted_by`),
mas agora não precisa disso para conteúdo da própria unidade.

### D5 — `unit_admin` não pode ampliar o próprio alcance

Invariante de segurança: nenhuma rota deixa `unit_admin` mudar a sua `unitId`
nem promover-se a `global_admin` (já barrado em `routes/users.ts`). Como o ramo
admin de D1 deriva o alcance **exclusivamente** de `ctx.role`/`ctx.unitId`
(relidos do banco por requisição, nunca do corpo/header pelo usuário), não há
como o solicitante forjar alcance de outra unidade.

### D6 — Verbo do admin: todos, dentro da unidade

O admin da unidade acessa em **todos** os verbos de conteúdo do recurso
(`view`/`download`/`rename`/`upload`) — coerente com "vejo e gerencio ...
arquivos ... da minha unidade" (US 5.1). Não se cria um verbo especial de
admin; o ramo D1 concede antes mesmo de olhar `permission`. `delete` segue sem
rota consumidora (Lixeira é o Épico 6), então o admin ganha alcance de exclusão
só quando essa rota existir — sem imposição órfã aqui.

## Risks / Trade-offs

- **[Regressão de `global_admin`: perde leitura cross-unit que hoje o bypass
  permitia]** → Intencional (Opção B) e coberto por teste de regressão. Sem
  consumidor em produção (nenhum projeto GCP vivo). Se surgir necessidade
  legítima de o `global_admin` ler conteúdo de outra unidade, o caminho é a
  troca explícita de escopo de unidade (Non-Goal, fatia futura) ou autogrant
  auditado — nunca reabrir o bypass sobre bytes.
- **[`visibleResourceClause` passa a depender do `ctx`]** → mudança de
  assinatura tocando os dois call sites em `folders.ts`; risco de esquecer um.
  Mitigação: só há dois call sites (listagem de raiz e de pasta); teste de
  isolamento cobre ambos com `seedTwoUnits`.
- **[Injeção de `unit_id` literal no fragmento SQL]** → só a partir de
  `ctx.unitId` (uuid do contexto autenticado, nunca entrada do usuário),
  idêntico ao padrão já usado com `resourceType`. Sem parâmetro de usuário no
  literal ⇒ sem superfície de injeção.
- **[Custo extra: `hasAccess` agora lê `unit_id` além de `owner_id`]** →
  desprezível (mesma linha, mesma query, uma coluna a mais).
- **[Confundir "admin concede" com "admin acessa"]** → D4 mantém a fronteira; a
  mudança é aditiva sobre conteúdo, não altera os endpoints de grant/pessoas.

## Migration Plan

1. Ajustar `lib/access.ts`: `hasAccess` lê `unit_id` e aplica `isAdminOfUnit`;
   `visibleResourceClause` recebe `ctx` e ramifica (D1/D2). Exportar
   `isAdminOfUnit` para reuso/teste.
2. Atualizar os call sites em `routes/folders.ts` (listagem raiz + pasta) e
   confirmar que `routes/files.ts` já chama `hasAccess` (sem mudança de
   assinatura lá, só de comportamento interno).
3. Documentar no cabeçalho de `lib/access.ts` a regra "bypass para agregados,
   nunca para bytes" (D3).
4. Testes (`__tests__`, padrão `seedTwoUnits`/`withSystemBypass`):
   - `unit_admin` acessa e lista conteúdo da própria unidade não-próprio;
   - `unit_admin`/`collaborator` **não** alcançam a outra unidade (403 +
     não-vazamento);
   - `global_admin` **não** emite `view-url` cross-unit (regressão da Opção B),
     mas acessa a própria unidade;
   - `collaborator` mantém dono-ou-grant intacto.
5. `npm run lint && npm run build && npm run test`.
6. **Rollback**: mudança de código sem migração — reverter o commit restaura o
   comportamento anterior (D6 original). Nenhum estado de banco a desfazer.

## Open Questions

- Nenhuma bloqueante. A **troca explícita de escopo de unidade pelo
  `global_admin`** fica registrada como Non-Goal/fatia futura; se o Épico 8
  precisar que o painel abra um arquivo específico de outra unidade, isso será
  desenhado lá (provavelmente como ação de escopo temporário auditada), não
  reabrindo o bypass sobre bytes.
