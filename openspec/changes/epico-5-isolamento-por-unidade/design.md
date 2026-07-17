# Design — epico-5-isolamento-por-unidade

## Context

O isolamento entre unidades já é imposto na base: toda tabela tenant-scoped
tem `unit_id` + `FORCE ROW LEVEL SECURITY` com a policy `unit_isolation`
(`0002_enable_rls.sql`), e `withTenantTransaction(ctx)` faz `SET LOCAL
app.current_unit`/`app.user_role` por transação. Sobre esse piso, o alcance
por papel já vale para **pessoas** (`routes/users.ts`) e **permissões**
(`routes/grants.ts`): o `unit_admin` gerencia apenas a própria unidade (dupla
camada — checagem de papel na aplicação + RLS por baixo).

O que falta para a US 5.1 é o alcance do admin sobre **conteúdo** (pastas e
arquivos). Hoje a resolução única `hasAccess` (`lib/access.ts`) é **dono OU
grant do verbo**, aplicada a *todos* os papéis — inclusive `unit_admin`. Isso
foi uma escolha deliberada do Épico 4 (design.md D6: "Papel de admin habilita
conceder permissão, não acessar conteúdo de terceiros… o alcance amplo é a
US 5.1, fatia seguinte, onde a resolução ganhará o ramo «admin da unidade do
recurso»"). Este change entrega exatamente esse ramo e prova o cenário 2
(nenhuma pessoa alcança outra unidade), sem tocar schema nem infra — é lógica
de aplicação sobre o isolamento que já existe.

Restrições herdadas e não renegociadas (config.yaml + CLAUDE.md): isolamento
por `unit_id` + RLS é a fronteira dura (nunca só checagem de aplicação);
bucket privado com URL assinada emitida **após** a checagem de permissão, TTL
curto diferenciado (view ~5 min, download ~15–30 min); `SET LOCAL` por
transação; migração aplicada não é editada.

## Goals / Non-Goals

**Goals:**

- Ramo **"admin da unidade do recurso"** em `hasAccess`: o `unit_admin`
  acessa qualquer recurso da **própria unidade** em todos os verbos
  (`view`/`download`/`rename`/`upload`), sem grant a si mesmo — fechando a
  US 5.1 cenário 1 (pastas e arquivos), com pessoas/permissões já cobertas.
- Listagem e navegação com alcance administrativo: o admin vê **todo** o
  conteúdo da unidade; o `collaborator` mantém "próprios OU liberados".
- Prova verificável do cenário 2: colaborador e admin **nunca** alcançam
  outra unidade — por listagem, resolução de acesso ou link direto (403, sem
  vazar existência).

**Non-Goals:**

- **Ampliar o `global_admin` para leitura de conteúdo** — permanece como o
  Épico 4 o deixou (agregados de painel, sem leitura ampla de arquivos); ver
  D3.
- **Verbo `delete` / lixeira** — nenhum endpoint consome `delete` até o
  Épico 6; o ramo admin cobre o verbo no motor, mas sem rota que o exercite.
- **UI (React), auditoria consultável pelo admin (Épico 7), painel por
  alcance (Épico 8), busca (Épico 9)** — fora.
- **Mover/renomear/excluir pasta; histórico de versões** — fora, como nos
  épicos anteriores.

## Decisions

### D1 — Ramo admin de unidade em `hasAccess` (dono OU grant OU admin-da-unidade)

`hasAccess` (`lib/access.ts`) passa a carregar o `unit_id` do recurso junto do
`owner_id` e a resolver:

```
hasAccess(client, ctx, type, id, perm) :=
     resource existe (visível sob RLS)
  AND ( resource.owner_id = ctx.userId                       -- dono
     OR EXISTS grant(subject=ctx.userId, type, id, perm)     -- grant do verbo
     OR ( ctx.role = 'unit_admin'                            -- admin da unidade
          AND resource.unit_id = ctx.unitId ) )
```

Regras:

- **O ramo admin ignora o verbo:** o `unit_admin` acessa em qualquer verbo
  (`view`/`download`/`rename`/`upload`), coerente com "gerencia os arquivos da
  minha unidade" (US 5.1). Dono e grant seguem exatamente como no Épico 4.
- **A checagem `resource.unit_id = ctx.unitId` é explícita**, não apenas
  implícita pela visibilidade RLS — defesa em profundidade dupla, no mesmo
  espírito do D4 do Épico 4 (aplicação + RLS). Sob o `ctx` do `unit_admin` a
  RLS já esconde recurso de outra unidade (o `SELECT` retorna vazio ⇒
  fail-closed), então na prática as duas concordam; a comparação explícita
  documenta a intenção e não depende só do filtro invisível.
- **Fail-closed intacto:** recurso inexistente (ou de outra unidade, escondido
  pela RLS) ⇒ `false` ⇒ 403 sem URL nem auditoria, sem distinguir "não existe"
  de "sem permissão". Idêntico ao Épico 4.

_Alternativa descartada:_ conceder a si mesmo um grant (fluxo que o Épico 4 D6
sugeriu como paliativo) — burocrático, polui a trilha `granted_by` com
autoconcessões e não escala ("gerenciar toda a unidade" viraria N concessões).
O ramo de papel é a expressão direta da US.

### D2 — Listagem/navegação: admin vê tudo da unidade

`visibleResourceClause` (`lib/access.ts`) e `listContents`/abertura de pasta
(`routes/folders.ts`) passam a ramificar por papel:

```
collaborator : owner_id = ctx.userId OR id IN (grants view)   -- Épico 4, inalterado
unit_admin   : TRUE                                            -- toda a unidade
```

Para o `unit_admin` o predicado de visibilidade colapsa em "todas as linhas
visíveis" — e como a query roda sob o `ctx` do admin, a **RLS já restringe as
linhas à unidade dele**, então "TRUE" significa "tudo da minha unidade", nunca
de outra. Efeitos:

- `GET /folders/root/contents` e `/folders/:id/contents` devolvem ao admin
  todas as pastas/arquivos do nível; abrir uma pasta de terceiros é permitido
  porque `hasAccess(...VIEW)` agora retorna `true` pelo ramo D1.
- `buildBreadcrumb` sobe por `parent_id` sob a mesma transação/RLS: os
  ancestrais da unidade aparecem para o admin independentemente de dono — sem
  vazar cross-unit (RLS corta) e sem novo código de trilha.

### D3 — `global_admin` permanece agregador (sem leitura ampla de conteúdo)

O ramo D1 é **`unit_admin`**, não "qualquer admin". O `global_admin` fica como
o Épico 4 o deixou (design.md D6): existe para agregados do painel (Épico 8),
não para ler arquivos arbitrários — o bypass de RLS dá alcance de *contagem*,
não de *conteúdo*. Manter isso aqui evita reabrir, de carona numa fatia sobre o
**Administrador de Unidade**, uma decisão de segurança que o Épico 4 estreitou
de propósito.

_Tensão registrada:_ o RF #3 fala em "alcance de visibilidade correspondente"
para o Administrador Global. Não há, porém, US neste MVP que exija o
`global_admin` **lendo** conteúdo cross-unit (a US 5.1 é do Unit Admin, o painel
do Épico 8 é agregado). Ampliar o `global_admin` para leitura de conteúdo, se
vier a ser necessário, é decisão própria — não se infiltra nesta fatia. Ver
Open Questions.

### D4 — Cenário 2 é prova, não código novo de isolamento

O isolamento do colaborador contra outra unidade **já é imposto pela RLS**:
listagem sob `ctx` do colaborador só vê a própria unidade; `hasAccess` sobre
recurso de outra unidade retorna `false` (o `SELECT` vem vazio); link direto ao
id de arquivo de outra unidade cai no mesmo 403 sem vazar existência. A US 5.1
cenário 2 entra como **cobertura de teste de ponta a ponta** — listagem,
resolução e link direto cross-unit — que ancora o requisito e protege contra
regressão, não como novo mecanismo. Isso é coerente com a regra do projeto:
"nunca depender só de checagem na aplicação para isolamento entre unidades" — a
prova exercita justamente a RLS por baixo.

## Risks / Trade-offs

- **Mudança de comportamento observável para `unit_admin`.** Antes, admin
  não-dono sem grant recebia 403 em `view-url`/`download-url`/`contents` da
  própria unidade; agora é autorizado e **auditado** (a auditoria de acesso do
  Épico 4 grava normalmente). → É o objetivo da US 5.1 cenário 1. Os testes do
  Épico 4 que fixaram o 403 do admin (registrados no D6/Risks do Épico 4 como
  intencional-por-ora) são atualizados para o novo comportamento.
- **Admin passa a poder ler qualquer arquivo da unidade.** → É a semântica da
  persona (Administrador de Unidade) no PRD; toda leitura fica na trilha de
  auditoria (Épico 7 a exporá), preservando governança comprovável.
- **Tensão RF #3 × `global_admin`** (D3). → Deliberadamente fora de escopo e
  registrado; nenhuma US do MVP depende de `global_admin` ler conteúdo.
- **Desempenho da listagem do admin** — o predicado vira "TRUE", removendo a
  subconsulta de grant. → Fica **mais barato** que o caminho do colaborador,
  sem N+1; a RLS aplica o filtro de unidade por índice.

## Migration Plan

1. Sem migração de schema — `unit_id`, RLS e `role` no `ctx` já existem. Nenhum
   arquivo em `apps/api/src/db/migrations`.
2. API: ajustar `lib/access.ts` (`hasAccess` carrega `unit_id` e ganha o ramo
   admin; `visibleResourceClause` ganha a variante admin) e `routes/folders.ts`
   (`listContents`/abertura ramificam por papel). `routes/files.ts` e o upload
   reaproveitam `hasAccess` sem mudança de assinatura.
3. `packages/shared` — sem novos tipos (o `role` e os enums já existem).
4. Testes: atualizar os do Épico 4 que assumiam admin sem acesso; adicionar
   suíte de isolamento cross-unit (listagem, resolução, link direto). Verde no
   mesmo runner sequencial (`fileParallelism: false`), sem passo de infra/GCP
   nem de sandbox.

**Rollback:** a mudança é um ramo aditivo na resolução; reverter é remover o
ramo admin de `hasAccess`/`visibleResourceClause` e a ramificação de
`listContents`, voltando ao comportamento dono-ou-grant do Épico 4. Nenhum dado
migrado, nada a desfazer no banco.

## Open Questions

- **Alcance de conteúdo do `global_admin`** — se o painel do Épico 8 ou uma
  operação global exigir o Administrador Global lendo/gerindo arquivos
  cross-unit, isso será uma decisão própria (reabrindo o D6 do Épico 4), não
  desta fatia. Registrado, não resolvido aqui.
- **Verbo `delete` no ramo admin** — o motor já autoriza o admin em `delete`,
  mas nenhuma rota o consome até o Épico 6 (Lixeira). Sem imposição órfã; só
  schema/motor prontos.
