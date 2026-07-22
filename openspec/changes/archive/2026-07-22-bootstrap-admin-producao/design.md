## Context

A produção do GDoc (Cloud Run + Cloud SQL) subiu sem um caminho de
inicialização do primeiro administrador. `server.ts` não migra nem faz seed no
boot; `deploy.yml` só faz `gcloud run deploy` do serviço; o Terraform não roda
migração/seed. O único criador de `global_admin` é `apps/api/src/db/seed.ts` —
um **seed de desenvolvimento** que, num banco vazio, também cria unidades e
usuários de demonstração com a senha pública `dev-password-only`, e que cai nos
defaults inseguros de `config.ts` (`admin.global@gdoc.dev` / `dev-password-only`)
quando `BOOTSTRAP_ADMIN_*` não estão setados — o que é o caso no Cloud Run.

O Cloud SQL não tem `authorized_networks` (só a integração nativa do Cloud Run
o alcança), então rodar seed/migração hoje exige um Cloud SQL Auth Proxy na
máquina do operador.

Restrições herdadas (não renegociadas aqui):
- Senhas sempre como hash argon2 (`AuthPort`/adapter argon2 já existente).
- Tabelas tenant-scoped têm `unit_id` + RLS com `FORCE ROW LEVEL SECURITY`;
  escritas precisam rodar sob `app.user_role = 'global_admin'` via `SET LOCAL`
  na transação (mesmo caminho que o seed já usa).
- Segredos de produção vêm do Secret Manager, injetados no Cloud Run.

## Goals / Non-Goals

**Goals:**
- Um caminho **seguro, idempotente e sem proxy** para criar o primeiro
  `global_admin` em produção.
- **Fail-closed**: sem credenciais explícitas, nada é criado.
- **Zero dados de demonstração** em produção — nem pelo bootstrap, nem por um
  `npm run seed` acidental.
- Reaproveitar a imagem, a service account e a integração Cloud SQL já
  existentes (sem novos SDKs nem novo caminho de rede).

**Non-Goals:**
- Rotação/reset de senha, autocadastro, convite por e-mail (fora do MVP, PRD §3).
- Redeploy automático da imagem do Job pelo CI/CD (segue o padrão do Job de
  expurgo: imagem avança só em `terraform apply`).
- Alterar o fluxo de seed de **desenvolvimento** (permanece idêntico fora de
  produção).

## Decisions

### D1 — Comando dedicado `bootstrap.ts`, separado do seed

Novo `apps/api/src/db/bootstrap.ts` (script `npm run bootstrap`,
`tsx src/db/bootstrap.ts`), em vez de estender `seed.ts`. O seed carrega a
semântica de "dev, cria demo data quando vazio"; misturar bootstrap de produção
ali arriscaria reintroduzir demo data. Um comando próprio tem responsabilidade
única: **migrar + criar só o admin**.

_Alternativa descartada:_ um flag `--prod` no seed — mesmo binário com dois
comportamentos opostos é mais fácil de acionar errado.

### D2 — Migrar antes de criar o admin, no mesmo comando

O bootstrap chama `runMigrations()` (reusando `db/migrate.ts`) e só então cria o
admin. Assim um **único** disparo de Job inicializa um banco recém-provisionado
(schema + admin), sem exigir um segundo passo manual. Ambos os passos são
idempotentes, então reexecutar é seguro.

### D3 — Fail-closed lendo `process.env` diretamente (não os defaults de `config`)

`config.bootstrapAdmin` tem defaults de dev (`admin.global@gdoc.dev` /
`dev-password-only`) — úteis em dev, perigosos como fallback de produção. O
bootstrap lê `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` **direto de
`process.env`** e aborta (exit 1, sem tocar o banco) se qualquer um faltar,
vier vazio, ou a senha for exatamente `dev-password-only`. Isso garante que o
default inseguro nunca vire um admin real. `BOOTSTRAP_ADMIN_UNIT` (padrão
"Administração") e `BOOTSTRAP_ADMIN_NAME` (padrão "Administrador Global") são
opcionais.

`databaseUrl` continua vindo de `config` (mesma origem do resto). Como
`config.ts` exige `STORAGE_BUCKET` e `GCP_PROJECT_ID` no load (igual a
`migrate`/`seed` hoje), o Job os fornece com os valores reais já disponíveis no
Terraform — o bootstrap não usa storage, mas mantém a paridade de carga de
config sem refatoração de risco.

### D4 — Idempotência por "existe algum global_admin?"

