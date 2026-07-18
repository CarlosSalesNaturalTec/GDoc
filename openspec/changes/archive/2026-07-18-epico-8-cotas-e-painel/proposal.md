## Why

O PRD (`docs/prd_final.md`, Épico 8 / **US 8.2**, RF #14) exige um **painel
gerencial** para o administrador acompanhar a saúde do repositório: cartões com
as estatísticas principais e gráficos de **quantidade de arquivos por tipo**,
**envios por mês** e **espaço utilizado versus disponível**, sempre **dentro do
seu alcance** (global ou de unidade). Hoje esse lado de leitura não existe:
nenhuma rota agrega os dados que já estão no banco (`files`, `users`,
`audit_events`) — o gestor não tem visibilidade nenhuma sobre uso.

O outro lado do épico — **US 8.1 (cota de 10 GB por pessoa)** — **já está
entregue e especificado**: `apps/api/src/routes/files.ts` bloqueia o
`upload-url` quando `storage_used_bytes + declaredSize` ultrapassa
`config.storageQuotaBytesPerUser` (10 GiB), e os cenários estão nos specs
`envio-lote` (reserva consciente do lote, US 8.1) e `gestao-arquivos`
(substituição respeita a cota pelo delta). Esta mudança **não reabre** a cota;
só a referencia como fonte do número exibido no painel. Coerente com o
fatiamento dos épicos anteriores (backend/API primeiro, `apps/web` segue
esqueleto), esta fatia entrega **apenas o contrato de agregação read-side**.

## What Changes

- **Rota agregada única (US 8.2 cenário 1)**: `GET /dashboard` devolve, numa só
  resposta e numa só transação (leitura consistente), quatro blocos:
  - **`cards`** — estatísticas principais (total de arquivos ativos, total de
    pessoas, espaço utilizado, percentual da cota consumido) no alcance do
    solicitante;
  - **`filesByType`** — contagem de arquivos por **categoria** (imagens, vídeos,
    áudios, PDFs, documentos de escritório, texto, outros), derivada do
    `content_type`;
  - **`uploadsByMonth`** — envios por mês nos últimos 12 meses, com meses sem
    envio preenchidos com zero (série estável para o gráfico);
  - **`storage`** — espaço utilizado versus disponível: `usedBytes`,
    `quotaBytesPerUser`, `userCount` e o derivado `capacityBytes`
    (`quota × userCount`) e `availableBytes`.
- **Alcance pela RLS, não por ramo de código (US 8.2 "dentro do meu alcance")**:
  a rota roda na `withTenantTransaction` já existente. Para o `unit_admin`, a
  RLS por `unit_id` restringe `files`/`users`/`audit_events` à sua unidade
  automaticamente; para o `global_admin`, o bypass agrega **todas** as unidades.
  As mesmas queries de agregação servem os dois alcances sem caso especial —
  o mesmo mecanismo que já governa o resto da aplicação (Épico 5).
- **Autorização admin-only (US 8.2 "autenticado como administrador")**: a rota é
  liberada apenas para `unit_admin` e `global_admin`. Um `collaborator` recebe
  **403** — o painel gerencial não é um recurso de colaborador.
- **O que conta como arquivo nas métricas**: apenas arquivo **vivo e efetivo**
  (`status = 'active' AND deleted_at IS NULL`). Itens `pending`/`over_quota`
  (ciclo de upload incompleto) e itens na lixeira (Épico 6) **não** entram nas
  contagens nem no espaço — o painel reflete conteúdo real armazenado.
- **Categoria de tipo num único lugar (reuso pelo Épico 9)**: o mapeamento
  `content_type` (MIME) → categoria vira um helper compartilhado em
  `packages/shared`, para que a **mesma** definição de "tipo" alimente o gráfico
  do painel agora e os filtros de tipo da busca (US 9.1) depois.

### Fora de escopo (mudanças futuras)

- **UI/SPA do painel** (`apps/web` segue esqueleto) — só o contrato de API.
- **US 8.1 (cota)**: já entregue e especificada; não é reaberta aqui.
- **Recorte por período/filtros no painel** (ex.: escolher intervalo de datas,
  ou por pessoa): a fatia entrega os agregados fixos das US 8.2; parametrização
  é extensão futura.
- **Cache/materialização dos agregados**: as queries rodam ao vivo a cada
  chamada; materialized view / cache fica para quando o volume exigir.
- **Métricas além das três definidas na US 8.2** (ex.: acessos por dia a partir
  de `audit_events`, ranking de arquivos mais acessados): o Épico 7 entregou a
  consulta de auditoria por arquivo; um analytics de auditoria é outra fatia.

## Capabilities

### New Capabilities
- `painel`: agregação read-side do uso do repositório — `GET /dashboard`
  devolve cartões de estatística e as três séries da US 8.2 (arquivos por tipo,
  envios por mês, espaço utilizado vs. disponível), restrito a administradores e
  com alcance (global/unidade) imposto pela RLS. Cobre **US 8.2** (cenário 1).

### Modified Capabilities
<!-- Nenhuma. US 8.1 (cota) já está especificada em envio-lote e gestao-arquivos
     e não muda de requisito; esta fatia só a lê para exibir. -->

## Impact

- **Código** (`apps/api/src`): nova rota `routes/dashboard.ts` (`GET
  /dashboard`) registrada em `app.ts` sob `attachTenantContext(ports)`; guarda
  admin-only a partir de `ctx.role`; agregações via `SELECT` sobre `files`,
  `users` e `audit_events` na transação tenant. Nenhuma mudança no lado de
  escrita (upload/cota/auditoria).
- **Contratos** (`packages/shared`): DTO da resposta do painel (cards,
  filesByType, uploadsByMonth, storage) e helper `fileCategory(contentType)`
  com o enum de categorias, exportados em `index.ts` (rebuild do pacote, pois é
  consumido compilado).
- **Banco** (`apps/api/src/db/migrations/`): **nenhuma migração** — os agregados
  leem tabelas e colunas já existentes (`files.status`/`content_type`/
  `size_bytes`/`created_at`/`deleted_at`, `users.storage_used_bytes`). Avaliar
  em design se um índice aditivo ajuda (`EXPLAIN`); se sim, entra como migração
  nova, sem editar nenhuma aplicada.
- **Infra / Paridade dev**: nenhuma — sem port novo, sem recurso de nuvem, sem
  mudança no SessionStart hook.
- **Testes** (`apps/api/src/__tests__`, padrão `seedTwoUnits`/
  `withSystemBypass`): `unit_admin` vê agregados só da sua unidade; `global_admin`
  vê o consolidado de todas; `collaborator` recebe 403; `pending`/`over_quota`/
  lixeira não entram nas contagens; categorização de tipo; envios por mês com
  zero-fill; espaço utilizado vs. disponível a partir de `storage_used_bytes`.
