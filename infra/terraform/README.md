# infra/terraform — fundação de produção (GCP)

IaC da mudança `bootstrap-infrastructure` (ver
`openspec/changes/bootstrap-infrastructure/design.md` para o porquê de cada
decisão). Provisiona os trilhos de produção — nenhuma feature do PRD.

Recursos provisionados: Cloud Run (API), Cloud SQL (Postgres), Cloud Storage
(bucket privado de arquivos + bucket público do SPA com CDN), Secret
Manager, Artifact Registry, Pub/Sub (reconciliação de cota) e Cloud
Scheduler → Cloud Run Job (expurgo diário da lixeira, 03:00).

**Aplicado** contra o projeto real `gdoc-502613` (ambiente de
desenvolvimento com `gcloud`/Terraform configurados) — 53 recursos criados,
0 destruídos. Escrito e revisado originalmente num ambiente sandbox sem
projeto GCP nem credenciais, onde só `terraform validate`/`fmt` rodavam;
`plan`/`apply` aconteceram depois, num ambiente com acesso real ao projeto
(ver `openspec/changes/bootstrap-infrastructure/tasks.md`, seção 8, para os
três ajustes que só a API real revelou). A API ainda sobe com a imagem
placeholder pública até o CI/CD publicar a imagem real — ver "Uso" abaixo.

## Pré-requisitos

- Um projeto GCP existente, com billing habilitado.
- `gcloud` autenticado (`gcloud auth application-default login`) com
  permissão de Editor/Owner (ou papéis equivalentes) no projeto.
- Terraform >= 1.7.

## Bootstrap (uma vez por projeto)

O estado remoto precisa de um bucket que já exista antes do `terraform init`
— o Terraform não pode criar o bucket em que vai guardar o próprio estado.

```bash
PROJECT_ID="gdoc-prod-123456"   # ajustar
gcloud config set project "$PROJECT_ID"

gsutil mb -l southamerica-east1 "gs://${PROJECT_ID}-terraform-state"
gsutil versioning set on "gs://${PROJECT_ID}-terraform-state"
```

Depois, copie os exemplos e preencha:

```bash
cp backend.hcl.example backend.hcl        # aponta para o bucket acima
cp terraform.tfvars.example terraform.tfvars
# editar os dois com os valores reais do projeto
```

## Uso

