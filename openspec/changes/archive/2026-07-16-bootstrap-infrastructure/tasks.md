# Tasks — bootstrap-infrastructure

Ordem pensada para reduzir risco cedo: spikes primeiro, depois os seams, o
ambiente dev, a IaC de prod, o pipeline e, por fim, a prova ponta a ponta.
Nenhuma feature do PRD entra aqui.

## 0. Spikes e decisões técnicas

- [x] Verificar disponibilidade de Docker no sandbox (`docker`, `docker compose`) e
      decidir o mecanismo do hook: compose vs binários nativos
      → **Docker indisponível** (cliente presente, sem daemon). Hook usa **binários
      nativos**: `pg_ctlcluster` para Postgres 16 (pacote já instalado no sandbox) e
      `fake-gcs-server` (binário Go único, instalado via `go install`).
- [x] Validar `fake-gcs-server` no sandbox (subir binário, criar bucket, GET/PUT de teste)
      → OK: `go install github.com/fsouza/fake-gcs-server@latest`; smoke test
      criou bucket, fez upload e download via API JSON do GCS.
- [x] Validar Postgres local no sandbox (subir, conectar, aplicar migração de teste)
      → OK: cluster `16/main` via `pg_ctlcluster`, criação de role/DB, `CREATE TABLE`
      de teste aplicado e removido com sucesso.
- [x] Confirmar caminho de assinatura de URL do GCS (v4) e override de
      `response-content-disposition`
      → `@google-cloud/storage`: `file.getSignedUrl({version:'v4', action:'read'|'write',
      expires, responseDisposition})`. Em dev, client aponta `apiEndpoint` para o
      `fake-gcs-server` local com uma chave de serviço dummy (gerada localmente,
      nunca usada em prod); em prod, credenciais reais via Secret Manager/Workload
      Identity. Mesma chamada de SDK nos dois ambientes — só a configuração muda.

## 1. Estrutura do monorepo

- [x] Criar layout `apps/api`, `apps/web`, `packages/shared`, `infra/terraform`, `scripts`
      → `apps/web` é só o layout reservado (sem `package.json` ainda); a SPA
      é escopo de mudança futura. `infra/terraform` ainda vazio (seção 6).
- [x] Configurar workspaces Node/TS (tsconfig base, lint, formatação) na raiz
- [x] Definir `.env.example` com todas as chaves de configuração (dev e prod)

## 2. Seams de aplicação (interfaces, sem regra de negócio)

- [x] `StoragePort` — assinar URL de upload/download/view, resolver caminho `/{unit_id}/...`
- [x] Implementação GCS do `StoragePort` (prod) e apontamento para emulador (dev)
- [x] `DatabasePort` + camada de migrações (mesmo Postgres nos dois ambientes)
- [x] `SecretsPort` — Secret Manager (prod) / `.env` (dev)
- [x] `AuthPort` — esqueleto de hash argon2 (sem telas/CRUD)
- [x] Reservar ponto de extensão de conversão para preview de Office (sem implementar)
      → `ports/preview-conversion-port.ts` (interface, sem implementação)

## 3. Banco: isolamento por unidade (RLS)

- [x] Migração base com coluna `unit_id` nas tabelas tenant-scoped de fundação
- [x] Habilitar RLS e criar policies (`app.current_unit`, `app.user_role`, bypass global)
- [x] Middleware que abre transação e faz `SET LOCAL` de unidade/papel por requisição
- [x] Teste de isolamento: usuário da unidade A não acessa dados da unidade B
- [x] Teste de agregação: admin global enxerga todas as unidades
      → `rls-isolation.test.ts`, 4/4 testes verdes (inclui fail-closed sem contexto)

## 4. Emissão de URL assinada + auditoria

- [x] Tabela de auditoria (usuário, arquivo, ação, data/hora)
- [x] Endpoint `view-url`: checa permissão, grava `view`, assina URL `inline` TTL ~5min
- [x] Endpoint `download-url`: checa permissão, grava `download`, assina `attachment` TTL ~15–30min
- [x] Endpoint de upload: pré-check de cota + emissão de URL assinada
      → **Ajuste de implementação**: PUT direto (`action: 'write'`), não upload
      resumível. O fake-gcs-server de dev não inicia corretamente uma sessão
      resumível a partir de URL assinada v4 em estilo de caminho (perde o nome
      do objeto); PUT simples funciona idêntico nos dois ambientes e cobre o
      requisito de fundação. Retomada/chunking fica para mudança de feature
      futura, se o volume de vídeos grandes exigir. Ver `design.md`.
- [x] Endpoint de reconciliação pós-upload (notificação de finalização → atualiza uso)
      → `POST /internal/storage-events`; em prod é o alvo do push subscription
      do Pub/Sub (seção 6); em dev, chamado diretamente (validado manualmente)
- [x] Teste: solicitação sem permissão não emite URL e não registra acesso
      → `permission.test.ts`, 2/2 testes verdes

