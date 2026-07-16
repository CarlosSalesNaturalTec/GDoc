# Tasks — bootstrap-infrastructure

Ordem pensada para reduzir risco cedo: spikes primeiro, depois os seams, o
ambiente dev, a IaC de prod, o pipeline e, por fim, a prova ponta a ponta.
Nenhuma feature do PRD entra aqui.

## 0. Spikes e decisões técnicas

- [ ] Verificar disponibilidade de Docker no sandbox (`docker`, `docker compose`) e
      decidir o mecanismo do hook: compose vs binários nativos
- [ ] Validar `fake-gcs-server` no sandbox (subir binário, criar bucket, GET/PUT de teste)
- [ ] Validar Postgres local no sandbox (subir, conectar, aplicar migração de teste)
- [ ] Confirmar caminho de assinatura de URL do GCS (v4) e override de
      `response-content-disposition`

## 1. Estrutura do monorepo

- [ ] Criar layout `apps/api`, `apps/web`, `packages/shared`, `infra/terraform`, `scripts`
- [ ] Configurar workspaces Node/TS (tsconfig base, lint, formatação) na raiz
- [ ] Definir `.env.example` com todas as chaves de configuração (dev e prod)

## 2. Seams de aplicação (interfaces, sem regra de negócio)

- [ ] `StoragePort` — assinar URL de upload/download/view, resolver caminho `/{unit_id}/...`
- [ ] Implementação GCS do `StoragePort` (prod) e apontamento para emulador (dev)
- [ ] `DatabasePort` + camada de migrações (mesmo Postgres nos dois ambientes)
- [ ] `SecretsPort` — Secret Manager (prod) / `.env` (dev)
- [ ] `AuthPort` — esqueleto de hash argon2 (sem telas/CRUD)
- [ ] Reservar ponto de extensão de conversão para preview de Office (sem implementar)

## 3. Banco: isolamento por unidade (RLS)

- [ ] Migração base com coluna `unit_id` nas tabelas tenant-scoped de fundação
- [ ] Habilitar RLS e criar policies (`app.current_unit`, `app.user_role`, bypass global)
- [ ] Middleware que abre transação e faz `SET LOCAL` de unidade/papel por requisição
- [ ] Teste de isolamento: usuário da unidade A não acessa dados da unidade B
- [ ] Teste de agregação: admin global enxerga todas as unidades

## 4. Emissão de URL assinada + auditoria

- [ ] Tabela de auditoria (usuário, arquivo, ação, data/hora)
- [ ] Endpoint `view-url`: checa permissão, grava `view`, assina URL `inline` TTL ~5min
- [ ] Endpoint `download-url`: checa permissão, grava `download`, assina `attachment` TTL ~15–30min
- [ ] Endpoint de upload: pré-check de cota + emissão de sessão resumável
- [ ] Endpoint de reconciliação pós-upload (notificação de finalização → atualiza uso)
- [ ] Teste: solicitação sem permissão não emite URL e não registra acesso

## 5. Ambiente de desenvolvimento (sandbox)

- [ ] SessionStart hook idempotente: deps → Postgres → migração → seed condicional →
      fake-gcs-server → criação do bucket → health-check
- [ ] Alvo `make dev` para subir backend/frontend sob demanda
- [ ] Garantir reexecução do hook sem duplicar serviços nem recriar seed
- [ ] Registrar o hook em `.claude/settings.json` (SessionStart) para a sessão web

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

- [ ] Endpoint de saúde respondendo em dev e prod
- [ ] Fluxo mínimo upload → URL assinada → download exercitando GCS + Postgres
- [ ] Confirmar que o bucket nega acesso direto sem assinatura válida
- [ ] Documentar no README como rodar a prova nos dois ambientes
