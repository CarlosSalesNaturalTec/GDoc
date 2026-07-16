# Proposal — epico-1-auth-e-pessoas

## Why

A fundação (`bootstrap-infrastructure`, arquivada) entregou os trilhos — RLS por
unidade, URLs assinadas, auditoria, cotas, IaC e CI/CD — mas **nenhuma feature do
PRD**. O produto ainda não sabe *quem* é o usuário: `middleware/tenant-context.ts`
confia num header `x-gdoc-user-id` (placeholder deliberado) e `Argon2AuthPort` é só
o esqueleto de hash, sem login nem sessão. Também não existe forma de cadastrar
pessoas.

O Épico 1 do PRD (`docs/prd_final.md`, US 1.1 e US 1.2) é o pré-requisito de todas
as demais épicas: permissões (Épico 4), auditoria consultável (Épico 7), painel por
alcance (Épico 8) e o próprio isolamento de navegação (US 2.1) só podem ser
validados quando "quem está autenticado" for confiável. Esta mudança entrega essa
identidade real — **somente backend/API**.

## What Changes

- **Autenticação real por usuário/senha** (US 1.2): `POST /auth/login` verifica a
  senha via `AuthPort` (argon2) e emite uma sessão; `POST /auth/logout` a encerra;
  `GET /auth/me` devolve a identidade corrente.
- **BREAKING (interno):** substitui a resolução de identidade placeholder de
  `attachTenantContext` — que lia `x-gdoc-user-id` — pela sessão autenticada. O
  **mecanismo de tenancy não muda**: continua abrindo uma transação por requisição
  com `SET LOCAL app.current_unit` / `app.user_role` (RLS segue como fronteira
  real). Só a origem da identidade muda (sessão em vez de header).
- **Conta desativada bloqueia login** (US 1.2, cenário 3): a identidade é
  revalidada contra o banco a cada requisição (o middleware já faz esse lookup), de
  modo que desativar uma conta encerra o acesso mesmo com sessão válida em mãos.
- **Credenciais inválidas não revelam** se o erro foi usuário ou senha (US 1.2,
  cenário 2): resposta única e genérica.
- **CRUD de pessoas pela administração** (US 1.1): `POST/GET/PATCH /users` para
  cadastrar, listar e desativar/editar pessoas, restrito a `global_admin` (todas as
  unidades) e `unit_admin` (só a própria unidade). Campos do PRD hoje ausentes na
  tabela — nome, telefone, função/cargo, área de trabalho, observação — passam a
  existir; e-mail único (cenário 2) recusa duplicata com mensagem clara. Sem
  autocadastro (fora de escopo no PRD).
- **Bootstrap do primeiro `global_admin`**: resolve o círculo "admin cria pessoa ↔
  pessoa precisa existir para logar" via seed idempotente.
- **Nova migração `0003`** (não edita a `0001`): adiciona as colunas de pessoa e a
  coluna de status ativo/desativado em `users`, mantendo `unit_id` + policy RLS.

## Capabilities

### New Capabilities

- `autenticacao`: login/logout por usuário e senha, emissão e verificação de
  sessão, e a resolução de identidade autenticada que popula o contexto de tenant
  (substituindo o placeholder de header). Cobre US 1.2.
- `gestao-pessoas`: cadastro, listagem, edição e desativação de pessoas pela
  administração, com os campos do PRD, e-mail único e alcance por papel
  (global vs. unidade). Cobre US 1.1.

### Modified Capabilities

<!-- Nenhuma. A capability platform-infrastructure permanece intacta: o requisito
     de tenancy (SET LOCAL por transação, RLS por unit_id) é preservado — apenas a
     origem da identidade que alimenta o contexto muda, o que não altera nenhum
     requisito verificável daquela spec. -->

## Impact

- **Código (apps/api):** novo `routes/auth.ts` e `routes/users.ts`; reescrita da
  resolução de identidade em `middleware/tenant-context.ts`; extensão do `AuthPort`
  (ou novo `SessionPort`) para emitir/verificar sessão usando `AUTH_SESSION_SECRET`
  via `SecretsPort` (segredo já provisionado no Terraform e no `.env.example`).
- **Banco:** migração `0003` estende `users` (campos de pessoa + `status`); RLS
  reaplicada às novas colunas conforme a policy existente. `db/seed.ts` cria o
  primeiro `global_admin`.
- **Contratos (packages/shared):** DTOs de login e de pessoa; enum de status.
- **Fora de escopo (mudanças futuras):** qualquer tela/SPA (`apps/web` segue
  reservado); grupos de destinatários e permissões granulares (Épico 4); avisos de
  expiração (Épico 4/US 4.3); login por Google/SSO (fora do MVP no PRD).
