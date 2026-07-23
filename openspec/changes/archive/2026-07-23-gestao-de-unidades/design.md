## Context

O isolamento por unidade é o núcleo de segurança do GDoc: toda tabela tenant-scoped tem `unit_id` e policy RLS (`0002_enable_rls.sql`), e a resolução de acesso vive em `lib/access.ts`. Porém, a **unidade em si** nunca ganhou ciclo de vida: a tabela `units` só tem `id`, `name`, `created_at`; unidades são criadas apenas por `bootstrap.ts` (a primeira) e `seed.ts` (dev), e não há `unitsRouter`. O cadastro de pessoa (`routes/users.ts:81`) já suporta `body.unitId` para o `global_admin`, mas o front (`PessoaFormModal.tsx`) nunca envia esse campo — a spec `web-pessoas` fixou isso como "Opção A" ("NÃO SHALL enviar `unitId` nem mostrar seletor").

Resultado: o `global_admin` está preso à unidade do bootstrap. Este change dá à unidade um ciclo de vida gerenciável (criar, renomear, ativar/desativar) e conecta o cadastro de pessoas a ele, sem reabrir nenhuma trava de segurança existente.

## Goals / Non-Goals

**Goals:**
- Permitir ao `global_admin` criar, renomear e ativar/desativar unidades pela aplicação (API + SPA).
- Alocar pessoas na unidade certa no cadastro (seletor para `global_admin`; `unit_admin` continua preso à própria).
- Manter desativação **reversível e não-destrutiva**.
- Preservar todos os invariantes de isolamento: RLS por `unit_id`, trava de bypass do `global_admin` sobre conteúdo/auditoria.

**Non-Goals:**
- Mover pessoa entre unidades (fora de escopo; ver proposal).
- Excluir unidade permanentemente (só ativar/desativar).
- `unit_admin` gerenciando unidades (só `global_admin` nesta fatia).
- Compartilhamento entre unidades (fora do MVP no PRD).

## Decisions

### D1 — Só `global_admin` gerencia unidades

Todas as rotas de `/units` exigem `role === 'global_admin'` (403 caso contrário). Unidade é um conceito **cross-tenant**: um `unit_admin` pertence a exatamente uma unidade e não teria como escolher "sobre qual unidade" operar. Alternativa considerada: deixar `unit_admin` renomear a própria unidade — descartada para manter a fatia coesa e a autorização trivial (um único papel).

### D2 — Desativar é guardado pela precondição "unidade vazia", não por cascata

Desativar uma unidade só é permitido quando **nenhuma pessoa está vinculada** a ela (`SELECT count(*) FROM users WHERE unit_id = $1` deve ser 0); caso contrário, `409` ("unidade não está vazia"). Reativar é sempre permitido.

Isso foi escolhido sobre a alternativa de **cascatear** `status='disabled'` para cada pessoa da unidade porque:
- **Reversão limpa**: sem cascata, reativar a unidade não precisa lembrar quais pessoas já estavam desativadas *antes*. Com cascata, essa informação se perde.
- **O(1) em vez de O(n)**: uma única flag na unidade, sem varrer `users`.
- **Subsume dois guarda-corpos de graça**: como o próprio `global_admin` está vinculado à sua unidade, ela **nunca está vazia** enquanto ele existe ali → **não dá para desativar a própria unidade** (auto-trancamento impossível por construção). Idem para a unidade do bootstrap, que hospeda o primeiro admin.

Consequência importante: **não é preciso tocar o `attachTenantContext`**. Como uma unidade desativada é necessariamente vazia, não há sessão de usuário a cortar no login — ao contrário da desativação de *pessoa* (US 1.2, cenário 3), que precisa da releitura por requisição. A defesa contra "usuário numa unidade desativada" é preventiva (não se pode nem cadastrar, nem desativar unidade não vazia), não reativa.

### D3 — Defesa em profundidade explícita para própria unidade e bootstrap

Além da precondição de vazia (que já as protege), a rota recusa explicitamente desativar (a) a unidade do contexto autenticado (`unitId === ctx.unitId`) e (b) a unidade de bootstrap. É redundante com D2 no caminho feliz, mas fecha o caso de borda de uma unidade que fique vazia por acidente (ex.: alguém moveu o admin do bootstrap para outra unidade numa fatia futura). Barato e à prova de erro.

### D4 — Metadado de unidade usa o ramo `global_admin` da RLS, sem reabrir a trava de bypass

