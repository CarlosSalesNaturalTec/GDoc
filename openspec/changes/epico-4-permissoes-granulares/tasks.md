# Tasks — epico-4-permissoes-granulares

## 1. Banco (migração aditiva)

- [ ] 1.1 Criar `apps/api/src/db/migrations/0007_grants.sql`: tabela `grants`
  (`id`, `unit_id` → units, `subject_user_id` → users, `resource_type` CHECK
  in ('folder','file'), `resource_id` uuid, `permission` CHECK in
  ('view','download','upload','rename','delete'), `granted_by` → users,
  `created_at`), sem editar migração já aplicada.
- [ ] 1.2 Índice único `(unit_id, subject_user_id, resource_type, resource_id,
  permission)` (idempotência de concessão) e índice de lookup
  `(subject_user_id, resource_type, permission)` para a resolução.
- [ ] 1.3 `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy `unit_isolation` em
  `grants`, no mesmo formato de `0002_enable_rls.sql` (USING e WITH CHECK por
  `unit_id`/`global_admin`).
- [ ] 1.4 Rodar `npm run migrate --workspace apps/api` e confirmar aplicação.

## 2. DTOs compartilhados (packages/shared)

- [ ] 2.1 Criar `packages/shared/src/permissions.ts`: enum `Permission`
  (VIEW/DOWNLOAD/UPLOAD/RENAME/DELETE), `GrantResourceType` (FOLDER/FILE) e os
  contratos `CreateGrantRequest` (`subjectUserId`, `resourceType`, `resourceId`,
  `permissions: Permission[]`), `GrantResponse` e `GrantListResponse`.
- [ ] 2.2 Exportar `./permissions.js` em `packages/shared/src/index.ts` e rodar
  `npm run build --workspace packages/shared` (consumido compilado).

## 3. Resolução de acesso (helper reutilizável)

- [ ] 3.1 Criar `apps/api/src/lib/access.ts` com `hasAccess(client, ctx,
  resourceType, resourceId, permission)` = **dono OU grant do verbo**, sem walk de
  ancestrais (sem herança), executado na transação tenant já aberta pela rota.
- [ ] 3.2 Expor helpers de listagem (`visibleFolderIdsClause`/`visibleFileClause`
  ou equivalente) para filtrar itens próprios OU com grant `view`, reutilizáveis
  em `listContents`.

## 4. Endpoints de gestão de permissão (routes/grants.ts, admin-only)

- [ ] 4.1 Criar `apps/api/src/routes/grants.ts` com `isAdmin(ctx)` (padrão de
  `routes/users.ts`) barrando `collaborator` com 403.
- [ ] 4.2 `POST /grants`: valida corpo; confirma que o recurso existe na unidade
  (sob RLS) e que `subjectUserId` é pessoa da unidade — recusa sem vazar
  existência (404/403); insere uma linha por verbo com `ON CONFLICT DO NOTHING`
  (idempotente); preenche `unit_id` a partir do recurso e `granted_by = ctx.userId`.
- [ ] 4.3 `GET /grants?resourceType=&resourceId=`: lista as concessões do recurso
  (RLS restringe unit_admin à unidade; bypass a global_admin).
- [ ] 4.4 `DELETE /grants/:id`: revoga uma concessão (remove a linha), sem tocar
  em `audit_events`.
- [ ] 4.5 Registrar `grantsRouter(ports)` em `apps/api/src/app.ts`.

## 5. Imposição nos endpoints de arquivo (routes/files.ts)

- [ ] 5.1 `POST /files/:id/view-url`: trocar "só RLS" por `hasAccess(... 'view')`
  (dono-ou-grant); negado ⇒ 403 sem URL e **sem** auditoria.
- [ ] 5.2 `POST /files/:id/download-url`: idem exigindo `download`.
- [ ] 5.3 `PATCH /files/:id` e `POST /files/:id/replace-url`: trocar
  `owner_id === ctx.userId` por `hasAccess(... 'rename')`.
- [ ] 5.4 `POST /files/upload-url` e `POST /files/upload-urls`: quando o destino é
  pasta de outra pessoa, exigir `hasAccess(... 'upload')` sobre a pasta-âncora;
  raiz e pasta própria seguem livres para o remetente.

## 6. Imposição na navegação (routes/folders.ts)

- [ ] 6.1 `GET /folders/:id/contents`: permitir abrir por dono **ou** grant `view`
  sobre a pasta (antes: só dono); negado ⇒ 403 sem vazar existência.
- [ ] 6.2 `listContents` (raiz e por pasta): devolver pastas e arquivos
  **próprios OU com grant `view`**, usando os helpers da tarefa 3.2 — fecha a
  US 2.1 cenário 2, sem herança.

## 7. Testes (apps/api/src/__tests__)

- [ ] 7.1 `grants.test.ts`: `collaborator` recebe 403 ao conceder/listar/revogar;
  admin concede (idempotente), lista e revoga; RLS isola grants entre unidades
  (unit_admin não vê/concede grant de outra unidade).
- [ ] 7.2 Estender `permission.test.ts`: não-dono da mesma unidade recebe 403 em
  view-url/download-url **sem** gravar auditoria; com grant `view`/`download`
  acessa e a auditoria é gravada.
- [ ] 7.3 Sem herança: grant `view` em pasta não expõe arquivos internos; grant
  `view` no arquivo interno libera só ele.
- [ ] 7.4 Listagem: `GET /folders/:id/contents` e raiz retornam itens próprios +
  liberados e ocultam os de terceiros; abrir pasta sem posse/`view` ⇒ 403.
- [ ] 7.5 `rename`/`replace` e `upload` em pasta alheia bloqueados sem o verbo e
  permitidos com ele.
- [ ] 7.6 Rodar `npm run lint`, `npm run build` e `npm run test` (vitest
  sequencial) verdes.
