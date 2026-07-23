# Migra a infraestrutura de produção para us-central1

## Why

Toda a infraestrutura regional de produção (Cloud Run, Cloud SQL, buckets do
Cloud Storage, Artifact Registry, Scheduler/Jobs, NEG serverless) está em
`southamerica-east1`, região com preços ~20–35% mais altos que `us-central1`
nos componentes principais. A aplicação está em **fase de testes, sem dados
reais** — o custo extra não compra nada hoje.

Recursos regionais do GCP têm região **imutável**: não existe "mover" — a
operação suportada é destruir e recriar. Como não há dados a migrar, este é o
momento de menor custo possível para a troca: depois, com dados reais, a mesma
operação exigiria export/import do Postgres, `rsync` de bucket e janela de
indisponibilidade.

## What Changes

- **BREAKING (operacional):** toda a infra regional de produção é destruída em
  `southamerica-east1` e recriada em `us-central1` via Terraform. Banco e
  bucket recomeçam vazios (aceito: fase de testes). As URLs do serviço Cloud
  Run **mudam** (a região faz parte da URL) — a URL de produção divulgada
  deixa de existir.
- `infra/terraform/`: default de `var.region` passa a `us-central1`
  (`variables.tf`), com `terraform.tfvars.example` e `README.md` atualizados
  (inclusive o exemplo de criação do bucket de state).
- `terraform.tfvars` (fora do repo): `region`, `cors_allowed_origins` e
  `pubsub_push_audience` atualizados para as URLs novas do Cloud Run.
- Variável de repositório GitHub `GCP_REGION` atualizada para `us-central1`
  (Settings → Variables; consumida por `.github/workflows/deploy.yml`).
- Ritual de bootstrap reexecutado no ambiente novo: versão do secret
  `bootstrap-admin-password` recriada e Job `gdoc-prod-bootstrap` executado
  (migrações + `global_admin`).
- `docs/manual_do_usuario.md`: URL de produção atualizada.
- Registro explícito do trade-off de latência (usuários no Brasil ↔ Iowa,
  ~140–180 ms de RTT adicionais em toda requisição e no tráfego direto de
  bytes com o bucket) e do **gatilho de retorno** para uma região próxima dos
  usuários antes de operar com carga real sensível a latência — mesmo padrão
  de anotação usado no PITR (`desativa-pitr-cloud-sql-mvp`).

## Capabilities

### New Capabilities

<!-- Nenhuma capability nova. -->

### Modified Capabilities

- `platform-infrastructure`: passa a especificar que a **região dos recursos
  regionais é parametrizada e única** (`var.region` no Terraform, fonte da
  verdade, sem região hardcoded em recurso), que na fase de testes a região
  ativa é `us-central1` por custo — com anotação do trade-off de latência e do
  gatilho de reavaliação antes de carga real — e que uma troca de região SHALL
  reconciliar as três pontas dependentes de URL do Cloud Run (CORS do bucket
  de arquivos, audience OIDC do push do Pub/Sub e a variável `GCP_REGION` do
  CI/CD), além de reexecutar o bootstrap do administrador global no ambiente
  recriado.

## Impact

- **Infra:** `infra/terraform/variables.tf`, `terraform.tfvars.example`,
  `README.md`. Nenhum recurso `.tf` muda de forma — a região já é 100%
  parametrizada; o change é o valor + o runbook de recriação.
- **Fora do repo (operacional):** `terraform.tfvars`, variável GitHub
  `GCP_REGION`, versões de secrets (morrem no destroy — só o *container* é do
  Terraform), execução do `deploy.yml` e do Job de bootstrap.
- **Docs:** `docs/manual_do_usuario.md` (URL de produção).
- **Sem alteração** de código de aplicação (`apps/*`), migrations ou schema —
  a paridade dev↔prod pelos seams (`ports/`) torna a região invisível ao
  código de negócio.
- **Efeitos operacionais ao aplicar:**
  - Indisponibilidade total durante a janela destroy→apply→deploy (aceitável:
    fase de testes, sem usuários reais).
  - Contas, unidades, pastas, arquivos e auditoria existentes no ambiente de
    teste são **perdidos** (banco e bucket novos, vazios).
  - `deletion_protection = true` no Cloud SQL exige um apply intermediário
    com a flag em `false` antes do destroy; ela volta a `true` no ambiente
    novo.
  - Cloud Run sobe com a imagem placeholder até o `deploy.yml` publicar a
    imagem real no Artifact Registry novo (vazio).
  - Risco conhecido: esquecer as URLs novas em `cors_allowed_origins` quebra o
    upload no preflight (repetiria o incidente do change
    `corrige-cors-upload-bucket-prod`); esquecer `pubsub_push_audience` faz o
    push do finalize virar 401 e para a reconciliação de cota. Ambos estão no
    runbook como passos obrigatórios.
- **Fora de escopo:**
  - Mover o bucket de state do Terraform (fica em `southamerica-east1` —
    custo de KBs, e movê-lo exigiria mexer no `backend.hcl` sem retorno).
  - Retorno futuro para região próxima dos usuários com migração de dados
    (change próprio, disparado pelo gatilho de latência registrado aqui).
  - Domínio custom do frontend (`frontend_domain`), staging e demais
    pendências já listadas no `infra/terraform/README.md`.
