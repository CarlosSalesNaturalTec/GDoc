## 1. Contrato e categoria de tipo (packages/shared)

- [x] 1.1 Adicionar em `packages/shared/src` o enum de categorias de tipo
  (`image` | `video` | `audio` | `pdf` | `office` | `text` | `other`) e o helper
  `fileCategory(contentType: string | null): FileCategory` (mapeamento MIME →
  categoria, com fallback `other`) — design D5
- [x] 1.2 Adicionar o DTO da resposta do painel: `cards` (totalFiles, totalPeople,
  usedBytes, quotaUsedPct), `filesByType` (por categoria), `uploadsByMonth`
  (12 entradas `{ month, count }`), `storage` (usedBytes, quotaBytesPerUser,
  userCount, capacityBytes, availableBytes) — design D3/D6/D7
- [x] 1.3 Exportar tudo em `index.ts` e rebuildar: `npm run build --workspace
  packages/shared` (consumido compilado por `apps/api`)

## 2. Rota agregada (routes/dashboard.ts)

- [x] 2.1 Criar `apps/api/src/routes/dashboard.ts` com `GET /dashboard`, abrindo
  sua própria `withTenantTransaction` (padrão das demais rotas tenant) — design D1
- [x] 2.2 Guarda admin-only: se `ctx.role` não for `unit_admin` nem
  `global_admin`, responder **403** antes de qualquer query — design D2
- [x] 2.3 Query de arquivos por tipo: `SELECT content_type, count(*) FROM files
  WHERE status = 'active' AND deleted_at IS NULL GROUP BY content_type`; dobrar os
  pares em categorias com `fileCategory` (task 1.1) — design D4/D5
- [x] 2.4 Query de envios por mês: agregar arquivos ativos por
  `date_trunc('month', created_at)` nos últimos 12 meses; na rota, zero-fill dos
  meses ausentes, sempre 12 entradas em ordem cronológica — design D6
- [x] 2.5 Query de espaço: `SELECT count(*) AS user_count, coalesce(sum(
  storage_used_bytes),0) AS used FROM users`; `quotaBytesPerUser` de
  `config.storageQuotaBytesPerUser`; derivar `capacityBytes = quota × userCount`
  e `availableBytes = max(0, capacity − used)` — design D7
- [x] 2.6 Montar `cards` reaproveitando os agregados já computados (soma de
  `filesByType`, `userCount`, `usedBytes`, `usedBytes/capacityBytes` com guarda
  de divisão por zero) — design D9
- [x] 2.7 Registrar a rota em `apps/api/src/app.ts` sob
  `attachTenantContext(ports)`, junto das demais rotas tenant

## 3. Índice de leitura (avaliar — design D8)

- [x] 3.1 Rodar `EXPLAIN` das queries das tasks 2.3/2.4 contra dados de teste;
  decidir se um índice aditivo em `files (unit_id, created_at) WHERE deleted_at
  IS NULL AND status = 'active'` compensa nesta fatia
- [x] 3.2 Se sim, criar **nova** migração aditiva em
  `apps/api/src/db/migrations/00NN_*.sql` com `CREATE INDEX IF NOT EXISTS ...`
  (nunca editar migração aplicada); se não, registrar a decisão em comentário na
  rota e pular

## 4. Testes (apps/api/src/__tests__)

- [x] 4.1 Novo arquivo de teste no padrão `seedTwoUnits` / `withSystemBypass`
  (execução sequencial, `fileParallelism: false`)
- [x] 4.2 `unit_admin` recebe agregados **só da sua unidade** (arquivos, pessoas,
  espaço), sem dados da outra unidade (US 8.2 alcance de unidade)
- [x] 4.3 `global_admin` recebe o consolidado das duas unidades (US 8.2 alcance
  global)
- [x] 4.4 `collaborator` recebe **403** (design D2)
- [x] 4.5 Arquivos `pending`/`over_quota` e itens na lixeira (`deleted_at` setado)
  **não** entram em nenhum cartão nem gráfico (design D4)
- [x] 4.6 `filesByType` categoriza corretamente (semear tipos variados: imagem,
  PDF, office, e um MIME desconhecido → `other`) (design D5)
- [x] 4.7 `uploadsByMonth` retorna 12 entradas com zero-fill nos meses sem envio,
  em ordem cronológica (design D6)
- [x] 4.8 `storage` calcula `usedBytes`/`capacityBytes`/`availableBytes` a partir
  de `storage_used_bytes` e da cota; alcance sem pessoas ⇒ capacidade e % zero,
  sem erro (design D7 / spec "Alcance sem pessoas")

## 5. Fechamento

- [x] 5.1 `npm run lint && npm run build && npm run test --workspace apps/api`
  verdes
- [x] 5.2 `openspec verify --change epico-8-cotas-e-painel` (ou `/opsx:verify`)
  antes de arquivar
