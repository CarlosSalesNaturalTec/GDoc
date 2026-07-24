## Why

Após o último deploy a produção passou a responder **HTTP 500 em praticamente
todas as telas**. A causa é que o pipeline de deploy **empacota e implanta a
imagem nova, mas nunca aplica as migrations de banco pendentes**: o código
implantado passa a esperar colunas/tabelas que ainda não existem no Cloud SQL
(ex.: as migrations recentes `0011_units_status_and_name_unique.sql` e
`0012_password_changed_at.sql`), e como o middleware `attachTenantContext` relê
`unit_id`/papel/status do banco a **cada** requisição tenant-scoped, qualquer
coluna ausente derruba toda rota protegida de uma vez.

Hoje `runMigrations()` (`apps/api/src/db/migrate.ts`, idempotente via
`schema_migrations`) só é disparado em produção pelo Job de bootstrap, executado
**à mão** — não faz parte do pipeline. Além disso, o deploy roda para **qualquer**
merge na branch alvo, inclusive merges docs-only (documentação, PRD, artefatos
OpenSpec), gastando build/push/deploy e arriscando a produção sem mudança de
comportamento da aplicação.

## What Changes

- **Job Cloud Run dedicado de migração** (`${name_prefix}-migrate`, entrypoint
  `apps/api/dist/db/migrate.js`) provisionado no Terraform, espelhando o padrão
  de `bootstrap_job.tf`/`trash_purge` (mesma imagem, service account e integração
  Cloud SQL da API), **sem** as dependências `BOOTSTRAP_ADMIN_*`.
- **Pipeline aplica migrations no deploy:** entre publicar a imagem e trocar o
  tráfego (`gcloud run deploy`), o pipeline atualiza o Job de migração para a
  imagem recém-publicada e o executa com `--wait`. Como o runner só aplica as
  pendentes, "quando existirem" é automático: sem migration pendente, é no-op.
  Ordem migrar-antes-de-implantar garante que a revisão nova suba contra um
  schema já atualizado.
- **Deploy pula merges docs-only:** um passo inicial no pipeline computa os
  arquivos alterados pelo merge (`git diff --name-only <sha>^1 <sha>`; o repo usa
  merge commit, nunca squash) e, se **todos** casarem com o allowlist de
  documentação (`**/*.md`, `docs/**`, `openspec/**`, `LICENSE`), curto-circuita
  build/push/deploy. Qualquer arquivo fora do allowlist → deploya (fail-safe). O
  gate fica no pipeline de deploy, **não** no CI, preservando o CI como required
  check.

Fora de escopo (mudança futura): estratégia expand/contract para migrations
**destrutivas** (drop/rename de coluna), que quebrariam a revisão antiga na
janela de troca — este change cobre migrations aditivas/retrocompatíveis, que são
o caso atual.

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova: é uma modificação do pipeline de entrega já existente. -->

### Modified Capabilities
- `platform-infrastructure`: a **Requirement: Pipeline de build e deploy** passa a
  exigir que o pipeline (1) aplique as migrations de banco pendentes antes de
  trocar o tráfego para a revisão nova e (2) pule build/push/deploy quando o
  merge na branch alvo for docs-only.

## Impact

- **Infra/Terraform** (`infra/terraform/`): novo recurso
  `google_cloud_run_v2_job "migrate"` (+ IAM/segredo `DATABASE_URL` já existentes,
  reusados). Espelha `bootstrap_job.tf` sem `BOOTSTRAP_ADMIN_*`.
- **CI/CD** (`.github/workflows/deploy.yml`): passo de gate docs-only e passo de
  migração (`gcloud run jobs update --image` + `execute --wait`) antes do
  `gcloud run deploy`; nova variável de repositório para o nome do Job de
  migração.
- **App**: nenhuma mudança de código de aplicação — `db/migrate.ts` já existe e é
  idempotente; apenas passa a ser disparado pelo pipeline.
- **Produção**: desbloqueio imediato dos 500 pode ser feito à mão executando o Job
  de bootstrap existente (que já aplica migrations) enquanto o pipeline é
  corrigido.
