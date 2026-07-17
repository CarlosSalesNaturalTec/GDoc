## 1. Motor de acesso — ramo admin da unidade

- [ ] 1.1 Em `apps/api/src/lib/access.ts`, estender `hasAccess` para carregar o
  `unit_id` do recurso (além de `owner_id`) e adicionar o ramo
  `ctx.role === 'unit_admin' AND resource.unit_id === ctx.unitId` à resolução
  (dono OU grant OU admin-da-unidade), mantendo fail-closed quando o recurso não
  existe/está escondido pela RLS (design.md D1).
- [ ] 1.2 Em `apps/api/src/lib/access.ts`, adicionar a variante administrativa de
  `visibleResourceClause` (ou parâmetro de papel) que colapsa o predicado de
  visibilidade em "todas as linhas visíveis" para `unit_admin`, preservando
  "próprios OU liberados" para `collaborator` (design.md D2).
- [ ] 1.3 Confirmar que `global_admin` NÃO ganha ramo de conteúdo (permanece como
  no Épico 4 — sem leitura ampla), conforme design.md D3.

## 2. Navegação e listagem com alcance administrativo

- [ ] 2.1 Em `apps/api/src/routes/folders.ts`, ramificar `listContents` por papel
  usando a variante de 1.2, de modo que o `unit_admin` veja todo o conteúdo do
  nível (raiz e pasta) e o `collaborator` mantenha a regra atual.
- [ ] 2.2 Verificar que a abertura de pasta (`GET /folders/:id/contents`) e o walk
  de `buildBreadcrumb` funcionam para o admin sobre pastas de terceiros da própria
  unidade (habilitados pelo ramo `VIEW` de 1.1), sem vazar cross-unit.
- [ ] 2.3 Confirmar que `routes/files.ts` (view/download/rename/replace) e o upload
  em pasta de terceiros passam a autorizar o `unit_admin` por reaproveitarem
  `hasAccess`, sem mudança de assinatura.

## 3. Testes — alcance administrativo (US 5.1 cenário 1)

- [ ] 3.1 Atualizar os testes do Épico 4 que fixavam admin sem acesso a conteúdo
  (403 em view/download/contents de terceiros) para o novo comportamento
  autorizado + auditado.
- [ ] 3.2 Adicionar testes de que o `unit_admin` emite `view-url`/`download-url` de
  arquivo de terceiro da própria unidade (URL emitida + linha de auditoria) e lista
  todo o conteúdo da unidade (raiz e pasta), incluindo abrir pasta de terceiro.
- [ ] 3.3 Adicionar teste de que o `unit_admin` recebe 403 ao tentar acessar/listar
  recurso de **outra** unidade (alcance não cruza a unidade).

## 4. Testes — isolamento do colaborador (US 5.1 cenário 2)

- [ ] 4.1 Adicionar/reforçar teste de que o colaborador nunca vê itens de outra
  unidade na listagem da raiz e de pastas.
- [ ] 4.2 Adicionar teste de link direto: colaborador aciona a rota de arquivo/pasta
  de outra unidade pelo id e recebe 403 sem vazar existência (nenhuma URL nem
  pré-visualização).
- [ ] 4.3 Rodar a suíte sequencial (`fileParallelism: false`) verde:
  `npm run lint && npm run build && npm run test` na raiz.

## 5. Infra / paridade dev

- [ ] 5.1 Nenhuma tarefa de infraestrutura (Terraform/GCP) — sem novos recursos de
  nuvem; isolamento e papel já provisionados.
- [ ] 5.2 Nenhuma tarefa de paridade de sandbox (SessionStart hook) — sem migração
  de schema nem novo serviço local.
