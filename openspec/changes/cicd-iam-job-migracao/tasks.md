## 1. IAM do deployer no Job de migração (Terraform)

- [ ] 1.1 Em `infra/terraform/cicd.tf`, adicionar `google_cloud_run_v2_job_iam_member` (ex.: `deployer_run_developer_migrate_job`) para `google_cloud_run_v2_job.migrate`: `role = "roles/run.developer"`, `member = "serviceAccount:${google_service_account.deployer.email}"`, `project`/`location` do recurso do Job (design.md D1).
- [ ] 1.2 Confirmar que **não** é preciso binding adicional de `roles/iam.serviceAccountUser`: o Job reusa `google_service_account.api` como runtime e o deployer já tem `serviceAccountUser` nela via `deployer_act_as_api` (design.md D2). Se, ao revisar, o Job usar outra SA de runtime, acrescentar o `serviceAccountUser` correspondente.
- [ ] 1.3 Não alterar os bindings existentes do serviço da API (`deployer_run_developer`, `deployer_act_as_api`, `deployer_ar_writer`) — a mudança é aditiva.

## 2. Documentação de infra

- [ ] 2.1 Em `infra/terraform/README.md`, registrar que o deployer precisa de `roles/run.developer` **no Job de migração** (além do serviço da API), com o motivo (o passo "Update migration job image" do pipeline exerce `run.jobs.get`/`update`/`run`).
- [ ] 2.2 Adicionar nota operacional (design.md D3): executar o Job de **bootstrap** à mão **não** é caminho de desbloqueio válido — imagem pinada (`ignore_changes = [image]`) pode ser anterior à migração e `runMigrations()` conclui com "sucesso falso" sem aplicar o `.sql`. Desbloqueio correto = atualizar a imagem do **Job de migração** para a recém-publicada e executá-lo.

## 3. Validação

- [ ] 3.1 `terraform fmt -check` limpo no arquivo alterado; revisão cruzada de que `google_cloud_run_v2_job.migrate` e `google_service_account.deployer` existem e são referenciados corretamente (o `apply`/`plan` real precede o próximo deploy — sem acesso ao GCP/registry neste ambiente).
- [ ] 3.2 Após o `apply`: disparar um deploy de código (ou re-executar o workflow de Deploy do último merge de código) e confirmar que o passo "Update migration job image" passa, "Run database migrations" aplica as pendentes e "Deploy to Cloud Run" implanta — os 500 cessam.

## 4. Desbloqueio imediato da produção (operacional, independente do apply)

- [ ] 4.1 Enquanto o `apply` não roda, destravar os 500 em curso executando o **Job de migração** com uma imagem que contém a migração pendente: `gcloud run jobs update ${name_prefix}-migrate --image <IMAGE>:<SHA-com-a-migração> --region <region> --project <project>` seguido de `gcloud run jobs execute ${name_prefix}-migrate --wait ...`. Requer credencial com `run.jobs.*` (owner/editor humano). Confirmar que a coluna passa a existir e que os 500 cessam.
