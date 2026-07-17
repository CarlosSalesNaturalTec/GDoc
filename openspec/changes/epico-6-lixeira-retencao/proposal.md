## Why

O PRD (`docs/prd_final.md`, Épico 6 / **US 6.1**, RF #12) exige que a exclusão
seja **reversível por 30 dias**: item excluído vai para uma lixeira, pode ser
restaurado ao local de origem com as permissões que possuía e, passado o prazo,
é apagado de forma permanente e automática por uma rotina diária às 3h. Hoje
nada disso existe — e, na prática, **não há nenhuma forma de excluir um
arquivo**: o verbo `delete` já está no enum `Permission` e no `CHECK` de
`grants` (migration `0007`), mas **sem rota consumidora**. A infra já tem o
gancho pronto: `infra/terraform/scheduler.tf` provisiona o Cloud Scheduler → Cloud
Run Job diário às 03:00, mas o job é um **placeholder** ("a lógica real de
expurgo é do Épico 6"). Esta mudança entrega a exclusão, a retenção e o expurgo
de ponta a ponta, fechando essa ponta solta.

## What Changes

- **Marcação de exclusão (soft-delete)** em `files` e `folders`: colunas
  aditivas `deleted_at` / `deleted_by` (e um agrupador de operação para
  restauração de subárvore). `deleted_at IS NULL` = vivo. Não se reaproveita a
  coluna `status` (que rastreia o ciclo de upload: `pending`/`active`/
  `over_quota`/`replacing`) — exclusão é ortogonal ao ciclo de upload.
- **Rotas de exclusão (US 6.1 cenário 1)**: `DELETE /files/:id` e
  `DELETE /folders/:id`, resolvidas pela regra de acesso já existente
  (`hasAccess` com o verbo `delete` — dono OU grant `delete` OU admin da
  unidade). Excluir pasta **cascateia** (soft) para todo o conteúdo interno,
  agrupado numa mesma operação de lixeira.
- **Restauração ao local de origem com permissões preservadas (US 6.1
  cenário 1)**: `POST /files/:id/restore` e `POST /folders/:id/restore`. Como o
  soft-delete **nunca move linhas nem apaga grants**, restaurar é limpar
  `deleted_at` — o item volta ao `folder_id`/`parent_id` original com os grants
  intactos. Restaurar uma pasta restaura a subárvore excluída junto.
- **Listagem da lixeira**: `GET /trash` lista os itens excluídos que o
  solicitante pode restaurar (raízes de exclusão no seu alcance: próprias, com
  grant `delete`, ou toda a unidade se admin).
- **Itens na lixeira somem de todas as visões vivas**: a resolução de acesso
  (`hasAccess`, `visibleResourceClause`, busca de arquivo/pasta) passa a filtrar
  `deleted_at IS NULL` — item excluído não aparece na navegação, não emite
  view/download-url, não pode ser renomeado/substituído (comporta-se como
  ausente, com o mesmo 403 fail-closed já usado, sem vazar existência).
- **Expurgo diário às 3h (US 6.1 cenário 2)**: job standalone
  (`apps/api/src/jobs/purge-trash.ts`, executável por `npm run` em dev — mesmo
  padrão de `migrate.ts` — e como Cloud Run Job em prod) que apaga
  permanentemente os itens com mais de 30 dias na lixeira: remove os bytes no
  storage (novo `StoragePort.deleteObject`), devolve a cota ao dono e apaga as
  linhas (arquivos, pastas, grants órfãos e a auditoria dos arquivos
  expurgados). Tolerante a falha por item (uma falha de exclusão de objeto não
  derruba o lote — reentra no próximo ciclo).
- **`StoragePort` ganha `deleteObject(objectPath)`** (implementado no adapter
  GCS e no `InMemoryStoragePort` de teste) — hoje o port só assina URLs, não
  remove objetos.
- **Cota durante a retenção**: bytes de item na lixeira **continuam contando**
  contra os 10 GB do dono até o expurgo (os bytes ainda ocupam o bucket); a cota
  só é devolvida quando o expurgo remove o objeto de fato — ver design D6.
- **Terraform**: o Cloud Run Job placeholder passa a apontar para a imagem da
  API com o entrypoint de expurgo (tarefa de infra, separada da paridade de
  dev, conforme regra de tasks).

### Fora de escopo (mudanças futuras)

- **Exclusão permanente imediata / "esvaziar lixeira"** pelo usuário para
  liberar cota antes dos 30 dias — extensão futura; nesta fatia o único caminho
  de liberação é o expurgo automático no vencimento.
- **Restaurar item cujo ancestral já foi expurgado** com escolha de destino —
  ver decisão de design (por ora só raízes de exclusão são restauráveis).
- **Retenção do histórico de auditoria após o expurgo do arquivo** — nesta fatia
  a auditoria do arquivo é apagada junto no expurgo (ver design D7/D10); manter
  auditoria pós-expurgo é decisão do Épico 7.
- **UI/SPA** da lixeira (`apps/web` segue esqueleto) e **consulta de auditoria**
  (Épico 7), **painel de cota** (Épico 8), **busca/filtros** (Épico 9),
  **avisos de expiração de permissão** (Épico 4 Fatia B — o mesmo Scheduler
  também os cobrirá, fora desta fatia).

## Capabilities

### New Capabilities
- `lixeira`: exclusão reversível com retenção de 30 dias — soft-delete de
  arquivos e pastas (cascata em pasta), restauração ao local de origem com
  permissões preservadas, listagem da lixeira e expurgo permanente automático
  diário às 3h. Cobre **US 6.1** (cenários 1 e 2).

### Modified Capabilities
- `controle-acesso`: o verbo `delete` — hoje declarado em `grants`/`Permission`
  mas **sem consumidor** — ganha rotas de exclusão resolvidas por `hasAccess`; e
  a resolução de acesso e a listagem passam a **excluir itens na lixeira**
  (`deleted_at IS NULL`), de modo que item excluído deixa de ser acessível por
  navegação, view/download ou link direto.

## Impact

- **Banco** (`apps/api/src/db/migrations/`): nova migração aditiva com
  `deleted_at`/`deleted_by`/agrupador de exclusão em `files` e `folders` (+
  índices para o filtro de vivos e para a varredura do expurgo), e ajuste do FK
  de `audit_events.file_id` para permitir o expurgo apagar a auditoria do
  arquivo. Nenhuma migração aplicada é editada.
- **Código** (`apps/api/src`): `routes/files.ts` e `routes/folders.ts` (rotas
  DELETE + restore + `GET /trash`); `lib/access.ts` e as buscas de recurso
  (filtro `deleted_at IS NULL`); `ports/storage-port.ts` +
  `adapters/gcs-storage-port.ts` + `__tests__/in-memory-storage-port.ts`
  (`deleteObject`); novo `jobs/purge-trash.ts` + script `npm run`; `config.ts`
  (`TRASH_RETENTION_DAYS`, default 30).
- **Contratos** (`packages/shared`): DTOs de resposta da lixeira/restauração e,
  se necessário, o enum de ação de auditoria (`delete`/`restore`).
- **Infra** (`infra/terraform/scheduler.tf`): job de expurgo passa a rodar a
  imagem da API com o entrypoint real (a topologia Scheduler→Job já existe).
- **Paridade dev** (SessionStart hook): nenhuma mudança de provisionamento; o
  expurgo roda sob demanda via `npm run`, documentado no README.
- **Testes** (`apps/api/src/__tests__`, padrão `seedTwoUnits`/`withSystemBypass`):
  exclusão/restauração, sumiço do item excluído das visões vivas, cascata de
  pasta, isolamento entre unidades na exclusão, e o expurgo (vencidos apagados +
  bytes removidos + cota devolvida; item dentro do prazo intacto).
