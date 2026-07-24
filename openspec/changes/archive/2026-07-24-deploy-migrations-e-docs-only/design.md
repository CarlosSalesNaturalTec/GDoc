## Context

O pipeline atual (`.github/workflows/deploy.yml`) é acionado por `workflow_run`
após o CI concluir com sucesso em `main`, e faz: `docker build` → `docker push`
→ `gcloud run deploy`. **Não há nenhum passo de migração de banco.** O runner
`apps/api/src/db/migrate.ts` (`runMigrations()`) é idempotente — cria
`schema_migrations`, lê as já aplicadas e aplica só as pendentes, cada uma em sua
transação — mas em produção só é invocado por `apps/api/src/db/bootstrap.ts`
(`runMigrations()` → `bootstrapAdmin()`), empacotado no Job Cloud Run
`${name_prefix}-bootstrap` (`infra/terraform/bootstrap_job.tf`), executado à mão
(`gcloud run jobs execute`). Resultado: quando um merge traz migrations novas, o
código sobe esperando o schema novo e o banco fica para trás → 500 generalizado
(o `attachTenantContext` relê `unit_id`/papel/status do banco a cada requisição).

O padrão de Job já está consolidado no repo: `bootstrap_job.tf` e o job de
`trash_purge` em `scheduler.tf` rodam a mesma imagem da API com `command=["node"]`
e um `args` apontando para um entrypoint compilado em `dist/`, com volume Cloud
SQL e `DATABASE_URL` via `secret_key_ref`. Convenção do repo: merge commit (nunca
squash); toda saída em pt_BR.

## Goals / Non-Goals

**Goals:**
- Aplicar migrations pendentes automaticamente no deploy, antes de trocar o
  tráfego para a revisão nova.
- Não disparar build/push/deploy quando o merge for docs-only.
- Reutilizar imagem/SA/integração Cloud SQL existentes; sem novos caminhos de
  rede nem novo código de aplicação.

**Non-Goals:**
- Estratégia expand/contract para migrations **destrutivas** (drop/rename), que
  quebrariam a revisão antiga na janela de troca — fora de escopo; o caso atual é
  aditivo.
- Auto-migração no boot do servidor.
- Rollback automático de migrations (o runner não desfaz; ver Migration Plan).

## Decisions

### D1 — Job Cloud Run dedicado `migrate`, não reuso do bootstrap nem boot-migrate

Cria-se `google_cloud_run_v2_job "migrate"` (`${name_prefix}-migrate`), espelhando
`bootstrap_job.tf` mas com `args=["apps/api/dist/db/migrate.js"]` e **sem** as env
`BOOTSTRAP_ADMIN_*`. Mantém `DATABASE_URL` via `secret_key_ref`, volume `cloudsql`,
service account da API, `NODE_ENV=production`, `DATABASE_SSL=false` (socket Unix
local), `SECRETS_DRIVER=env`. `lifecycle.ignore_changes` na imagem (igual aos
demais jobs): o Terraform cria com uma tag inicial e o CI/CD atualiza a imagem a
cada deploy.

`migrate.ts` já expõe entrypoint executável (`if (import.meta.url === ...)`),
sai com código ≠ 0 em falha, e `scripts/copy-migrations.mjs` (rodado no `build`)
garante os `.sql` em `dist/db/migrations`. Nada a mudar na app.

- **Alternativa: reusar o Job `bootstrap`.** `bootstrap.js` já roda
  `runMigrations()` antes de `bootstrapAdmin()` (no-op se admin existe) → zero
  Terraform novo. Rejeitada como estado final por sobrecarregar semântica e
  arrastar as deps `BOOTSTRAP_ADMIN_*` no caminho crítico de todo deploy; fica
  como **ponte manual** para desbloquear a produção hoje (ver Migration Plan).
