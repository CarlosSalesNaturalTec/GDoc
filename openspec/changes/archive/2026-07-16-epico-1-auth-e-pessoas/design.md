# Design — epico-1-auth-e-pessoas

## Context

A fundação já provê os seams (`AuthPort`, `DatabasePort`, `SecretsPort`,
`StoragePort`), a RLS por `unit_id` e o mecanismo `withTenantTransaction` que faz
`SET LOCAL app.current_unit` / `app.user_role` por requisição. O que falta é a
identidade real. Hoje:

- `middleware/tenant-context.ts` lê `x-gdoc-user-id`, faz um lookup do usuário sob
  bypass `global_admin` e popula `req.tenantContext`. É um placeholder assumido.
- `AuthPort` só sabe `hashPassword` / `verifyPassword` (argon2). Não há sessão.
- `AUTH_SESSION_SECRET` **já existe** no `.env.example` e é provisionado no Secret
  Manager pelo Terraform (`secret_manager.tf`) — a plumbing do segredo está pronta.
- A tabela `users` (migração `0001`) tem só `unit_id`, `email`, `password_hash`,
  `role`, `storage_used_bytes`. Faltam os campos de pessoa do PRD e um status.

Restrições de arquitetura (herdadas, não renegociadas): backend é o único guardião
de permissão; toda tabela tenant-scoped mantém `unit_id` + policy RLS; Cloud Run é
stateless com connection pooling em modo transação — nunca `SET` de sessão.

## Goals / Non-Goals

**Goals:**

- Login/logout/`me` reais (US 1.2), com sessão verificável em cada requisição.
- CRUD de pessoas pela administração (US 1.1), com os campos do PRD, e-mail único e
  alcance por papel.
- Substituir a resolução de identidade placeholder **preservando** o contrato de
  tenancy (mesma assinatura de `attachTenantContext`, mesmo `req.tenantContext`,
  mesmo `SET LOCAL` por transação).
- Semear o primeiro `global_admin` de forma idempotente.

**Non-Goals:**

- Qualquer UI/SPA (`apps/web` segue reservado).
- Grupos de destinatários, permissões granulares e avisos de expiração (Épico 4).
- Recuperação de senha, troca de senha pelo próprio usuário, MFA, rate-limiting de
  login (endurecimento fica para mudança futura; ver Riscos).
- Login por Google/SSO (fora do MVP no PRD).

## Decisions

### D1 — Sessão: JWT HMAC stateless, revalidado no banco a cada requisição

Emitimos um **JWT assinado com HMAC-SHA256** usando `AUTH_SESSION_SECRET` (lido via
`SecretsPort`), entregue como **cookie `HttpOnly`, `Secure`, `SameSite=Strict`**.
O payload carrega `sub` (userId) e `exp`; a unidade e o papel **não** são confiados
do token — são relidos do banco a cada requisição.

Por quê: Cloud Run é stateless e o pooler está em modo transação, então uma tabela
de sessão server-side adicionaria escrita/leitura por request sem ganho real. O JWT
evita estado, e o requisito de "conta desativada encerra o acesso" (US 1.2 cenário
3) é atendido porque o middleware **já** faz um lookup do usuário por requisição —
basta essa query passar a checar `status = 'active'`. Assim uma desativação tem
efeito imediato, sem lista de revogação.

- *Alternativa considerada — sessão server-side (tabela `sessions`)*: revogação
  trivial, mas custo por request e mais estado para isolar por RLS. Rejeitada pelo
  overhead sem benefício, já que o lookup por request já existe.
- *Alternativa — confiar unit/role do JWT*: evitaria o lookup, mas um papel/unidade
  alterado (ou conta desativada) só teria efeito no próximo login. Rejeitada:
  contradiz "validado no servidor a cada ação" (RNF de Segurança).

Cookie em vez de `Authorization: Bearer`: como não há SPA ainda, o cookie
`HttpOnly` é o default mais seguro (imune a XSS-exfiltration) e casa com o browser
direto. Quando a SPA chegar, mantém-se cookie + CSRF token, decidido no change do
frontend.

### D2 — Seam de sessão: estender `AuthPort` com `issueSession` / `verifySession`

`AuthPort` ganha `issueSession(claims)` e `verifySession(token)` além do
hash/verify de senha. A implementação (`Argon2AuthPort` ou um `JwtAuthPort`
dedicado) assina/verifica com o segredo obtido do `SecretsPort`.

Por quê: mantém o padrão "um seam por responsabilidade transversal" e deixa a
resolução de identidade testável sem tocar em cloud. O segredo nunca é lido de
`process.env` direto — sempre via `SecretsPort`, coerente com o resto do código.