## 5. Ambiente de desenvolvimento (sandbox)

- [x] SessionStart hook idempotente: deps → Postgres → migração → seed condicional →
      fake-gcs-server → criação do bucket → health-check
      → `.claude/hooks/session-start.sh`; testado com dupla execução, sem
      duplicar serviços nem recriar seed
- [x] Alvo `make dev` para subir backend/frontend sob demanda
      → `Makefile`; `dev`/`dev-api` sobem a API. `dev-web` é um guard
      explícito até `apps/web` ter aplicação (mudança futura)
- [x] Garantir reexecução do hook sem duplicar serviços nem recriar seed
- [x] Registrar o hook em `.claude/settings.json` (SessionStart) para a sessão web

## 6. IaC de produção (Terraform / GCP)

- [x] Projeto/estado remoto do Terraform e variáveis por ambiente (prod)
      → `versions.tf` (backend `gcs` parcial), `variables.tf`,
      `terraform.tfvars.example`, `backend.hcl.example`; bootstrap do bucket
      de estado documentado no `infra/terraform/README.md`
- [x] Cloud Storage: bucket privado, uniform bucket-level access, sem binding público
      → `storage.tf`: `uniform_bucket_level_access = true`,
      `public_access_prevention = "enforced"`, CORS restrito às origens
      configuradas; nenhum binding `allUsers`/`allAuthenticatedUsers`
- [x] Cloud SQL (PostgreSQL) e conexão a partir do Cloud Run
      → `cloud_sql.tf` (Postgres 16, IP público sem `authorized_networks`) +
      `cloud_run.tf` (volume `cloud_sql_instance`, IAM `roles/cloudsql.client`)
- [x] Cloud Run (API) + service account com IAM de privilégio mínimo
      → `cloud_run.tf`: SA dedicada, acesso só aos 2 secrets que usa,
      `roles/storage.objectAdmin` restrito ao bucket de arquivos,
      auto-assinatura de URL via `roles/iam.serviceAccountTokenCreator`
      (sem chave privada exportada — ver nota de implementação abaixo)
- [x] Bucket + CDN para o SPA (frontend estático)
      → `frontend.tf`: bucket público + `backend_bucket` com CDN sempre
      criados; balanceador/certificado gerenciado só quando `frontend_domain`
      for definido (sem domínio real ainda, `apps/web` é só o layout)
- [x] Secret Manager e injeção dos segredos no Cloud Run
      → `secret_manager.tf` (DATABASE_URL, AUTH_SESSION_SECRET gerados via
      `random_password`) injetados como `value_source.secret_key_ref` nativo
      do Cloud Run v2 em `cloud_run.tf`
- [x] Artifact Registry para as imagens
      → `artifact_registry.tf`
- [x] Cloud Scheduler → Cloud Run Job (disparo diário 03:00) com job de exemplo
      → `scheduler.tf`: job placeholder (`cloudrun/container/job`), disparo
      diário 03:00 America/Sao_Paulo via Cloud Scheduler com OAuth de SA
      dedicada; lógica real de expurgo é do Épico 6 (fora de escopo)
- [x] Pub/Sub de notificação de finalização de objeto do bucket
      → `pubsub.tf`: tópico + assinatura push para
      `POST /internal/storage-events`, IAM do agente de serviço do GCS para
      publicar. **Gap de segurança documentado, não fechado nesta mudança**:
      o endpoint aceita qualquer chamada porque o Cloud Run também precisa
      ser público para o SPA — falta a aplicação validar o JWT OIDC do
      Pub/Sub. Ver `infra/terraform/README.md`.

Nota de implementação (assinatura de URL em prod): a service account do
Cloud Run assina URLs v4 via IAM Credentials API (`signBlob`), sem chave
privada de arquivo — só em dev (sandbox) existe uma chave dummy gerada
localmente. `STORAGE_SIGNER_KEY_PATH` não é setada no Cloud Run por isso.

Validação: `terraform fmt` e `terraform validate` passaram neste sandbox
(providers baixados manualmente para um mirror local, já que o registry do
Terraform não é alcançável aqui). **Aplicado com sucesso** contra o projeto
real `gdoc-502613` (ambiente de desenvolvimento separado, com `gcloud`
autenticado e Terraform disponível) — `terraform apply`, 53 recursos
criados, 0 destruídos. Ver a seção 8 acima para os três ajustes que só a API
real revelou (edição do Cloud SQL, service agent do GCS, memória mínima do
Cloud Run Job) e para a verificação do bucket. Backend remoto:
`gs://gdoc-502613-terraform-state`, prefixo `bootstrap-infrastructure`.

## 7. CI/CD (skeleton)

- [x] Pipeline: lint → build → test
      → `.github/workflows/ci.yml`, com Postgres real como serviço (os
      testes de RLS abrem transação de verdade); roda em todo push/PR.
      Rodado localmente com as mesmas variáveis de ambiente para conferir
      antes de commitar — passou (lint, build, 6/6 testes).