- **Alternativa: `runMigrations()` no boot (`server.ts`).** Rejeitada: múltiplas
  instâncias do Cloud Run sobem em paralelo sem advisory lock — corrida no
  `INSERT` da PK de `schema_migrations` faria uma instância falhar e entrar em
  crash-loop. O repo separou boot de migração de propósito.

### D2 — Ordem: migrar antes de `gcloud run deploy`

O passo de migração roda **após** `docker push` e **antes** do `gcloud run deploy`,
com `--wait` (bloqueia até o job concluir; falha aborta o workflow). Assim a
revisão nova só recebe tráfego contra um schema já atualizado. Para migrations
aditivas/retrocompatíveis (caso atual) a revisão antiga continua válida durante a
migração. O passo:

```
gcloud run jobs update  "$MIGRATE_JOB" --image "$IMAGE:$SHA" --region ... --project ...
gcloud run jobs execute "$MIGRATE_JOB" --wait               --region ... --project ...
```

`jobs update --image` só troca a imagem (demais campos permanecem geridos pelo
Terraform). O nome do job vem de uma nova **variável de repositório**
(`GCP_MIGRATE_JOB` ou equivalente), já que `name_prefix` não é exposto ao GH hoje.

### D3 — Gate docs-only via `git diff` no próprio deploy

`workflow_run` não aceita filtro de `paths`, então o gate é um passo/job inicial
que roda `git diff --name-only "$SHA^1" "$SHA"` (checkout com
`fetch-depth: 0`/histórico suficiente). Como o repo usa merge commit, `SHA^1` é a
`main` anterior e o diff é exatamente o que o merge trouxe. Decisão docs-only:

```
docs-only = toda linha do diff casa com:  *.md  |  docs/**  |  openspec/**  |  LICENSE
```

Qualquer arquivo fora → deploya (fail-safe). Implementável como job `changes` com
`outputs.docs_only`, e `build-push-deploy` com
`if: needs.changes.outputs.docs_only == 'false'`. O gate vive **só no deploy** — o
CI continua rodando em todo push/PR (preserva o required check e evita o gotcha do
`paths-ignore` em check obrigatório).

## Risks / Trade-offs

- **Migration destrutiva quebra a revisão antiga na janela de troca** → fora de
  escopo; documentado como Non-Goal. Quando surgir, adotar expand/contract
  (adiciona coluna → deploy → backfill → deploy → remove).
- **Migração longa segura o deploy** → aceitável: preferimos deploy mais lento a
  revisão nova contra schema velho. `--wait` dá visibilidade da falha.
- **`SHA^1` em commit não-merge** (push direto raro em `main`) → o diff compara com
  o pai único, ainda correto; se não houver pai, o passo trata como "não
  docs-only" (deploya), fail-safe.
- **Nome do job dessincronizado entre Terraform e a var do GH** → mitigar
  documentando a var junto ao recurso e no README de infra.
- **Corrida de migração** → o Job roda em execução única por deploy
  (`concurrency` do deploy já serializa com `cancel-in-progress: false`); sem
  paralelismo, a ausência de advisory lock no runner não é problema aqui.

## Migration Plan

1. **Desbloqueio imediato da produção (manual, antes do pipeline):** executar o
   Job de bootstrap existente, que já aplica migrations —
   `gcloud run jobs execute ${name_prefix}-bootstrap --wait --region <region> --project <project>` —
   derrubando os 500 (`0011`, `0012`).
2. Terraform: adicionar `migrate_job.tf`; `terraform apply` cria
   `${name_prefix}-migrate`.
3. Criar a variável de repositório com o nome do job.
4. Editar `deploy.yml`: job `changes` (gate docs-only) + passo de migração antes
   do `run deploy`.
5. Validar num merge de código (migração roda e implanta) e num merge docs-only
   (pipeline pula).

**Rollback:** o runner não desfaz migrations. Reverter = redeploy da imagem
anterior (migrations aditivas são compatíveis com o código antigo). Para
reverter estrutura de banco, migration de compensação dedicada.
