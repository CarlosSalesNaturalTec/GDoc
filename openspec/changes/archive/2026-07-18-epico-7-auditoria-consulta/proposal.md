## Why

O PRD (`docs/prd_final.md`, Épico 7 / **US 7.1** e **US 7.2**, RF #9 e #11)
exige que os acessos a um arquivo sejam **consultáveis**: o administrador
precisa comprovar quem visualizou ou baixou cada arquivo (com data e hora,
dentro do seu alcance), e o dono de um arquivo tem o direito de acompanhar os
acessos ao material que **ele mesmo** enviou. Hoje só existe o **lado de
escrita**: `apps/api/src/routes/files.ts` já grava um `audit_events` a cada
emissão de `view-url`/`download-url` (a tabela existe desde a migração `0001`,
com RLS por unidade), mas **não há nenhuma rota que leia esse registro** — o
histórico é gravado e nunca pode ser consultado. Esta mudança entrega apenas o
lado de leitura, fechando essa ponta solta sem tocar em como os eventos são
gravados.

## What Changes

- **Rota de consulta por arquivo (US 7.1 cenário 1 / US 7.2 cenário 1)**:
  `GET /files/:id/audit` retorna os eventos de **acesso** (`view` / `download`)
  daquele arquivo, ordenados do mais recente para o mais antigo, cada um com
  **quem** realizou a ação (nome/e-mail, via join em `users`), **qual** ação e
  **quando** (`created_at`).
- **Autorização própria de auditoria — dono OU admin da unidade (RF #9/#11)**:
  a consulta é liberada **apenas** para o dono do arquivo (`files.owner_id`) ou
  para o administrador da unidade do arquivo (`isAdminOfUnit`). É
  **deliberadamente mais estrita** que `hasAccess`: um colaborador que só possui
  um grant `view`/`download` **não** enxerga a auditoria — ver quem mais acessou
  o arquivo é um direito de dono/admin, não um efeito colateral de poder abrir o
  arquivo. Reusa `isAdminOfUnit` de `lib/access.ts` (mesma trava de bypass do
  `global_admin`: admin só dentro da própria unidade), mas **sem** o ramo de
  grant.
- **Escopo de unidade preservado (US 7.2 "não vejo registros de outras
  pessoas")**: a RLS de `audit_events` por `unit_id` continua sendo a fronteira
  real; a rota roda na transação tenant já aberta, então eventos de arquivo de
  outra unidade nunca aparecem. Para o dono não-admin, o filtro adicional é o
  próprio `owner_id = ctx.userId` do arquivo — só a auditoria dos arquivos que
  ele enviou.
- **Fail-closed sem vazar existência (alinhado à US 4.2)**: pedir a auditoria de
  um arquivo que não é seu (nem você é admin da unidade), ou que não existe, ou
  que a RLS de outra unidade esconde, retorna **403 sem corpo de auditoria** —
  o mesmo padrão já usado em `files.ts` para view/download-url, sem distinguir
  "não existe" de "não é seu".
- **Item na lixeira**: a consulta enxerga apenas arquivo **vivo**
  (`deleted_at IS NULL`), consistente com a resolução de acesso do Épico 6 —
  auditoria de item excluído resolve como inexistente (403). A retenção do
  histórico **após o expurgo** permanece como estava (o expurgo do Épico 6
  apaga a auditoria junto) — não é reaberta aqui.

### Fora de escopo (mudanças futuras)

- **Feed agregado "todos os meus arquivos"** numa única tela (sem escolher um
  arquivo): US 7.2 é satisfeita por arquivo; um consolidado multi-arquivo é
  extensão futura de UI/API.
- **Consulta dos demais tipos de evento** já registrados na tabela
  (`upload`/`rename`/`replace`/`delete`/`restore`, adicionados pelas migrações
  `0004`/`0008`): esta fatia expõe só os eventos de **acesso** (`view`/
  `download`), exatamente o que RF #11 e as US 7.1/7.2 definem ("visualizou ou
  baixou"). Expor a trilha completa de operações é decisão futura.
- **Paginação/streaming** de históricos muito grandes: esta fatia ordena por
  `created_at` desc com um limite superior fixo; cursor/paginação fica para
  quando o volume exigir.
- **Retenção de auditoria após expurgo do arquivo**: mantém-se o comportamento
  do Épico 6 (auditoria some junto no expurgo) — não é alterada aqui.
- **UI/SPA** de auditoria (`apps/web` segue esqueleto) — só o contrato de API.

## Capabilities

### New Capabilities
- `auditoria`: consulta (lado de leitura) do registro de acesso a um arquivo —
  `GET /files/:id/audit` retorna os eventos `view`/`download` com quem, qual
  ação e quando, autorizado **apenas** para o dono do arquivo ou o admin da sua
  unidade, fail-closed e restrito à unidade pela RLS. Cobre **US 7.1** (cenário
  1) e **US 7.2** (cenário 1).

### Modified Capabilities
<!-- Nenhuma: a gravação de eventos (controle-acesso/gestao-arquivos) não muda;
     esta fatia só adiciona uma via de leitura, que é capacidade nova. -->

## Impact

- **Código** (`apps/api/src`): nova rota `routes/audit.ts` (`GET
  /files/:id/audit`) registrada em `app.ts` sob `attachTenantContext`; reuso de
  `lib/access.ts` (`isAdminOfUnit`) — possível pequeno helper de autorização
  "dono-ou-admin" ali. Nenhuma mudança no lado de escrita de auditoria.
- **Banco** (`apps/api/src/db/migrations/`): **nenhuma migração** — a tabela
  `audit_events` e sua RLS já existem; a consulta é `SELECT` com join em
  `users`. (Avaliar em design se um índice por `file_id` ajuda a consulta; se
  sim, entra como migração aditiva, sem editar nenhuma aplicada.)
- **Contratos** (`packages/shared`): DTO de resposta da auditoria (item com
  ator {id, nome, e-mail}, ação, timestamp).
- **Infra / Paridade dev**: nenhuma — sem port novo, sem recurso de nuvem, sem
  mudança no SessionStart hook.
- **Testes** (`apps/api/src/__tests__`, padrão `seedTwoUnits`/
  `withSystemBypass`): dono vê a auditoria do próprio arquivo; admin da unidade
  vê a de qualquer arquivo da unidade; colaborador com grant `view` **não** vê
  (403); isolamento entre unidades na consulta; arquivo inexistente/na lixeira
  → 403; ordenação desc e conteúdo do evento (ator + ação + data/hora).
