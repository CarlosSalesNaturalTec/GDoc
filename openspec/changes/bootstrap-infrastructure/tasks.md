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

- [ ] Projeto/estado remoto do Terraform e variáveis por ambiente (prod)
- [ ] Cloud Storage: bucket privado, uniform bucket-level access, sem binding público
- [ ] Cloud SQL (PostgreSQL) e conexão a partir do Cloud Run
- [ ] Cloud Run (API) + service account com IAM de privilégio mínimo
- [ ] Bucket + CDN para o SPA (frontend estático)
- [ ] Secret Manager e injeção dos segredos no Cloud Run
- [ ] Artifact Registry para as imagens
- [ ] Cloud Scheduler → Cloud Run Job (disparo diário 03:00) com job de exemplo
- [ ] Pub/Sub de notificação de finalização de objeto do bucket

## 7. CI/CD (skeleton)

- [ ] Pipeline: lint → build → test
- [ ] Build e push da imagem para o Artifact Registry
- [ ] Deploy da imagem no Cloud Run

## 8. Prova de fundação ponta a ponta

- [x] Endpoint de saúde respondendo em dev — `{"status":"ok","db":"ok","storage":"ok"}`.
      Prod fica pendente até a seção 6 (precisa do Cloud Run implantado).
- [x] Fluxo mínimo upload → URL assinada → download exercitando GCS + Postgres
      → validado manualmente em dev: `upload-url` → PUT real →
      `/internal/storage-events` (cota) → `view-url` (bytes conferem) →
      `download-url`; usuário de outra unidade recebe 403 sem URL emitida;
      `audit_events` mostra exatamente os dois eventos do dono certo.
- [ ] Confirmar que o bucket nega acesso direto sem assinatura válida
      → **Lacuna de fidelidade do emulador**: o `fake-gcs-server` não aplica
      validação de assinatura em leitura (um `GET` sem nenhum parâmetro de
      assinatura retornou 200). Isso é uma limitação conhecida de emuladores
      de GCS — eles emulam a superfície da API, não o modelo de autorização
      do Google. A negação real depende da configuração do bucket
      (uniform bucket-level access, sem binding `allUsers`/`allAuthenticatedUsers`)
      provisionada em produção (seção 6) e só pode ser verificada contra o
      GCS real após o `terraform apply`. Deixar este item pendente até essa
      verificação em prod; não é um requisito satisfazível em dev.
- [x] Documentar no README como rodar a prova nos dois ambientes
      → `README.md` (raiz); documentação de prod fica dependente da seção 6
