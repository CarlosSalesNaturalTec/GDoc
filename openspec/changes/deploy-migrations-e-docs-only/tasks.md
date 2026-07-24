## 1. Job Cloud Run de migração (Terraform)

- [ ] 1.1 Criar `infra/terraform/migrate_job.tf` com `google_cloud_run_v2_job "migrate"` (`${local.name_prefix}-migrate`), espelhando `bootstrap_job.tf`: mesma `var.api_image`, service account da API, volume `cloudsql` e `depends_on` dos serviços/segredo `database_url`.
- [ ] 1.2 Definir `command=["node"]` e `args=["apps/api/dist/db/migrate.js"]`; envs `NODE_ENV=production`, `DATABASE_SSL=false`, `SECRETS_DRIVER=env`, `STORAGE_DRIVER`/`STORAGE_BUCKET`/`GCP_PROJECT_ID` conforme o padrão, e `DATABASE_URL` via `value_source.secret_key_ref` — **sem** nenhuma env `BOOTSTRAP_ADMIN_*`.
- [ ] 1.3 Adicionar `lifecycle.ignore_changes = [template[0].template[0].containers[0].image]` (mesmo racional dos demais jobs) e `max_retries = 1`.
- [ ] 1.4 Expor o nome do job em `outputs.tf` (ex.: `migrate_job_name`) para facilitar a configuração da variável de repositório do GitHub.
- [ ] 1.5 Documentar o novo job e a variável de repositório correspondente no `infra/terraform/README.md`.

## 2. Pipeline: gate docs-only

- [ ] 2.1 Em `.github/workflows/deploy.yml`, adicionar job `changes` (roda antes do build) com checkout do `workflow_run.head_sha` e histórico suficiente (`fetch-depth: 0`).
- [ ] 2.2 Computar o diff `git diff --name-only "$SHA^1" "$SHA"` e classificar como docs-only quando **todo** arquivo casar com `*.md`, `docs/**`, `openspec/**`, `LICENSE`; qualquer arquivo fora → não docs-only (fail-safe, inclusive quando `$SHA^1` não existe).
- [ ] 2.3 Exportar `outputs.docs_only` e condicionar o job `build-push-deploy` com `if: needs.changes.outputs.docs_only == 'false'` (mantendo `github.event.workflow_run.conclusion == 'success'`).
- [ ] 2.4 Registrar no log do job de gate a decisão (docs-only → pulou / misto → deploya).

## 3. Pipeline: aplicar migrations antes de trocar tráfego

- [ ] 3.1 Adicionar variável de repositório com o nome do Job de migração (ex.: `GCP_MIGRATE_JOB`).
- [ ] 3.2 Em `build-push-deploy`, após o `Push image` e **antes** do `Deploy to Cloud Run`, inserir o passo de migração: `gcloud run jobs update "$MIGRATE_JOB" --image "${IMAGE}:${SHA}" ...` seguido de `gcloud run jobs execute "$MIGRATE_JOB" --wait ...` (região/projeto por `vars`).
- [ ] 3.3 Garantir que a falha do `execute --wait` aborta o workflow antes do `gcloud run deploy` (tráfego permanece na revisão anterior).

## 4. Validação

- [ ] 4.1 `terraform validate`/`plan` (ou revisão equivalente) confirma o novo job sem alterar recursos existentes de forma indesejada.
- [ ] 4.2 Revisar o YAML do `deploy.yml` (sintaxe/expressões) — dependências entre jobs, `needs`, e condições `if`.
- [ ] 4.3 Verificar o cenário docs-only: merge só de documentação não builda/implanta; merge misto/código builda, migra e implanta (validação no primeiro deploy real ou via dry-run).
- [ ] 4.4 Confirmar que o CI (lint/build/test) continua rodando em todo push/PR, inalterado (gate vive só no deploy).

## 5. Desbloqueio imediato da produção (operacional, fora do pipeline)

- [ ] 5.1 Executar o Job de bootstrap existente para aplicar as migrations pendentes agora: `gcloud run jobs execute ${name_prefix}-bootstrap --wait --region <region> --project <project>` e confirmar que os 500 cessaram.