```bash
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

Depois do primeiro `apply`, a API sobe com uma imagem placeholder pública
(`us-docker.pkg.dev/cloudrun/container/hello`) — o Cloud Run existe, mas
ainda não roda o código do GDoc. O CI/CD (`.github/workflows/deploy.yml`)
publica a imagem real no Artifact Registry criado aqui e faz o deploy; o
lifecycle `ignore_changes` no `cloud_run.tf` garante que um `terraform apply`
seguinte não reverta esse deploy.

## CI/CD (GitHub Actions)

Depois do `apply`, configure as variáveis do repositório GitHub (Settings →
Secrets and variables → Actions → *Variables* — não são segredos: acesso é
controlado pela condição do WIF + IAM, não por elas serem secretas) com os
outputs deste Terraform:

| Variável do repositório | Valor (`terraform output ...`) |
|---|---|
| `GCP_PROJECT_ID` | `var.project_id` (o mesmo de `terraform.tfvars`) |
| `GCP_REGION` | `var.region` |
| `GCP_ARTIFACT_REPOSITORY` | `artifact_registry_repository` |
| `GCP_CLOUD_RUN_SERVICE` | nome do serviço (`google_cloud_run_v2_service.api.name`, também visível prefixado em `api_url`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `github_actions_workload_identity_provider` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | `github_actions_deployer_service_account` |

Sem chave de service account em lugar nenhum — `cicd.tf` provisiona um
Workload Identity Pool que só aceita tokens OIDC do repositório configurado
em `github_repository` (`CarlosSalesNaturalTec/GDoc` por padrão).

## Decisões que valem conhecer antes de mexer

- **Cloud SQL com IP público, sem `authorized_networks`.** A API se conecta
  via integração nativa do Cloud Run (Cloud SQL Auth Proxy gerenciado,
  autenticado por IAM) — nenhuma rota de rede é liberada para ninguém. Evita
  o custo/complexidade de um conector Serverless VPC Access ou private
  service access só para o MVP. Ver `cloud_sql.tf`.
- **Assinatura de URL sem chave exportada.** Em prod, a service account do
  Cloud Run assina URLs v4 via IAM Credentials API (`signBlob`), não com uma
  chave de arquivo (que só existe em dev, gerada localmente pelo
  SessionStart hook). Por isso `STORAGE_SIGNER_KEY_PATH` não é setada no
  Cloud Run — ver `cloud_run.tf` (`google_service_account_iam_member.api_self_sign`)
  e `apps/api/src/adapters/gcs-storage-port.ts`.
- **Frontend sem domínio ainda.** `apps/web` já existe (change
  `web-shell-e-auth`), mas o bucket+CDN seguem sem tráfego real: o balanceador
  de carga e o certificado gerenciado só são criados quando `frontend_domain`
  é definido (o Google exige um domínio real para emitir o certificado). Ver
  `variables.tf`/`frontend.tf`.
- **Mesma origem SPA+API é pré-requisito de deploy do frontend.** O cookie de
  sessão é `HttpOnly`/`SameSite=Strict` e a API não tem CORS (ver
  `apps/api/src/lib/session-cookie.ts`), então a SPA só funciona em produção
  se o `path_matcher` do `google_compute_url_map.frontend` (`frontend.tf`)
  estiver ativo: ele roteia os prefixos de `local.api_proxy_prefixes`
  (`locals.tf`) para o serverless NEG da Cloud Run
  (`google_compute_backend_service.api`) e tudo o mais para o bucket+CDN da
  SPA. Essa lista de prefixos espelha `apps/web/vite.config.ts`
  (`API_PROXY_PREFIXES`, usado pelo proxy do servidor de dev) — mantenha as
  duas em sincronia ao adicionar uma rota nova. Design completo em
  `openspec/changes/web-shell-e-auth/design.md` (decisões D1/D2).
- **Gap de segurança conhecido, não fechado aqui:** o endpoint
  `POST /internal/storage-events` (reconciliação de cota) recebe o push do
  Pub/Sub autenticado por OIDC, e o Cloud Run exige `roles/run.invoker` para
  invocar o serviço — **mas** o mesmo Cloud Run também concede
  `allUsers:run.invoker` (a API precisa ser pública para o SPA). Isso
  significa que a checagem de IAM do Cloud Run não restringe esse endpoint
  especificamente: qualquer um pode chamá-lo. Fechar isso exige que a
  **aplicação** valide o JWT OIDC do Pub/Sub no corpo da requisição (audience
  + assinatura), não é algo resolvível só na infra sem tornar todo o Cloud
  Run privado (o que quebraria o acesso público do SPA). Ver
  `apps/api/src/routes/storage-events.ts` — precisa de tratamento numa
  mudança futura antes de ir para produção com dados reais.
- **`db-f1-micro`** é o tier mais barato disponível — adequado para MVP,
  revisar (`db_tier`) antes de qualquer carga de produção real.
- **Expurgo da lixeira tem lógica real (Épico 6, `epico-6-lixeira-retencao`).**
  O Cloud Run Job (`scheduler.tf`) deixou de ser um placeholder de exemplo: roda
  a mesma imagem da API (`var.api_image`) com o entrypoint
  `dist/jobs/purge-trash.js`, conectado ao Cloud SQL pela mesma integração
  nativa da API (`google_sql_database_instance.main`) e ao segredo
  `database_url`. `TRASH_RETENTION_DAYS` (padrão 30 — `var.trash_retention_days`)
  controla o corte de retenção; ver `apps/api/src/jobs/purge-trash.ts` e
  design.md D6-D10 do change para a lógica. A topologia Scheduler → Job e a
  IAM do invoker não mudaram.
- **A imagem do Job não é redeployada automaticamente pelo CI/CD.**
  `.github/workflows/deploy.yml` só faz `gcloud run deploy` do **serviço**
  (API) a cada push em `main`; o **Job** de expurgo só pega uma imagem nova
  quando o Terraform for reaplicado (o `lifecycle.ignore_changes` em
  `containers[0].image` evita que um `apply` de rotina reverta uma imagem já
  publicada, mas também significa que ele não avança sozinho). Manter o job
  atualizado hoje exige `terraform apply` manual apontando `var.api_image`
  para a tag desejada, ou estender o CI/CD para também rodar
  `gcloud run jobs deploy` — fora de escopo desta mudança.

## O que falta (fora de escopo desta mudança)

- Ambiente de staging.
- Fechar o gap de autenticação do endpoint de reconciliação de cota (acima).
- Domínio real do frontend (hoje `frontend_domain` fica vazio por padrão).
- Redeploy automático da imagem do Cloud Run Job de expurgo pelo CI/CD (acima).
