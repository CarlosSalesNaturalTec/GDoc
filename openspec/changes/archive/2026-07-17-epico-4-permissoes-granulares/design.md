# Design — epico-4-permissoes-granulares

## Context

O controle de acesso a conteúdo hoje é **unidade + posse**: a RLS por `unit_id`
isola tenants (defesa em profundidade) e as rotas checam `owner_id = ctx.userId`
na aplicação. Não há tabela de permissões. Consequências:

- `routes/folders.ts` só lista/navega o que o próprio usuário criou
  (`WHERE owner_id = $1`); `GET /folders/:id/contents` exige ser dono da pasta.
- `routes/files.ts` para **`view-url` e `download-url`** consulta o arquivo só sob
  RLS (`findFileById` → `SELECT * FROM files WHERE id = $1`) e **não** verifica
  posse — logo qualquer pessoa da mesma unidade emite URL assinada e grava
  auditoria para qualquer arquivo da unidade. Já `PATCH /files/:id` e
  `replace-url` checam `owner_id === ctx.userId` (comentário no código: "Checagem
  por dono até o Épico 4").

O Épico 4 (PRD, US 4.1/4.2) introduz permissão granular. Esta é a **Fatia A**:
o motor `grants` **por pessoa** e sua imposição fail-closed em toda a aplicação.
Restrições herdadas e não renegociadas (config.yaml + CLAUDE.md): bucket privado;
permissão checada no servidor **antes** de qualquer URL assinada; TTL curto
diferenciado (view ~5 min, download ~15–30 min); toda tabela de unidade com
`unit_id` + policy RLS; sempre `SET LOCAL` por transação (pooler em modo
transação); migração aplicada não é editada — sempre um arquivo novo.

## Goals / Non-Goals

**Goals:**

- Tabela `grants` por pessoa, cobrindo os cinco verbos do PRD
  (`view`/`download`/`upload`/`rename`/`delete`), sobre pasta **ou** arquivo.
- Resolução de acesso única e reutilizável: **dono OU grant do verbo exigido**,
  sem herança de ancestral, fail-closed.
- Fechar a US 4.2 (link direto sem permissão → 403, sem preview e sem auditoria)
  e completar a US 2.1 cenário 2 (listagem = "criei OU me foi liberado").
- Endpoints administrativos de conceder/listar/revogar, com o mesmo modelo de
  papel + RLS já usado em `routes/users.ts`.

**Non-Goals:**

- **Grupos** como destinatário de grant (US 4.1 cita "pessoa ou grupo") — fatia
  futura; ver D7.
- **US 4.3** (expiração, aviso prévio, corte automático) — depende de rotina
  agendada; Fatia B.
- **Alcance administrativo amplo sobre conteúdo de terceiros** (admin ver/gerir
  todo o conteúdo da unidade sem grant) — é o Épico 5; ver D6.
- **Motor de compactação da US 3.3** — destravado por esta fatia, mas não
  implementado aqui.
- Mover/renomear/excluir **pasta**; histórico de versões; UI (React) — fora.

## Decisions

### D1 — Modelo `grants`: linha por (pessoa, recurso, verbo)

Tabela `grants` com granularidade máxima e chave natural composta:

```
grants(
  id            uuid pk,
  unit_id       uuid not null references units,        -- tenant scope (RLS)
  subject_user_id uuid not null references users,       -- a quem foi concedido
  resource_type text not null check in ('folder','file'),
  resource_id   uuid not null,                          -- id da pasta OU do arquivo
  permission    text not null check in ('view','download','upload','rename','delete'),
  granted_by    uuid not null references users,         -- admin que concedeu (trilha)
  created_at    timestamptz not null default now()
)
UNIQUE (unit_id, subject_user_id, resource_type, resource_id, permission)
INDEX  (subject_user_id, resource_type, permission)     -- lookup na resolução
```

Uma linha por verbo (não um bitmask nem um array): conceder "apenas visualizar"
(US 4.1 cenário 1) é uma linha; o índice único torna reconceder **idempotente**
(`ON CONFLICT DO NOTHING`) e revogar um verbo é apagar uma linha, sem ler/reescrever
um conjunto. `resource_id` é polimórfico (sem FK, porque aponta ora para `folders`
ora para `files`) — a integridade "o recurso existe e é da unidade" é validada na
aplicação na hora de conceder (RLS garante a unidade), e a limpeza em exclusão de
recurso fica para o Épico 6 (Lixeira), quando existir o ciclo de exclusão.
`granted_by` é a trilha de "quem concedeu", útil ao Épico 7.

_Alternativas descartadas:_ (a) um verbo por coluna booleana — engessa a lista de
verbos e complica idempotência; (b) `permissions text[]` numa linha por
(pessoa,recurso) — revogar/conceder um verbo vira read-modify-write com corrida;
(c) FKs separadas `folder_id`/`file_id` nuláveis — duas colunas nuláveis + CHECK
de exclusividade, mais ruído que `(resource_type, resource_id)`.

### D2 — Resolução de acesso: dono OU grant, sem herança, fail-closed

Um helper único `lib/access.ts` centraliza a regra, chamado dentro da mesma
`withTenantTransaction(ctx)` da rota (RLS já ativa):

```
hasAccess(client, ctx, resourceType, resourceId, permission) :=
    isOwner(resourceType, resourceId, ctx.userId)
 OR EXISTS grant(unit=ctx.unit, subject=ctx.userId,
                 resourceType, resourceId, permission)
```

Regras:

- **Dono sempre acessa** o próprio recurso, em qualquer verbo, sem precisar de
  grant (posse é a permissão implícita máxima sobre o que você criou).
- **Sem herança** (US 4.1 cenário 2): a checagem olha **exatamente** o recurso
  pedido. Grant de `view` na pasta F **não** concede `view` aos arquivos/subpastas
  dentro de F — cada um exige grant próprio (ou posse). Não há walk de ancestrais
  na resolução.
- **Fail-closed:** negado ⇒ **403**, sem emitir URL e **sem gravar auditoria** —
  idêntico ao tratamento que hoje já existe quando a RLS esconde o arquivo. Não se
  distingue "não existe" de "existe mas sem permissão" (não vaza existência),
  mantendo o padrão de `routes/folders.ts`.

A checagem de acesso a conteúdo roda sob o `ctx` **real** do usuário (papel
`collaborator`/`unit_admin`), então a RLS continua garantindo o isolamento de
unidade por baixo: um grant nunca cruza unidade porque tanto o recurso quanto o
`subject` são da mesma unidade (cross-unit é impossível de criar — ver D4).

### D3 — Verbo por endpoint

| Endpoint | Recurso | Verbo exigido (se não for dono) |
|---|---|---|
| `POST /files/:id/view-url` | arquivo | `view` |
| `POST /files/:id/download-url` | arquivo | `download` |
| `PATCH /files/:id` (renomear) | arquivo | `rename` |
| `POST /files/:id/replace-url` (substituir) | arquivo | `rename` |
| `POST /files/upload-url` em pasta X | pasta X | `upload` |
| `POST /files/upload-urls` (âncora + subpastas) | pasta-âncora | `upload` |
| `GET /folders/:id/contents` (abrir) | pasta | `view` |

Observações:

- **renomear e substituir compartilham o verbo `rename`** — o PRD trata
  "renomear/substituir" como uma capacidade única (US 2.2, FR #7).
- **`upload` só é exigido ao enviar para dentro de pasta de outra pessoa.** Enviar
  para a **raiz da unidade** (sem `folderId`) ou para pasta própria continua livre
  para o remetente — a raiz não é um recurso concedível e o dono do destino é o
  próprio. As subpastas criadas por `ensureFolderPath` durante um upload em lote
  nascem com `owner_id` do remetente, então não exigem grant entre si.
- **`delete`** já existe no enum e pode ser concedido, mas **nenhum endpoint o
  consome nesta fatia** — não há rota de exclusão até o Épico 6 (Lixeira). É schema
  pronto para o verbo, sem imposição órfã.

### D4 — `grants` é tenant-scoped: `unit_id` + RLS (regra do projeto)

`grants` carrega dado de uma unidade, então segue a regra dura do config.yaml:
coluna `unit_id` + `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy `unit_isolation`
no **mesmo formato** de `0002_enable_rls.sql`
(`unit_id = NULLIF(current_setting('app.current_unit', true),'')::uuid OR
current_setting('app.user_role', true) = 'global_admin'`, com `WITH CHECK`
espelhando o `USING`). Efeitos:

- Ao **conceder**, o `INSERT` roda sob o `ctx` do admin; o `WITH CHECK` recusa
  gravar grant com `unit_id` ≠ unidade do admin (a menos que `global_admin`).
  A aplicação preenche `unit_id` a partir do recurso, e o recurso só é visível se
  for da unidade — logo é impossível conceder cruzando unidade.
- Ao **resolver**, o `SELECT` do grant sob o `ctx` do colaborador só enxerga
  grants da própria unidade; o filtro de aplicação adiciona `subject_user_id =
  ctx.userId`.
- Ao **listar** (admin), a RLS restringe `unit_admin` à própria unidade e dá
  bypass a `global_admin`, exatamente como em `routes/users.ts`.

### D5 — Conceder/listar/revogar é ação de administrador

Os endpoints `/grants` exigem papel `unit_admin` ou `global_admin` (helper
`isAdmin(ctx)`, idêntico ao de `routes/users.ts`) — a persona da US 4.1 é
"Administrador". Duas camadas, como no CRUD de pessoas: a checagem de papel barra
o `collaborator` de plano; a RLS garante que `unit_admin` não conceda/enxergue
grant fora da própria unidade mesmo se a checagem de aplicação falhasse. Um
colaborador **não** compartilha os próprios arquivos nesta fatia (o PRD não prevê
auto-compartilhamento; se vier, é fatia futura). Conceder um recurso inexistente
ou de outra unidade ⇒ 404 (mesmo "sem vazar" das demais rotas); conceder a uma
pessoa inexistente/de outra unidade ⇒ 404/403.

`POST /grants` aceita uma **lista de verbos** num recurso para uma pessoa
(`{ subjectUserId, resourceType, resourceId, permissions: [...] }`) e insere as
linhas de forma idempotente — cobre "concedo apenas visualizar" (um verbo) e
concessões compostas numa só chamada, na mesma transação.

### D6 — Admin não ganha acesso a conteúdo aqui (fronteira com o Épico 5)

Papel de admin habilita **conceder** permissão, **não** acessar conteúdo de
terceiros. `hasAccess` (D2) é dono-ou-grant para **todos** os papéis — inclusive
`unit_admin`/`global_admin`. Um admin que queira visualizar um arquivo de outra
pessoa concede o verbo a si mesmo (fica na trilha `granted_by`). O alcance amplo
"o admin vê e gere todo o conteúdo da unidade" é a US 5.1 (Épico 5), fatia
seguinte, onde a resolução ganhará o ramo "admin da unidade do recurso". Manter
essa fronteira evita que a Fatia A embuta silenciosamente o Épico 5 e mantém a
regra de conteúdo uniforme e auditável. Nota: para `global_admin`, cujo `ctx` dá
bypass de RLS, isso **restringe** o acesso a conteúdo (antes o bypass deixava
`view-url` funcionar cross-unit) — coerente, porque `global_admin` existe para
agregados de painel (Épico 8), não para ler arquivos arbitrários.

### D7 — Grant por pessoa; grupo é fatia futura

A US 4.1 diz "pessoa ou grupo", mas **grupo não existe** — nem tabela, nem
qualquer outra menção no PRD além dessa. Modelar grupo agora significaria inventar
`groups` + `group_members` + generalizar o `subject` para (user|group), dobrando o
modelo por um conceito ainda sem contorno. `subject_user_id` referencia `users`
diretamente; quando grupo entrar, migra-se para um `subject_type`/`subject_id`
polimórfico (aditivo) e a resolução ganha "grants dos grupos de que sou membro" —
sem reescrever o que esta fatia entrega. Corte coerente com o fatiamento
"depender do que não existe fica para depois" já usado nos Épicos 2 e 3.

### D8 — Listagem de pasta com itens liberados (fecha US 2.1 cenário 2)

`listContents` deixa de ser `WHERE owner_id = $1` e passa a devolver **itens
próprios OU com grant `view`**, por tipo:

```
folders visíveis := owner_id = ctx.userId
                 OR id IN (grants: subject=ctx.userId, type='folder', perm='view')
files   visíveis := owner_id = ctx.userId
                 OR id IN (grants: subject=ctx.userId, type='file',   perm='view')
```

aplicado tanto na raiz quanto dentro de uma pasta. Como não há herança (D2), abrir
uma pasta liberada mostra só os filhos que **também** foram liberados (ou próprios)
— exatamente a US 4.1 cenário 2. `GET /folders/:id/contents` passa a permitir a
abertura por dono-ou-`view`-grant da pasta (antes: só dono).

## Risks / Trade-offs

- **Furos atuais de `view-url`/`download-url` são fechados → mudança de
  comportamento observável.** Antes, qualquer um da unidade emitia URL; agora
  não-donos sem grant recebem 403. → É justamente o objetivo (US 4.2); os testes
  atuais que assumiam o comportamento antigo são atualizados junto.
- **`global_admin` perde acesso a `view-url` cross-unit** (D6). → Intencional;
  `global_admin` é para agregados (Épico 8), não leitura de arquivos. Registrado
  para não surpreender quem espere o bypass.
- **`resource_id` sem FK** (polimórfico). → Aceito: integridade de existência é
  checada na concessão sob RLS; grants órfãos após exclusão de recurso são
  inertes (a resolução exige o recurso existir para ter dono/aparecer) e a limpeza
  formal entra com o ciclo de exclusão do Épico 6.
- **N+1 potencial na listagem/resolução** se cada item disparar uma consulta de
  grant. → Mitigado usando subconsulta/`IN` por tipo (D8) e índice
  `(subject_user_id, resource_type, permission)`; a resolução de item único
  (view/download) é uma checagem `EXISTS` indexada.
- **Sem expiração ainda** (US 4.3 fora). → Grants são permanentes até revogação
  manual nesta fatia; a Fatia B adiciona `expires_at` de forma aditiva.

## Migration Plan

1. `0007_grants.sql` (aditiva, arquivo novo — nunca edita migração aplicada):
   cria `grants`, índices e RLS. Aplicada por `npm run migrate` (mesmo runner de
   sempre), idempotente via `schema_migrations`.
2. `packages/shared`: adicionar `permissions.ts`, exportar no `index.ts`,
   `npm run build --workspace packages/shared` (consumido compilado).
3. API: `lib/access.ts`, `routes/grants.ts`, registro em `app.ts`, e troca das
   checagens em `routes/files.ts`/`routes/folders.ts`.
4. Testes verdes; sem passo de infra/GCP nem de sandbox.

**Rollback:** a feature é aditiva; reverter é remover o router/checagens e a
migração `0007` não precisa ser desfeita (tabela vazia é inerte). Nenhuma migração
anterior é tocada.

## Open Questions

- **Revogação e a auditoria de acesso já emitida** — revogar um grant não apaga os
  `audit_events` de acessos passados (correto); nenhuma ação necessária, só
  registrado.
- **`GET /grants` — escopo do filtro** — a fatia expõe listar por recurso
  (`resourceType`+`resourceId`); listar "tudo que a pessoa X recebeu" pode ser
  útil à administração, mas fica para quando a UI de gestão pedir (não bloqueia a
  US 4.1).