Mesmo guard do seed: `SELECT count(*) FROM users WHERE role = 'global_admin'`.
> 0 ⇒ no-op com exit 0. Reexecutar o Job após o primeiro sucesso é inofensivo.
A criação roda numa transação com `SET LOCAL app.user_role = 'global_admin'`
(FORCE RLS obriga), criando a unidade por nome (reaproveita se já existir) e
inserindo o usuário. Colisão de e-mail (`UNIQUE`) aborta com mensagem clara.

### D5 — Trava de produção no seed de dev

`seed.ts` passa a abortar (throw/exit 1) quando `config.nodeEnv === 'production'`,
**antes** de qualquer escrita. Fecha diretamente o furo dos usuários de
demonstração com senha pública — mesmo que alguém rode `npm run seed` apontando
para produção, nada é criado. Em dev (`NODE_ENV` != production) o comportamento
é o de hoje.

### D6 — Cloud Run **Job** reusando imagem/SA/Cloud SQL da API

Novo `google_cloud_run_v2_job` `${name_prefix}-bootstrap` espelhando o Job de
expurgo (`scheduler.tf`): mesma `var.api_image`, `command`/`args` sobrescritos
para `node apps/api/dist/db/bootstrap.js`, volume e conexão Cloud SQL da mesma
instância, `DATABASE_URL` do secret existente. Reusa a **service account da API**
(já tem `cloudsql.client` e acesso ao secret `database_url`). Executado sob
demanda (`gcloud run jobs execute ${name_prefix}-bootstrap`), **não** agendado.

_Alternativa descartada:_ rodar via Cloud SQL Auth Proxy local — acopla o
bootstrap à máquina/credenciais do operador e sai do modelo "tudo pela
integração IAM do Cloud Run".

### D7 — Senha do bootstrap no Secret Manager; e-mail/unidade como env

Novo secret `${name_prefix}-bootstrap-admin-password` (o Terraform cria o
**container** do secret; o operador adiciona a **versão** com a senha real antes
de executar o Job — assim a senha nunca fica no state nem no código). O Job lê
`BOOTSTRAP_ADMIN_PASSWORD` desse secret e recebe `BOOTSTRAP_ADMIN_EMAIL`/
`BOOTSTRAP_ADMIN_UNIT` como env (via variável do Terraform). A SA da API ganha
`secretAccessor` nesse novo secret.

## Risks / Trade-offs

- **[Job usa imagem que pode estar atrasada]** O `lifecycle.ignore_changes` na
  imagem (padrão do repo) faz o Job só avançar em `terraform apply`. → Para o
  bootstrap (passo único, logo após provisionar), aponta-se `var.api_image` para
  a tag corrente ao aplicar; sem impacto recorrente por ser one-shot.
- **[Operador esquece de criar a versão do secret]** O Job falha ao resolver
  `BOOTSTRAP_ADMIN_PASSWORD`. → Fail-closed desejado; o README documenta o passo
  de criar a versão antes de executar. Mensagem de erro do Job aponta o secret.
- **[`config` ainda exige STORAGE_BUCKET/GCP_PROJECT_ID]** herdado; o Job os
  fornece. → Aceito para não refatorar `config.ts` neste change; documentado.
- **[Demo data pré-existente de um seed rodado antes desta mudança]** A trava de
  produção não remove o que já foi criado. → O README orienta excluir/desativar
  as contas de demonstração pela tela Pessoas após o primeiro login; a trava
  previne recorrência.

## Migration Plan

1. Deploy da imagem com o novo `bootstrap.ts` (pipeline normal em `main`).
2. `terraform apply` criando o Job e o secret container; apontar `var.api_image`
   para a tag publicada.
3. Operador cria a versão do secret `bootstrap-admin-password` com a senha real
   e define `BOOTSTRAP_ADMIN_EMAIL` (variável do Terraform / env do Job).
4. `gcloud run jobs execute ${name_prefix}-bootstrap` — aplica migrações e cria
   o admin.
5. Login na URL de produção; cadastrar as pessoas pela tela **Pessoas**;
   excluir/desativar eventuais contas de demonstração pré-existentes.

**Rollback:** o bootstrap não altera schema além das migrações versionadas; se
o admin foi criado com dados errados, desativá-lo/ajustá-lo pela tela Pessoas
(ou por SQL manual) — reexecutar o Job é no-op enquanto houver um `global_admin`.

## Open Questions

_Nenhuma._ O e-mail do admin de bootstrap pode virar a conta definitiva do
operador ou ser desativado após criar a conta real — decisão operacional, não
de design.
