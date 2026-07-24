## 1. IAM do deployer no Job de migração (Terraform)

- [x] 1.1 Em `infra/terraform/cicd.tf`, adicionar `google_cloud_run_v2_job_iam_member` (ex.: `deployer_run_developer_migrate_job`) para `google_cloud_run_v2_job.migrate`: `role = "roles/run.developer"`, `member = "serviceAccount:${google_service_account.deployer.email}"`, `project`/`location` do recurso do Job (design.md D1). Adicionado `deployer_run_developer_migrate_job` espelhando o padrão de `scheduler_invoker`.
- [x] 1.2 Confirmar que **não** é preciso binding adicional de `roles/iam.serviceAccountUser`: o Job reusa `google_service_account.api` como runtime e o deployer já tem `serviceAccountUser` nela via `deployer_act_as_api` (design.md D2). Confirmado (`migrate_job.tf` usa `google_service_account.api.email`); registrado no comentário do `deployer_act_as_api`.
- [x] 1.3 Não alterar os bindings existentes do serviço da API (`deployer_run_developer`, `deployer_act_as_api`, `deployer_ar_writer`) — a mudança é aditiva. Só um comentário foi adicionado ao `deployer_act_as_api`; os blocos de binding permanecem inalterados.

## 2. Documentação de infra

- [x] 2.1 Em `infra/terraform/README.md`, registrar que o deployer precisa de `roles/run.developer` **no Job de migração** (além do serviço da API), com o motivo (o passo "Update migration job image" do pipeline exerce `run.jobs.get`/`update`/`run`). Parágrafo adicionado após o bloco do Workload Identity.
- [x] 2.2 Adicionar nota operacional (design.md D3): executar o Job de **bootstrap** à mão **não** é caminho de desbloqueio válido — imagem pinada (`ignore_changes = [image]`) pode ser anterior à migração e `runMigrations()` conclui com "sucesso falso" sem aplicar o `.sql`. Desbloqueio correto = atualizar a imagem do **Job de migração** para a recém-publicada e executá-lo. Nota anexada ao item do Job de migração na seção de recursos.

## 3. Validação

- [x] 3.1 `terraform fmt -check` limpo no arquivo alterado; revisão cruzada de que `google_cloud_run_v2_job.migrate` e `google_service_account.deployer` existem e são referenciados corretamente. Executado neste ambiente: `terraform fmt -check cicd.tf` (exit 0) e **`terraform validate` real** (`init -backend=false` + `validate` → "Success! The configuration is valid.") — superou o previsto (validação real, não só revisão).
- [ ] 3.2 Após o `apply`: disparar um deploy de código (ou re-executar o workflow de Deploy do último merge de código) e confirmar que o passo "Update migration job image" passa, "Run database migrations" aplica as pendentes e "Deploy to Cloud Run" implanta — os 500 cessam. **Pendente:** requer `terraform apply` e um deploy real após o merge desta branch.

## 4. Desbloqueio imediato da produção (operacional, independente do apply)

- [x] 4.1 Enquanto o `apply` não roda, destravar os 500 em curso executando o **Job de migração** com uma imagem que contém a migração pendente: `gcloud run jobs update ${name_prefix}-migrate --image <IMAGE>:<SHA-com-a-migração> --region <region> --project <project>` seguido de `gcloud run jobs execute ${name_prefix}-migrate --wait ...`. Requer credencial com `run.jobs.*` (owner/editor humano). Confirmar que a coluna passa a existir e que os 500 cessam. **Executado:** `gcloud run jobs update gdoc-prod-migrate --image ...api:835d303...` + `execute --wait` → execução `gdoc-prod-migrate-m9g4x`, log `Applied 1 migration(s): 0012_password_changed_at.sql`, `exit(0)`. `GET /health` → 200 `{"db":"ok","storage":"ok"}`.
