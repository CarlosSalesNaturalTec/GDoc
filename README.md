# GDoc

Repositório documental corporativo com governança de acesso — permissões
granulares, isolamento por unidade, auditoria e lixeira com retenção. Ver
`docs/prd_final.md` para o produto completo.

Este README cobre apenas a **fundação de infraestrutura** (mudança
`bootstrap-infrastructure` em `openspec/changes/`) — monorepo, seams de
aplicação, ambiente de desenvolvimento e a prova de que os trilhos funcionam.
Nenhuma feature do PRD está implementada ainda.

## Estrutura

```
apps/api/          # backend Node/TS — único guardião de permissão
apps/web/          # layout reservado para a SPA (mudança futura)
packages/shared/    # tipos/contratos compartilhados
infra/terraform/    # IaC de produção (GCP) — em progresso
scripts/            # utilitários de dev (ex.: gerar chave dummy de assinatura)
.claude/hooks/       # SessionStart hook: provisiona o ambiente de dev
```

## Ambiente de desenvolvimento (Claude Code web/sandbox)

O `SessionStart` hook (`.claude/hooks/session-start.sh`) provisiona, de forma
idempotente, o equivalente dev dos recursos de produção:

- **Postgres local** (`pg_ctlcluster`) ↔ Cloud SQL em prod
- **fake-gcs-server** ↔ Cloud Storage em prod (mesmo protocolo JSON do GCS)
- Chave de assinatura dummy (`.dev/fake-gcs-signer-key.json`, gerada localmente,
  nunca usada em produção)

Ele roda automaticamente ao abrir uma sessão. Para rodar manualmente:

```bash
CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
```

Depois, para subir a API:

```bash
make dev-api
# ou: npm run dev --workspace apps/api
```

## Testes e lint

```bash
npm run lint --workspaces --if-present
npm run test --workspace apps/api
```

## Prova de fundação ponta a ponta (manual)

Com a API rodando em `:8080`, o fluxo abaixo exercita GCS (via emulador) e
Postgres (RLS + auditoria) de ponta a ponta. Requer um `x-gdoc-user-id` de um
usuário existente (o seed de dev cria alguns — ver `apps/api/src/db/seed.ts`).

```bash
# 1. Saúde
curl http://127.0.0.1:8080/health

# 2. Pedir URL de upload (checa cota, cria o registro do arquivo)
curl -X POST http://127.0.0.1:8080/files/upload-url \
  -H "x-gdoc-user-id: <USER_ID>" -H "Content-Type: application/json" \
  -d '{"fileName":"teste.txt","contentType":"text/plain","declaredSizeBytes":5}'
# -> { uploadUrl, objectPath, expiresAt }

# 3. Enviar os bytes de verdade
curl -X PUT "<uploadUrl>" -H "Content-Type: text/plain" --data-binary "olar"

# 4. Reconciliar cota (em prod: push subscription do Pub/Sub; em dev: manual)
curl -X POST http://127.0.0.1:8080/internal/storage-events \
  -H "Content-Type: application/json" \
  -d '{"objectPath":"<objectPath>","sizeBytes":5}'

# 5. Pedir URL de visualização/download (checa permissão via RLS, grava auditoria)
curl -X POST http://127.0.0.1:8080/files/<FILE_ID>/view-url -H "x-gdoc-user-id: <USER_ID>"
curl -X POST http://127.0.0.1:8080/files/<FILE_ID>/download-url -H "x-gdoc-user-id: <USER_ID>"
```

Um usuário de outra unidade recebe `403` em `view-url`/`download-url` sem
nenhuma URL emitida nem auditoria gravada (isolamento por RLS, fail-closed).

**Limitação conhecida do emulador:** o `fake-gcs-server` não aplica validação
de assinatura em leituras (um `GET` direto sem assinatura também retorna
`200`). Isso é uma característica de emuladores de GCS — eles emulam a
superfície da API, não o modelo de autorização do Google. A garantia de
"bucket privado, sem acesso direto" depende da configuração real do bucket em
produção (uniform bucket-level access, sem binding público) e só é
verificável contra o GCS real, após o Terraform ser aplicado.

## Produção (GCP)

IaC em `infra/terraform/` (ver `openspec/changes/bootstrap-infrastructure/tasks.md`,
seção 6, para o que falta provisionar).
