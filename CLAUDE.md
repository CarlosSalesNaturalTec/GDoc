# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma e convenções

- **Toda saída do modelo (respostas, mensagens de commit, PRs, specs) é sempre em pt_BR.**
- Integrações (merge de PR) usam **merge commit — nunca squash.**
- Node **22** (`.nvmrc`); npm workspaces. `postinstall` na raiz compila `packages/shared` automaticamente.

## Documento mestre: `docs/prd_final.md`

O PRD é a fonte da verdade do produto — define personas, escopo do MVP, épicos e os **critérios de aceite (Dado/Quando/Então) de cada história de usuário (US x.y)**. Todo change OpenSpec implementa um recorte do PRD, e as specs **referenciam a US** em vez de reescrever critérios. Ao planejar ou implementar qualquer feature de domínio, **leia a US relevante no PRD primeiro** — os cenários de erro e casos de borda ali são vinculantes, não sugestões. O código já contém comentários que citam a US e a decisão de design correspondente (ex.: `US 1.2, cenário 3; design.md Decisão D1`); mantenha esse rastro ao alterar.

## Fluxo de trabalho OpenSpec

O repositório é **spec-driven** (`openspec/config.yaml`). Cada épico/fatia vira um *change* em `openspec/changes/` (proposal.md, design.md, specs/*/spec.md, tasks.md), é implementado, e depois arquivado em `openspec/changes/archive/` com as specs sincronizadas em `openspec/specs/`. Use os skills `opsx:*` (ou `openspec-*`) para propor, aplicar, verificar e arquivar. As specs arquivadas em `openspec/specs/` são o registro consolidado do comportamento atual — consulte-as para entender uma feature já entregue. Escreva proposals/specs em português, no estilo já existente.

## Comandos

```bash
# raiz (todos os workspaces via --if-present)
npm run lint            # eslint
npm run build           # tsc (shared → api → web)
npm run test            # vitest run em cada workspace
npm run format          # prettier --write .

# subir a app (dev)
make dev-api            # = npm run dev --workspace apps/api  (tsx watch, :8080)
npm run dev:web         # SPA Vite (proxy p/ a API na mesma origem)

# banco / storage (dev)
npm run migrate --workspace apps/api    # aplica migrations SQL numeradas
npm run seed --workspace apps/api       # popula dados de dev (idempotente)
npm run purge:trash --workspace apps/api  # roda o job de expurgo da lixeira

# se editar packages/shared/src, recompile para os consumidores enxergarem:
npm run build --workspace packages/shared

# um único teste (vitest)
npm run test --workspace apps/api -- src/__tests__/permission.test.ts
npm run test --workspace apps/api -- -t "nome do caso"
```

**Ambiente de dev:** o hook `.claude/hooks/session-start.sh` (SessionStart, só roda com `CLAUDE_CODE_REMOTE=true`) provisiona de forma idempotente o Postgres local (↔ Cloud SQL) e o `fake-gcs-server` (↔ Cloud Storage), migra e faz seed. Ele **não** sobe a app — isso é sob demanda. `.env` local espelha `.env.example`; em prod os valores vêm do Secret Manager.

## Arquitetura

Monorepo com três workspaces:

- **`apps/api`** — backend Express/TypeScript (ESM, `type: module`). É o **único guardião de permissão**: toda ação (visualizar, baixar, enviar, alterar, excluir) é validada no servidor a cada requisição.
- **`apps/web`** — SPA React (Vite, Ant Design, React Router, TanStack Query, Zod). Organizada por feature (`auth/`, `navegacao/`, `upload/`, `busca/`, `visualizacao/`, `shell/`). Nunca é a linha de defesa — só reflete o que a API autoriza.
- **`packages/shared`** — DTOs e enums (`UserRole`, `Permission`, `GrantResourceType`) compartilhados. **Consumido compilado de `dist/`**, não da fonte TS.

### Ports & Adapters (seams) — paridade dev↔prod

O código de negócio depende só das **interfaces** em `apps/api/src/ports/` (`StoragePort`, `DatabasePort`, `SecretsPort`, `AuthPort`). As implementações vivem em `apps/api/src/adapters/`. **`ports/index.ts::createPorts()` é o único ponto que escolhe a implementação ativa** (via `config`), trocando GCS↔fake-gcs, Secret Manager↔env, etc. A paridade dev↔prod é mantida por esses seams — **nunca acople código de negócio direto a SDKs de nuvem**. Postgres é o mesmo em dev e prod.

### Isolamento por unidade (multi-tenant) — o núcleo de segurança

Duas camadas, ambas obrigatórias:

1. **RLS no Postgres por coluna `unit_id`** (migration `0002_enable_rls.sql`) — a linha de defesa real. Toda query tenant-scoped roda dentro de `DatabasePort.withTenantTransaction(ctx, fn)`, que faz `SET LOCAL app.current_unit / app.user_role` **por transação** (nunca `SET` de sessão — seria vazado pelo connection pool). Tabela nova com dado de unidade **exige** coluna `unit_id` e policy RLS.
2. **Resolução de acesso na aplicação** — centralizada em `apps/api/src/lib/access.ts`. Regra única: **dono OU admin da unidade do recurso OU grant do verbo exigido**, **sem herança** (grant numa pasta não libera o conteúdo interno), **fail-closed** (recurso inexistente ou de outra unidade → `false`, sem distinguir os casos).

`attachTenantContext` (middleware) relê `unit_id`/papel/status do banco a **cada** requisição a partir da sessão em cookie `HttpOnly` — nunca confia no token — para que desativar uma conta corte o acesso na hora (US 1.2 cenário 3).

**Trava do bypass de `global_admin`:** o bypass de RLS do admin global vale **só para agregados** (contagens/somas do painel). Rotas de **conteúdo** (bytes, listagem de itens, auditoria) sempre comparam `resource.unit_id === ctx.unitId` explicitamente antes de conceder pelo ramo admin — o admin global **nunca** é olho universal sobre bytes/auditoria de outra unidade. Não reabrir esse furo em rotas novas.

### Tráfego de bytes

Bytes **nunca** passam pela API. Fluxo: a rota checa permissão → emite **URL assinada de TTL curto** do bucket privado → o cliente faz PUT/GET direto no storage. `view-url` (~5 min) e `download-url` (~15–30 min) são **ações distintas, auditadas separadamente**. Prefixo do objeto: `/{unit_id}/{owner_id}/{uuid}`. Acesso a arquivo por link direto sem permissão → `403` sem preview (é a rota da app que é protegida; o bucket é privado com uniform bucket-level access). Reconciliação de cota (10 GB/pessoa) vem de evento de finalize do GCS (Pub/Sub em prod; `POST /internal/storage-events` manual em dev).

### Rotas e camadas (`apps/api/src`)

`server.ts` → `app.ts` (monta os routers; rotas tenant-scoped passam por `attachTenantContext`) → `routes/*` (HTTP + validação) → `lib/*` (`access.ts`, `folder-tree.ts`, `search-filters.ts`, regras puras) → `ports/*` (seams). `db/migrations/*.sql` são numeradas e aplicadas em ordem por `db/migrate.ts`. Jobs (`jobs/purge-trash.ts`) rodam via Cloud Run Jobs + Scheduler em prod (03:00, retenção 30 dias) e por `npm run` em dev.

### Testes

Vitest em ambos os apps. A API testa contra o Postgres real (`__tests__/test-db.ts`) e usa um `in-memory-storage-port` no lugar do GCS. Os testes de segurança/isolamento (`rls-isolation.test.ts`, `isolamento-unidade.test.ts`, `permission.test.ts`) codificam os invariantes acima — trate-os como parte do contrato, não como testes descartáveis. A web testa componentes com Testing Library + jsdom, mockando `fetch`/`XHR`.

### Produção (GCP)

IaC em `infra/terraform/` (Cloud Run para a API, Cloud SQL, Cloud Storage, Scheduler+Jobs, Secret Manager, Pub/Sub, bucket+CDN para a SPA). CI (`.github/workflows/ci.yml`) roda lint/build/test com Postgres de serviço; deploy (`deploy.yml`) builda a imagem da API e faz deploy no Cloud Run via Workload Identity Federation ao passar em `main`.