- *Alternativa — novo `SessionPort` separado*: mais limpo conceitualmente, mas
  sessão e senha são a mesma preocupação (autenticação) e sempre usadas juntas no
  fluxo de login. Fica como refino futuro se o `AuthPort` inchar.

### D3 — Modelo de dados: migração `0003` estende `users` (não cria tabela nova)

Adiciona a `users`: `full_name`, `phone`, `job_title` (função/cargo), `work_area`
(área de trabalho), `notes` (observação), e `status text NOT NULL DEFAULT 'active'
CHECK (status IN ('active','disabled'))`. `email` já é `UNIQUE` na `0001` — atende
o e-mail único da US 1.1 cenário 2. `unit_id` e a policy RLS existentes já cobrem as
novas colunas (a policy é por linha, não por coluna), então **não** há nova policy;
só reconferir que `users` está sob `FORCE ROW LEVEL SECURITY`.

Por quê estender e não uma tabela `people` separada: `users` já é a entidade de
pessoa (dona de arquivos, sujeito da auditoria e da cota). Separar duplicaria a
chave e o `unit_id`. O PRD trata "pessoa" e "usuário" como a mesma entidade.

Regra do repositório respeitada: **não editar migração aplicada** (`0001`); toda
mudança de schema é um arquivo novo em ordem (`0003_people_fields.sql`).

### D4 — Alcance do CRUD por papel, imposto por RLS + checagem de aplicação

- `global_admin`: cria/lista/edita pessoas de qualquer unidade (informa `unit_id`).
- `unit_admin`: só a própria unidade — a RLS já filtra o `SELECT`/`UPDATE` à
  `current_setting('app.current_unit')`; na criação, a aplicação força
  `unit_id = ctx.unitId` (ignora unidade informada divergente) e recusa criar
  `global_admin`.
- `collaborator`: sem acesso ao CRUD (403).

Defesa em profundidade: mesmo que a checagem de papel na aplicação falhasse, a RLS
impede um `unit_admin` de enxergar/alterar pessoa de outra unidade. Coerente com o
princípio "nunca depender só da aplicação para isolamento".

### D5 — Bootstrap do primeiro `global_admin` via seed idempotente

`db/seed.ts` cria um `global_admin` inicial (unidade "Administração"/bootstrap) só
se não existir nenhum `global_admin`. Credenciais iniciais vêm de env
(`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`); em dev, valores do
`.env.example`. Resolve o círculo criador/criatura: a partir desse admin, todo o
resto das pessoas nasce pelo CRUD autenticado.

## Risks / Trade-offs

- **Sem rate-limiting/lockout no login** → mitigação: fora de escopo declarado, mas
  a resposta genérica (D-login) e argon2 (custo por tentativa) reduzem a superfície;
  registrar como endurecimento futuro antes de dados reais em prod.
- **Segredo de sessão fraco em dev** (`dev-only-insecure-secret-change-me`) →
  mitigação: em prod vem do Secret Manager (`random_password`), nunca do `.env`;
  o `SecretsPort` já separa as origens.
- **JWT sem revogação explícita** → mitigação: a revalidação no banco por request
  (D1) torna desativação/mudança de papel efetivas de imediato; o único vetor
  remanescente é a janela de `exp` para um usuário que continua `active` — aceitável
  com TTL curto (ex.: algumas horas) + logout que limpa o cookie.
- **Troca do placeholder quebra os testes atuais** que setam `x-gdoc-user-id` →
  mitigação: atualizar os helpers de teste (`test-db.ts`) para emitir uma sessão
  válida (ou um modo de teste do `AuthPort`), mantendo os testes de RLS/permissão
  verdes.

## Migration Plan

1. Migração `0003_people_fields.sql` (colunas + `status`); rodar `npm run migrate`.
2. Estender `AuthPort` + adapter (issue/verify session); ler segredo via
   `SecretsPort`.
3. Reescrever `attachTenantContext` para resolver identidade da sessão (cookie),
   mantendo assinatura e `SET LOCAL`.
4. `routes/auth.ts` (login/logout/me) e `routes/users.ts` (CRUD) montados em
   `app.ts`; `/auth/*` sem exigir sessão prévia, `/users/*` e `/files/*` atrás do
   middleware.
5. `db/seed.ts` idempotente para o primeiro `global_admin`.
6. Atualizar `.env.example` (chaves de bootstrap admin, se novas) e os helpers de
   teste.

**Rollback:** a mudança é aditiva no schema (colunas com default); reverter é
redeploy da imagem anterior. A migração `0003` não destrói dados.

## Open Questions

- TTL exato da sessão (proposta: 8h) e se haverá "lembrar-me" — decidir na
  implementação; não bloqueia o design.
- Estrutura da unidade de bootstrap: reusar uma unidade seed existente ou criar uma
  "Administração" dedicada — a definir no seed, sem impacto em spec.
