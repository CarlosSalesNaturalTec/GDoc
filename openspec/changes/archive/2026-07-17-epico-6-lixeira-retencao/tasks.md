## 1. Schema (migração aditiva)

- [x] 1.1 Criar `apps/api/src/db/migrations/00NN_trash_retention.sql` (próximo número livre; não editar migração aplicada) com, em `files` e `folders`: colunas `deleted_at timestamptz`, `deleted_by uuid REFERENCES users(id)`, `trash_root_id uuid` (design.md D1)
- [x] 1.2 Adicionar índices parciais `WHERE deleted_at IS NOT NULL` em `files(deleted_at)` e `folders(deleted_at)` para a varredura do expurgo
- [x] 1.3 No mesmo arquivo: ampliar o `CHECK` de `audit_events.action` para incluir `delete` e `restore` (padrão do `0004`), e alterar o FK `audit_events.file_id` para `ON DELETE CASCADE` (design.md D10)
- [x] 1.4 Rodar `npm run migrate --workspace apps/api` e confirmar aplicação; conferir que as policies RLS de `files`/`folders` seguem intactas (colunas ficam em tabela já protegida — nada a acrescentar na policy)

## 2. Contratos compartilhados (`packages/shared`)

- [x] 2.1 Acrescentar `AuditAction.DELETE`/`AuditAction.RESTORE` em `packages/shared/src/audit.ts` (verbo `Permission.DELETE` já existe)
- [x] 2.2 Adicionar DTOs de resposta da lixeira e da restauração (item excluído: id, tipo, nome, `deletedAt`, `expiresAt`; resposta de restore com destino efetivo)
- [x] 2.3 `npm run build --workspace packages/shared` (consumido de `dist/`, não do source)

## 3. Exclusão da lixeira em toda visão viva (`lib/access.ts` e buscas)

- [x] 3.1 Em `hasAccess` (`apps/api/src/lib/access.ts`): acrescentar `AND deleted_at IS NULL` ao `SELECT` do recurso, para que item na lixeira resolva como inexistente (design.md D2; spec controle-acesso — "Recurso na lixeira resolve como inexistente")
- [x] 3.2 Em `visibleResourceClause` e nas queries de `listContents` (`routes/folders.ts`): acrescentar `deleted_at IS NULL` para ocultar itens excluídos da navegação (inclusive para o admin da unidade)
- [x] 3.3 Em `findFolderById`/validação de âncora (`lib/folder-tree.ts`): filtrar `deleted_at IS NULL` (breadcrumb e upload não enxergam pasta excluída)
- [x] 3.4 Teste: excluir e confirmar 403/ausência em view-url, download-url, rename, replace, contents e link direto por id (fail-closed, sem vazar existência)

## 4. StoragePort — exclusão de bytes

- [x] 4.1 Adicionar `deleteObject(objectPath: string): Promise<void>` (idempotente, ignora ausência) em `apps/api/src/ports/storage-port.ts` (design.md D8)
- [x] 4.2 Implementar no `adapters/gcs-storage-port.ts` (`bucket.file(path).delete({ ignoreNotFound: true })`) e no `__tests__/in-memory-storage-port.ts`
- [x] 4.3 Teste do InMemory: `deleteObject` remove o objeto e é idempotente (segunda chamada não lança)

## 5. Rotas de exclusão, restauração e lixeira

- [x] 5.1 `DELETE /files/:id` (`routes/files.ts`): resolve por `hasAccess(..., Permission.DELETE)`; marca `deleted_at=now()`, `deleted_by=ctx.userId`, `trash_root_id=id`; grava auditoria `delete` (design.md D3)
- [x] 5.2 `DELETE /folders/:id` (`routes/folders.ts`): resolve `delete`; cascateia soft-delete para a subárvore (walk recursivo ou CTE) com o mesmo `deleted_at` e `trash_root_id=<pasta>`, preservando o agrupamento de itens já excluídos antes (design.md D4)
- [x] 5.3 `POST /files/:id/restore` e `POST /folders/:id/restore`: exigem o mesmo alcance do delete sobre a raiz de exclusão; limpam `deleted_at`/`deleted_by`/`trash_root_id`; pasta restaura a subárvore por `trash_root_id`; arquivo cujo pai não existe mais volta à raiz (`folder_id=NULL`) informando o destino; gravam auditoria `restore` (design.md D5)
- [x] 5.4 `GET /trash`: lista as raízes de exclusão (`deleted_at IS NOT NULL AND trash_root_id=id`) no alcance do solicitante (próprias, grant `delete`, ou toda a unidade se admin), com nome/tipo/`deletedAt`/`expiresAt` (design.md D9)
- [x] 5.5 Registrar os routers/handlers e confirmar ordem de rotas (evitar captura de `:id` por caminhos fixos, como já feito com `/folders/root/contents`)

## 6. Job de expurgo (paridade dev via script)

- [x] 6.1 Adicionar `TRASH_RETENTION_DAYS` (default 30) em `apps/api/src/config.ts` (12-factor, resolvido junto aos demais não-segredos)
- [x] 6.2 Criar `apps/api/src/jobs/purge-trash.ts` (padrão de `migrate.ts`): sob contexto de sistema (`global_admin`/bypass), varre `deleted_at < now() - TRASH_RETENTION_DAYS`; por arquivo, na ordem bytes→cota→auditoria→grants→linha, tolerante a falha por item; pastas por último (folhas→raiz) (design.md D7)
- [x] 6.3 Adicionar script `"purge:trash"` em `apps/api/package.json` (`tsx src/jobs/purge-trash.ts`); garantir que o build gere `dist/jobs/purge-trash.js` para o entrypoint de produção
- [x] 6.4 Documentar no README a execução manual do expurgo em dev (mesmo estilo do fluxo manual de `storage-events`)

## 7. Testes (padrão `seedTwoUnits` / `withSystemBypass`)

- [x] 7.1 Exclusão: dono, grant `delete` e admin da unidade excluem; sem alcance → 403 sem vazar existência
- [x] 7.2 Cascata de pasta: subárvore inteira some das visões vivas; item previamente excluído mantém seu agrupamento
- [x] 7.3 Restauração: arquivo volta ao `folder_id` de origem com grants preservados; pasta restaura a subárvore; arquivo com pai expurgado volta à raiz
- [x] 7.4 Isolamento: `collaborator`/admin não excluem nem restauram nem veem na lixeira recurso de outra unidade (RLS + alcance)
- [x] 7.5 Cota: excluir não altera `storage_used_bytes`; expurgo o reduz pelo tamanho do arquivo (design.md D6)
- [x] 7.6 Expurgo: item >30d é apagado (bytes removidos via InMemory, linhas/grants/auditoria apagados, cota devolvida); item <30d intacto; falha de `deleteObject` de um item não derruba o lote

## 8. Infraestrutura (Terraform — GCP)

- [x] 8.1 Em `infra/terraform/scheduler.tf`: apontar o Cloud Run Job de expurgo para a imagem da API com o entrypoint `dist/jobs/purge-trash.js` (substituir a imagem placeholder), injetando as variáveis de banco/`TRASH_RETENTION_DAYS`; manter Scheduler→Job e IAM já existentes
- [x] 8.2 Atualizar `infra/terraform/README.md` registrando que o expurgo agora tem lógica real (Épico 6) e a variável de retenção

## 9. Fechamento

- [x] 9.1 `npm run lint && npm run build && npm run test` verdes na raiz
- [x] 9.2 Revisar o cabeçalho de `lib/access.ts` e comentários para refletir o filtro de lixeira, sem reabrir o furo de bytes cross-unit do `global_admin`
