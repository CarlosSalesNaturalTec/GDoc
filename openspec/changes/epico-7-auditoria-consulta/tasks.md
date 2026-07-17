## 1. Contrato (packages/shared)

- [ ] 1.1 Adicionar DTO de resposta da auditoria em `packages/shared/src`
  (item com `actor: { id, name, email }`, `action: 'view' | 'download'`,
  `createdAt: string`) e exportar em `index.ts`
- [ ] 1.2 Rebuild do pacote: `npm run build --workspace packages/shared`
  (consumido compilado por `apps/api`)

## 2. Autorização de leitura (lib/access.ts)

- [ ] 2.1 Adicionar helper `canReadAudit(client, ctx, fileId)` em
  `apps/api/src/lib/access.ts`: `SELECT owner_id, unit_id FROM files WHERE id = $1
  AND deleted_at IS NULL`; retorna autorizado quando
  `owner_id = ctx.userId` OU `isAdminOfUnit(ctx, unit_id)` — **sem** consultar
  `grants` (design D2). Fail-closed: arquivo inexistente/na lixeira ⇒ negado
- [ ] 2.2 Documentar no comentário do helper por que é mais estrito que
  `hasAccess` (não passa por grant) e a trava de bypass do `global_admin`
  (reuso de `isAdminOfUnit`)

## 3. Rota de consulta (routes/audit.ts)

- [ ] 3.1 Criar `apps/api/src/routes/audit.ts` com `GET /files/:id/audit`,
  abrindo sua própria `withTenantTransaction` (padrão das demais rotas tenant)
- [ ] 3.2 Autorizar via `canReadAudit`; se negado, responder **403 sem corpo de
  auditoria** (design D4), sem distinguir inexistente/outra-unidade/não-dono
- [ ] 3.3 Consultar eventos: `SELECT ae.action, ae.created_at, u.id, u.name,
  u.email FROM audit_events ae JOIN users u ON u.id = ae.user_id WHERE
  ae.file_id = $1 AND ae.action IN ('view','download') ORDER BY ae.created_at
  DESC LIMIT <teto>` (design D5/D6); mapear para o DTO da task 1.1
- [ ] 3.4 Definir o teto superior como constante interna (design D6, ex.: 500)
- [ ] 3.5 Registrar a rota em `apps/api/src/app.ts` sob
  `attachTenantContext(ports)`, junto das demais rotas tenant

## 4. Índice de leitura (avaliar — design D7)

- [ ] 4.1 Rodar `EXPLAIN` da consulta da task 3.3 contra dados de teste; decidir
  se `audit_events (file_id, created_at DESC)` compensa nesta fatia
- [ ] 4.2 Se sim, criar **nova** migração aditiva
  `apps/api/src/db/migrations/00NN_audit_file_index.sql` com
  `CREATE INDEX IF NOT EXISTS ...` (nunca editar migração aplicada); se não,
  registrar a decisão no comentário da rota e pular

## 5. Testes (apps/api/src/__tests__)

- [ ] 5.1 Novo arquivo de teste no padrão `seedTwoUnits` / `withSystemBypass`
  (execução sequencial, `fileParallelism: false`)
- [ ] 5.2 Dono consulta a auditoria do próprio arquivo e vê os eventos
  `view`/`download` com ator + ação + data/hora, ordenados desc (US 7.2)
- [ ] 5.3 Admin da unidade consulta a auditoria de arquivo da unidade do qual
  não é dono e vê os eventos (US 7.1)
- [ ] 5.4 Colaborador com grant `view` (não dono, não admin) recebe **403**
  (design D2 — grant não concede auditoria)
- [ ] 5.5 Isolamento entre unidades: pessoa da unidade A recebe 403 ao consultar
  auditoria de arquivo da unidade B, sem vazar existência
- [ ] 5.6 Arquivo inexistente ⇒ 403; arquivo na lixeira (`deleted_at` setado)
  ⇒ 403 (mesmo resultado, fail-closed)
- [ ] 5.7 Arquivo sem eventos ⇒ 200 com lista vazia; e que apenas
  `view`/`download` são retornados (evento não-acesso, se semeado, não aparece)

## 6. Fechamento

- [ ] 6.1 `npm run lint && npm run build && npm run test --workspace apps/api`
  verdes
- [ ] 6.2 `openspec verify --change epico-7-auditoria-consulta` (ou
  `/opsx:verify`) antes de arquivar
