## Why

O change `deploy-migrations-e-docs-only` deu ao pipeline um Job Cloud Run de
migração (`${name_prefix}-migrate`) e um passo que faz `gcloud run jobs update`/
`execute` nesse Job antes de trocar o tráfego — mas **não** concedeu à service
account de deploy a permissão de Cloud Run **sobre o Job**. Em produção, o
primeiro deploy que exercitou esse caminho (merge #45, `835d303`) falhou no passo
"Update migration job image" com `PERMISSION_DENIED: Permission 'run.jobs.get'
denied on resource '.../jobs/gdoc-prod-migrate'`; os passos de migração e de
`deploy` foram pulados, a migração `0012_password_changed_at.sql` **nunca rodou**
e a API permaneceu na imagem anterior que **lê** `users.password_changed_at` — o
que derruba `attachTenantContext` em toda requisição tenant-scoped e devolve
**HTTP 500 em todas as telas protegidas**. Enquanto o binding faltar, todo deploy
de código volta a falhar no mesmo ponto.

## What Changes

- **IAM do deployer sobre o Job de migração:** conceder `roles/run.developer` à
  service account de deploy (`${name_prefix}-deployer`) **no recurso do Job**
  `${name_prefix}-migrate`, via `google_cloud_run_v2_job_iam_member` em
  `infra/terraform/cicd.tf`. O binding existente já concede esse papel **apenas no
  recurso do serviço da API** (`google_cloud_run_v2_service_iam_member`), que é
  escopado ao recurso e não alcança o Job. O deployer já tem
  `iam.serviceAccountUser` na service account de runtime da API que o Job reusa,
  então o "act-as" necessário para `execute` já está coberto — falta só o acesso
  ao Job em si (`run.jobs.get`/`update`/`run`, contidos em `run.developer`).
- **Documentação de infra:** registrar em `infra/terraform/README.md` que o
  deployer precisa de `run.developer` **no Job de migração** (além do serviço) e
  que executar o Job de bootstrap à mão **não** é caminho de desbloqueio válido
  (ver abaixo).
- **Nota operacional anti-"sucesso falso" do bootstrap:** documentar que o Job de
  bootstrap tem a imagem pinada (`lifecycle.ignore_changes = [image]`) e não é
  atualizado pelo pipeline; executá-lo à mão para "aplicar migrações" roda uma
  imagem possivelmente anterior à migração pendente, cujo `dist/db/migrations` não
  contém o `.sql` novo — `runMigrations()` conclui com sucesso **sem** aplicar a
  migração. O desbloqueio correto é o próprio Job de migração com a imagem recém-
  publicada (o que o pipeline passa a fazer assim que o IAM é corrigido).

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova: é uma correção do pipeline de entrega já existente. -->

### Modified Capabilities
- `platform-infrastructure`: a **Requirement: Pipeline de build e deploy** passa a
  exigir que a identidade do pipeline tenha permissão para **atualizar e executar
  o Job de migração** — sem isso o passo de migração falha e a implantação é
  bloqueada. Complementa o comportamento introduzido por
  `deploy-migrations-e-docs-only` (migrar antes de trocar o tráfego).

## Impact

- **Infra/Terraform** (`infra/terraform/cicd.tf`): novo recurso
  `google_cloud_run_v2_job_iam_member` (deployer → `roles/run.developer` no Job
  `migrate`). Aditivo; não altera os bindings existentes do serviço da API.
- **Docs** (`infra/terraform/README.md`): nota sobre o IAM do Job e sobre o
  desbloqueio correto (Job de migração, não bootstrap).
- **App**: nenhuma mudança de código de aplicação.
- **Produção**: destrava o pipeline de deploy. O desbloqueio imediato dos 500 em
  curso (executar o Job de migração já com a imagem que contém `0012`) é
  operacional e independente do `apply` deste change; após o `apply`, o pipeline
  volta a migrar e implantar sozinho.

Fora de escopo (mudança futura): revisar se o Job de bootstrap deve deixar de
pinar a imagem (`ignore_changes`) ou ser removido como caminho manual; e uma
verificação de drift que faça o passo de migração **falhar em voz alta** quando a
imagem do Job não corresponder à recém-publicada.
