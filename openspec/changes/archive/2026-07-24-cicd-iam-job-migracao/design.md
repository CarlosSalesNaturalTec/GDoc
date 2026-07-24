## Context

O change `deploy-migrations-e-docs-only` introduziu o Job Cloud Run
`${name_prefix}-migrate` (`infra/terraform/migrate_job.tf`) e, em
`.github/workflows/deploy.yml`, os passos "Update migration job image"
(`gcloud run jobs update`) e "Run database migrations" (`gcloud run jobs execute
--wait`), rodados antes do `gcloud run deploy`. A autenticação do pipeline é por
Workload Identity Federation na service account `${name_prefix}-deployer`
(`infra/terraform/cicd.tf`).

O IAM do deployer em `cicd.tf` concede:
- `roles/artifactregistry.writer` no repositório de imagens;
- `roles/run.developer` **no serviço da API**, via
  `google_cloud_run_v2_service_iam_member` (escopo = aquele recurso de serviço);
- `roles/iam.serviceAccountUser` na service account de runtime da API
  (`google_service_account.api`), para "agir como" ela ao implantar.

O Job de migração é um recurso **distinto** do serviço da API. O binding
`...service_iam_member` acima **não** confere nenhuma permissão sobre o Job. Por
isso o `gcloud run jobs update gdoc-prod-migrate` falhou em produção com
`PERMISSION_DENIED: Permission 'run.jobs.get' denied on resource
'.../jobs/gdoc-prod-migrate'`, abortando o pipeline antes de migrar e de implantar
(evidência: run de deploy do merge `835d303`, passo "Update migration job image"
com falha; passos seguintes "skipped"; Job `gdoc-prod-migrate` com **zero**
execuções; serviço da API preso na imagem `4bc2793`, anterior à correção).

## Goals / Non-Goals

**Goals:**
- Conceder ao deployer a permissão mínima para **atualizar a imagem e executar** o
  Job de migração, no escopo do próprio recurso do Job.
- Manter a correção puramente em IaC, aditiva, sem tocar nos bindings existentes
  do serviço nem no código de aplicação.
- Documentar por que executar o Job de **bootstrap** à mão não é caminho de
  desbloqueio válido (imagem pinada → "sucesso falso" sem aplicar a migração).

**Non-Goals:**
- Não altera o pipeline (`deploy.yml`) nem o `migrate_job.tf` — o passo já existe
  e está correto; faltava apenas a permissão.
- Não remove nem despina a imagem do Job de bootstrap (fica como mudança futura).
- Não adiciona verificação de drift de imagem no passo de migração (fica como
  mudança futura, citada no proposal).

## Decisions

### D1 — Binding no escopo do recurso do Job, papel `roles/run.developer`

Adicionar em `cicd.tf` um `google_cloud_run_v2_job_iam_member` para
`google_cloud_run_v2_job.migrate`, `role = "roles/run.developer"`,
`member = serviceAccount:${deployer.email}`, com `project`/`location` do recurso.

- **Por que `run.developer` e não um papel mais amplo:** `roles/run.developer`
  contém `run.jobs.get`, `run.jobs.update`, `run.jobs.run` e
  `run.executions.get`/`run.executions.list` — exatamente o conjunto que
  `gcloud run jobs update` + `gcloud run jobs execute --wait` exercem. Espelha o
  papel já usado para o serviço da API, mantendo privilégio mínimo. Evita
  `roles/run.admin` (gestão de IAM do recurso, desnecessária).
- **Por que no escopo do recurso do Job, não no projeto:** consistente com a
  postura de IAM por recurso já adotada (o serviço da API recebe `run.developer`
  no próprio serviço). Concede só sobre `gdoc-prod-migrate`, não sobre todos os
  Jobs/serviços do projeto.

### D2 — "Act-as" já coberto; não duplicar

O Job de migração usa `google_service_account.api` como service account de runtime
(ver `migrate_job.tf`). O deployer já possui `roles/iam.serviceAccountUser` nessa
SA (`deployer_act_as_api` em `cicd.tf`), concedido para o deploy do serviço. Como
é a **mesma** SA de runtime, `gcloud run jobs update --image` (que fixa a SA de
runtime do Job) e `execute` já têm o act-as necessário. Nenhum binding adicional
de `serviceAccountUser` é preciso.

### D3 — Nota operacional: bootstrap não é caminho de desbloqueio

Documentar em `infra/terraform/README.md` que:
- o pipeline atualiza a imagem **somente** do Job de migração; o Job de bootstrap
  mantém a imagem pinada (`lifecycle.ignore_changes = [image]`);
- executar o bootstrap à mão para "aplicar migrações pendentes" roda a imagem
  pinada — se ela for anterior à migração, seu `dist/db/migrations` não contém o
  `.sql` novo e `runMigrations()` conclui com **sucesso sem aplicar** (o registro
  `schema_migrations` daquele `.sql` nunca é criado). O desbloqueio correto é
  atualizar a imagem do **Job de migração** para a recém-publicada e executá-lo.

## Risks / Trade-offs

- **Verificação por `apply` real:** neste sandbox não há acesso ao registry do
  Terraform nem ao GCP; a validação fica em `terraform fmt -check` + revisão
  cruzada dos recursos referenciados (`google_cloud_run_v2_job.migrate`,
  `google_service_account.deployer`), como no change anterior. O `terraform
  plan/apply` real precede o próximo deploy.
- **Duas deltas ativas sobre a mesma Requirement:** este change e
  `deploy-migrations-e-docs-only` modificam "Pipeline de build e deploy". O delta
  aqui já embute o texto do change anterior e acrescenta a cláusula de permissão —
  ao sincronizar/arquivar, a versão consolidada é a deste change.
- **Superfície de permissão:** o binding amplia o que o deployer pode fazer, mas
  restrito a um único recurso (o Job de migração) e ao papel mínimo necessário —
  proporcional à função de CI/CD e alinhado ao IAM já concedido ao serviço.
