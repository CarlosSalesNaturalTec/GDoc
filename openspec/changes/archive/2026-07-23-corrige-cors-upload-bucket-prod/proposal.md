## Why

O envio de arquivos (US 3.1/3.2) falha em produção com a mensagem "Falha no
envio." e, no console do navegador, `has been blocked by CORS policy: ... No
'Access-Control-Allow-Origin' header is present on the requested resource`.

O fluxo tem duas etapas com origens diferentes:

1. **SPA → API** (mesma origem, com cookie): `POST /files/upload-urls`
   (`apps/api/src/routes/files.ts`) faz `INSERT INTO files (... status='pending')`
   e devolve a URL assinada do GCS. Essa etapa **sucede** — por isso o arquivo
   aparece na listagem com status `Pending` segundos depois.
2. **SPA → GCS** (cross-origin): `put-object.ts` faz um `XMLHttpRequest.PUT`
   direto na URL assinada, com header `Content-Type`, o que dispara um
   **preflight OPTIONS** no bucket. O bucket responde **sem**
   `Access-Control-Allow-Origin` → o preflight falha → `xhr.onerror` →
   "Falha no envio." Os bytes nunca chegam ao bucket e o registro fica preso
   em `pending`.

A causa raiz é a configuração de CORS do bucket de arquivos
(`infra/terraform/storage.tf`), cuja lista de origens permitidas
(`cors_allowed_origins`, `infra/terraform/variables.tf`) tem como default apenas
`http://localhost:5173` (dev server do Vite). Em produção a SPA é servida pela
própria API no Cloud Run (`infra/terraform/frontend.tf`), então a origem do
navegador é a URL do serviço Cloud Run — que **não está** na lista. O Cloud Run
expõe duas formas de URL para o mesmo serviço e **ambas** são usadas:

- `https://gdoc-prod-api-hmwigy67mq-rj.a.run.app`
- `https://gdoc-prod-api-434553790439.southamerica-east1.run.app`

## What Changes

- Incluir as origens de produção do SPA (as duas URLs do serviço Cloud Run da
  API) em `cors_allowed_origins`, de modo que o preflight `OPTIONS` do
  `PUT`/`GET` direto ao bucket retorne `Access-Control-Allow-Origin` e o upload
  direto conclua.
- Documentar, no `infra/terraform/README.md` e no
  `terraform.tfvars.example`, que a origem de CORS em produção é a(s) URL(s) do
  Cloud Run da API (mesma origem que serve a SPA), e que **ambas** as formas de
  URL do Cloud Run precisam constar enquanto não houver domínio custom.

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova. -->

### Modified Capabilities
- `platform-infrastructure`: torna explícito que a configuração de CORS do bucket
  de arquivos SHALL autorizar a(s) origem(ns) do SPA em produção — a(s) URL(s) do
  serviço Cloud Run da API — para que o upload/download direto ao storage
  conclua o preflight cross-origin.

## Impact

- Infra: `infra/terraform/terraform.tfvars` (valor real, gitignored) e/ou o
  default de `cors_allowed_origins` em `infra/terraform/variables.tf`;
  documentação em `infra/terraform/terraform.tfvars.example` e
  `infra/terraform/README.md`.
- Sem alteração de código de aplicação (`apps/*`) — o comportamento do
  `put-object.ts` e das rotas de emissão de URL já está correto; o que faltava é
  a autorização de CORS no bucket.
- Hotfix operacional: até o `terraform apply`, o CORS pode ser aplicado direto no
  bucket via `gcloud storage buckets update` (documentado em tasks). Fixar em
  Terraform é obrigatório para não regredir no próximo apply (que restauraria o
  default `[localhost:5173]`).
- Fora de escopo:
  - Limpeza/robustez dos registros órfãos em `status='pending'` deixados pelas
    tentativas que falharam (fluxo de falha de PUT no front) — fica para um change
    próprio.
  - Adoção de domínio custom (`frontend_domain`) que eliminaria o problema das
    "duas URLs" do Cloud Run — fica fora deste recorte mínimo.
