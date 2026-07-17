## 1. Resolução de acesso (lib/access.ts)

- [ ] 1.1 Adicionar helper `isAdminOfUnit(ctx, resourceUnitId): boolean` — `true` quando `ctx.role` é `unit_admin` ou `global_admin` **e** `resourceUnitId === ctx.unitId`; exportar para reuso e teste
- [ ] 1.2 Em `hasAccess`, passar a ler `unit_id` além de `owner_id` no `SELECT`, e conceder pelo ramo `isAdminOfUnit(ctx, resource.unit_id)` antes da checagem de grant (mantendo fail-closed quando o recurso não existe)
- [ ] 1.3 Alterar a assinatura de `visibleResourceClause` para receber o `ctx` e ramificar: admin da unidade da listagem → `TRUE` (não-`global_admin`) ou `unit_id = '<ctx.unitId>'` (`global_admin`, travando o bypass); não-admin → fragmento "próprio OU liberado" atual
- [ ] 1.4 Documentar no cabeçalho de `lib/access.ts` a regra "bypass de RLS para agregados, nunca para bytes/itens" (design.md D3), para não reabrir o furo do `global_admin`

## 2. Rotas de conteúdo

- [ ] 2.1 Atualizar os dois call sites de `visibleResourceClause` em `routes/folders.ts` (listagem da raiz e de pasta) para passar o `ctx`
- [ ] 2.2 Confirmar que `routes/files.ts` (`view-url`, `download-url`, `PATCH`, `replace-url`, `upload-url(s)`) usa `hasAccess` e passa a herdar o ramo admin sem mudança de assinatura; ajustar apenas se algum handler checar posse fora de `hasAccess`
- [ ] 2.3 Confirmar que a checagem de abrir pasta (`GET /folders/:id/contents`) usa `hasAccess` com `view` e agora concede ao admin da unidade

## 3. Testes (apps/api/src/__tests__)

- [ ] 3.1 `unit_admin` acessa `view-url`/`download-url`, renomeia/substitui e lista conteúdo **não-próprio** da própria unidade (sem grant); e vê todos os itens da pasta
- [ ] 3.2 `unit_admin` e `collaborator` recebem 403 ao tentar recurso de **outra** unidade (por id direto) sem vazar existência
- [ ] 3.3 Regressão da Opção B: `global_admin` recebe 403 ao pedir `view-url` de arquivo de outra unidade (sem URL, sem auditoria), mas acessa arquivo da própria unidade
- [ ] 3.4 Listagem do `global_admin` não traz itens de outra unidade (bypass travado na consulta)
- [ ] 3.5 Regressão: `collaborator` mantém dono-ou-grant intacto (cenários do Épico 4 continuam passando)

## 4. Verificação

- [ ] 4.1 `npm run lint && npm run build && npm run test` verdes
- [ ] 4.2 Rodar `/opsx:verify` e conferir que os cenários de `isolamento-unidade` e as MODIFIED de `controle-acesso` estão cobertos
