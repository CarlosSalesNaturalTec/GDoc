# Tasks — epico-9-busca-e-filtros

## 1. Banco (migração aditiva)

- [x] 1.1 Criado `apps/api/src/db/migrations/0010_search_indexes.sql`:
  `CREATE EXTENSION IF NOT EXISTS pg_trgm` + índice GIN trigram em
  `files (file_name gin_trgm_ops)` para o `ILIKE` parcial de nome (design.md D5).
- [x] 1.2 No mesmo arquivo, índice B-tree em `files (owner_id)` para o filtro de
  autor.
- [x] 1.3 `npm run migrate --workspace apps/api` aplicado; confirmado via
  `\dx pg_trgm` + `\di` (extensão e os dois índices presentes).

## 2. Contratos compartilhados (packages/shared)

- [x] 2.1 **Revisado (design.md D4):** `FileCategory`/`fileCategory` já
  existem em `packages/shared/src/dashboard.ts` (Épico 8, 7 valores —
  `IMAGE`/`VIDEO`/`AUDIO`/`PDF`/`OFFICE`/`TEXT`/`OTHER`). Não criar um
  segundo enum (colidiria no barrel `export *`); reusar tal como está.
  Exportar `OFFICE_CONTENT_TYPES` de `dashboard.ts` (antes privado) para o
  helper de predicados do item 3 consumir a mesma lista de MIMEs Office.
- [x] 2.2 Criado `packages/shared/src/search.ts` com `SearchFilesQuery`
  (`q?`, `type?: FileCategory` — importado de `./dashboard.js`, `author?`,
  `dateFrom?`, `dateTo?`) e `SearchFilesResponse` (`{ files: FileSummaryResponse[] }`).
- [x] 2.3 Exportado `./search.js` em `packages/shared/src/index.ts`; `npm run
  build --workspace packages/shared` verde.

## 3. Tradução categoria → predicados SQL (helper reutilizável)

- [x] 3.1 `apps/api/src/lib/search-filters.ts`: `categoryContentTypeClause(FileCategory)`
  devolve o fragmento SQL de `content_type` (design.md D4); `office` usa
  `OFFICE_CONTENT_TYPES` importado do `shared`; `other` nega as demais
  categorias incluindo `content_type IS NULL`. Também `isValidFileCategory`
  para a validação de entrada (item 4.4).
- [x] 3.2 Mesmo arquivo: `parseDateBoundary`/`exclusiveDayAfter` — `created_at
  >= dateFrom` e `created_at < dateTo + 1 dia`, valores passados como
  parâmetros `$n` pela rota (design.md D6).

## 4. Rota de busca (routes/search.ts)

- [x] 4.1 Criado `apps/api/src/routes/search.ts` com `GET /files/search`,
  rodando em `withTenantTransaction(ctx, …)` (design.md D3).
- [x] 4.2 `WHERE` começa sempre por `visibleResourceClause(GrantResourceType.FILE,
  ownerPlaceholder, ctx)`; `ownerPlaceholder`/param do dono só entram quando
  não-admin (design.md D2), mesmo padrão de `listContents`.
- [x] 4.3 Filtros anexados em AND (nome/tipo/autor/data), todos os valores de
  usuário como parâmetros `$n`; `SELECT` das colunas de `FileSummaryRow`,
  `ORDER BY created_at DESC LIMIT 500`.
- [x] 4.4 Validação: `type` fora do enum, `author` não-uuid, `dateFrom`/`dateTo`
  inválidos ⇒ `400` sem executar a busca. Ausência de filtros é válida
  (design.md D7).
- [x] 4.5 `searchRouter(ports)` registrado em `apps/api/src/app.ts` sob
  `attachTenantContext`.

## 5. Testes (apps/api/src/__tests__, padrão seedTwoUnits/withSystemBypass)

- [x] 5.1 `search.test.ts`: busca por nome parcial (case-insensível) retorna os
  arquivos visíveis que casam; nome sem correspondência ⇒ vazio.
- [x] 5.2 Cada filtro isolado (um arquivo por categoria, incluindo
  `content_type IS NULL` ⇒ `other`) e todos combinados (AND: nome + tipo +
  autor + data) ⇒ interseção.
- [x] 5.3 Alcance de permissão: colaborador **não** acha arquivo de terceiro sem
  grant; com grant `view` acha; admin da unidade acha.
- [x] 5.4 Isolamento entre unidades: nome idêntico em arquivo de outra unidade
  **não** aparece; `global_admin` não vira alcance sobre outra unidade (US 5.1
  cenário 2).
- [x] 5.5 Item na lixeira não aparece na busca; busca sem filtros devolve todo o
  visível; ordenação `created_at` desc; entrada malformada (`type`/`author`/
  `dateFrom`) ⇒ 400.
- [x] 5.6 `apps/api/src/__tests__/file-category.test.ts`: as 7 categorias
  existentes (incluindo `office` com MIME legado e OOXML) mapeiam
  corretamente, `null` ⇒ `OTHER`.

## 6. Gates

- [x] 6.1 `npm run lint`, `npm run build` e `npm run test` (117 testes, 16
  arquivos) verdes.