- [x] Build e push da imagem para o Artifact Registry
      → `apps/api/Dockerfile` (multi-stage; contexto = raiz do monorepo) +
      `.github/workflows/deploy.yml`. Autenticação por Workload Identity
      Federation (`infra/terraform/cicd.tf`), sem chave de service account.
- [x] Deploy da imagem no Cloud Run
      → `gcloud run deploy` no mesmo workflow, disparado quando o CI termina
      com sucesso em `main` (`workflow_run`)

**Achado corrigido durante esta etapa:** `packages/shared` apontava
`main`/`types` para `./src/index.ts` — funcionava em dev/test (tsx/vitest
transpilam na hora) mas quebrava a execução do build compilado
(`node dist/server.js` puro não sabe importar `.ts`). Corrigido: aponta para
`./dist/index.js`, com `postinstall` na raiz garantindo que `packages/shared`
seja buildado logo após `npm install`/`npm ci` (dev, CI e Docker build todos
passam por aí). Validado nos três caminhos de execução (`node` puro, `vitest`,
`tsx`) depois da correção.

**Validação do Dockerfile:** o pull da imagem base (`node:22-slim`) falhou
neste sandbox — o CDN do Docker Hub não está na allowlist de rede do
ambiente (mesma classe de limitação do registry do Terraform, seção 6). Não
deu para rodar `docker build` de ponta a ponta aqui. Em vez disso, simulei o
layout exato de arquivos que o estágio `runtime` do Dockerfile produziria
(sem `docker`, copiando só `node_modules` + `dist` + `package.json` para um
diretório isolado, sem nenhum `.ts` alcançável) e rodei `node
apps/api/dist/server.js` a partir dele — subiu e respondeu `/health`
normalmente, o que dá confiança de que a lógica de cópia do Dockerfile está
correta. O GitHub Actions real (runners com acesso irrestrito à internet)
deve conseguir buildar sem esse problema.

## 8. Prova de fundação ponta a ponta

- [x] Endpoint de saúde respondendo em dev — `{"status":"ok","db":"ok","storage":"ok"}`.
      Prod fica pendente até a seção 6 (precisa do Cloud Run implantado).
- [x] Fluxo mínimo upload → URL assinada → download exercitando GCS + Postgres
      → validado manualmente em dev: `upload-url` → PUT real →
      `/internal/storage-events` (cota) → `view-url` (bytes conferem) →
      `download-url`; usuário de outra unidade recebe 403 sem URL emitida;
      `audit_events` mostra exatamente os dois eventos do dono certo.
- [x] Confirmar que o bucket nega acesso direto sem assinatura válida
      → **Verificado contra o GCS real** após o primeiro `terraform apply`
      (projeto `gdoc-502613`): objeto de teste enviado via `gcloud storage cp`
      (autenticado) ao bucket `gdoc-502613-gdoc-prod-files`; `curl` sem
      nenhum parâmetro de assinatura contra
      `https://storage.googleapis.com/gdoc-502613-gdoc-prod-files/...`
      retornou `403 AccessDenied` ("Anonymous caller does not have
      storage.objects.get access"); leitura autenticada
      (`gcloud storage cat`) do mesmo objeto funcionou normalmente,
      confirmando que é uma negação de permissão (uniform bucket-level
      access, sem binding `allUsers`/`allAuthenticatedUsers`), não um bucket
      quebrado. Objeto de teste removido após a verificação. Lacuna do
      `fake-gcs-server` em dev (não aplica validação de assinatura em
      leitura) permanece documentada como limitação conhecida do emulador —
      só afeta dev, não prod.

      **Achados corrigidos durante o `apply` real** (não detectáveis por
      `terraform validate`/`fmt`, só contra a API real):
      - `google_sql_database_instance.main`: o projeto usa `ENTERPRISE_PLUS`
        como edição padrão do Cloud SQL, que não aceita o tier legado
        `db-f1-micro`. Corrigido fixando `edition = "ENTERPRISE"` em
        `cloud_sql.tf` (única edição que aceita tiers shared-core).
      - `google_pubsub_topic_iam_member.gcs_publisher`: o e-mail da
        identidade de serviço gerenciada do GCS era construído à mão por
        convenção, mas a conta só é provisionada na primeira leitura da data
        source correspondente. Corrigido usando
        `data.google_storage_project_service_account` em `pubsub.tf`, que
        força a criação antes do IAM binding.
      - `google_cloud_run_v2_job.trash_purge_example`: `memory = "256Mi"`
        está abaixo do piso de 512Mi exigido pelo Cloud Run gen2 com CPU
        sempre alocada. Corrigido para `512Mi` em `scheduler.tf`.
- [x] Documentar no README como rodar a prova nos dois ambientes
      → `README.md` (raiz); documentação de prod fica dependente da seção 6
