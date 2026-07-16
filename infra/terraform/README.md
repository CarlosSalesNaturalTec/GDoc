# infra/terraform — fundação de produção (GCP)

IaC da mudança `bootstrap-infrastructure` (ver
`openspec/changes/bootstrap-infrastructure/design.md` para o porquê de cada
decisão). Provisiona os trilhos de produção — nenhuma feature do PRD.

Recursos provisionados: Cloud Run (API), Cloud SQL (Postgres), Cloud Storage
(bucket privado de arquivos + bucket público do SPA com CDN), Secret
Manager, Artifact Registry, Pub/Sub (reconciliação de cota) e Cloud
Scheduler → Cloud Run Job (expurgo da lixeira, job de exemplo).

**Este código nunca foi aplicado** — foi escrito e revisado neste ambiente,
que não tem projeto GCP nem credenciais. `terraform validate`/`fmt` rodaram
localmente; `plan`/`apply` exigem um projeto real (ver abaixo).

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
ainda não roda o código do GDoc. O CI/CD (tasks.md seção 7, ainda não
implementado) publica a imagem real no Artifact Registry criado aqui e faz
o deploy; o lifecycle `ignore_changes` no `cloud_run.tf` garante que um
`terraform apply` seguinte não reverta esse deploy.

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
- **Frontend sem domínio ainda.** `apps/web` é só o layout reservado (sem
  build da SPA). O bucket+CDN existem desde já; o balanceador de carga e o
  certificado gerenciado só são criados quando `frontend_domain` é definido
  (o Google exige um domínio real para emitir o certificado). Ver
  `variables.tf`/`frontend.tf`.
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

## O que falta (fora de escopo desta mudança)

- CI/CD (tasks.md seção 7): build + push da imagem, deploy no Cloud Run.
- Ambiente de staging.
- Fechar o gap de autenticação do endpoint de reconciliação de cota (acima).
- Domínio real do frontend (hoje `frontend_domain` fica vazio por padrão).