A policy `unit_isolation` de `units` já libera o ramo `global_admin` (`0002:13-21`), então `GET/POST/PATCH /units` para o `global_admin` são compatíveis com a RLS sem SQL especial. Isso **não** contradiz a trava de bypass documentada em `lib/access.ts`: aquela trava protege **conteúdo** (bytes de arquivo, itens de listagem, auditoria) — nunca o `global_admin` é "olho universal" sobre bytes de outra unidade. A lista de unidades é **metadado** (nome/status), não conteúdo tenant. Listar nomes de tenants para um seletor administrativo é exatamente o alcance legítimo do `global_admin`. Registrado aqui para que revisões futuras não confundam os dois casos.

### D5 — Status como enum espelhando `PersonStatus`

`units.status` usa os valores `active`/`desativado` no mesmo espírito de `PersonStatus` (`packages/shared/src/people.ts`). Nova coluna `NOT NULL DEFAULT 'active'`, com `CHECK`. DTOs novos (`UnitStatus`, `UnitResponse`, `CreateUnitRequest`, `UpdateUnitRequest`) em `packages/shared`, consumidos de `dist/`.

### D6 — Nome de unidade único

`units.name` ganha índice único. Renomear/criar com nome já existente retorna `409`, tratado no front como aviso no campo (espelhando o padrão de e-mail duplicado em `PessoaFormModal`). Racional: a lista de unidades vira um seletor no cadastro; nomes duplicados confundem o `global_admin`. Nota de migração: o `bootstrap.ts` já faz lookup por nome, então a unicidade é coerente com o comportamento existente.

### D7 — Seletor de unidade só para `global_admin`; `unit_admin` inalterado

No `PessoaFormModal`, o seletor de unidade aparece **apenas** para `global_admin`, alimentado por `GET /units` (só `active`). Para `unit_admin`, nada muda: sem seletor, e o servidor continua forçando `ctx.unitId` (`routes/users.ts:81`). Isso inverte a "Opção A" da spec `web-pessoas` apenas para o `global_admin` — o `unit_admin` permanece no comportamento atual. O servidor segue como guardião: mesmo que o front forjasse `unitId`, `unit_admin` é forçado à própria unidade.

### D8 — Sincronia dos 3 pontos de prefixo de API

Adicionar `/units` exige tocar, em sincronia, `apps/api/src/lib/api-prefixes.ts` (`API_PREFIXES`), `apps/web/vite.config.ts` (`API_PROXY_PREFIXES`) e `infra/terraform/locals.tf` (`api_proxy_prefixes`), além de `tenantScopedPrefixes` em `app.ts`. Coberto pelo `web-serving.test.ts`.

## Risks / Trade-offs

- **[Unidade só é desativável se vazia, e não há "mover pessoa"]** → Para desativar uma unidade com pessoas, hoje é preciso desativar/remover cada pessoa manualmente. Mitigação: aceitável no MVP; "mover pessoa entre unidades" fica registrado como mudança futura.
- **[`POST /users` precisa checar status da unidade destino]** → Um `global_admin` poderia tentar cadastrar em unidade desativada. Mitigação: check fail-closed no servidor (não só esconder no seletor), com teste.
- **[Inverter a "Opção A" da spec `web-pessoas`]** → Mudança de contrato de uma spec já arquivada. Mitigação: delta spec explícito modificando o requisito de cadastro; testes de `web-pessoas` atualizados para o comportamento por papel.
- **[Índice único em `units.name` sobre dados existentes]** → Se já houver nomes duplicados (dev/seed cria "Unidade A"/"B"/"Administração", sem colisão), a migration falha. Mitigação: nomes atuais são distintos; a migration assume base coerente (prod tem só a unidade do bootstrap).

## Migration Plan

1. Migration numerada nova: `ALTER TABLE units ADD COLUMN status ... DEFAULT 'active'`; `CREATE UNIQUE INDEX` em `units.name`. Aplicada por `db/migrate.ts` na ordem.
2. Deploy da API com `unitsRouter` e a checagem em `POST /users`; deploy do front com a tela de unidades e o seletor.
3. Rollback: a coluna `status` e o índice único são aditivos; reverter é dropá-los. Nenhum dado de conteúdo é tocado. O código antigo ignora `status` (default `active`), então uma janela de versões mistas é segura.

## Open Questions

- Nenhuma bloqueante. (Ordenação/paginação da lista de unidades pode ficar simples — ordenar por `name` — e evoluir depois se o número de unidades crescer.)
