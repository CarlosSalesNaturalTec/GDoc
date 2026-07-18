# Tasks — epico-9-busca-e-filtros

## 1. Banco (migração aditiva)

- [ ] 1.1 Criar `apps/api/src/db/migrations/00NN_search_indexes.sql` (próximo
  número livre, sem editar migração aplicada): `CREATE EXTENSION IF NOT EXISTS
  pg_trgm` + índice GIN trigram em `files (file_name gin_trgm_ops)` para o
  `ILIKE` parcial de nome (design.md D5).
- [ ] 1.2 No mesmo arquivo, índice B-tree em `files (owner_id)` para o filtro de
  autor (design.md D6/Open Question) — se confirmado desnecessário na
  implementação, remover, mas por padrão incluir.
- [ ] 1.3 Rodar `npm run migrate --workspace apps/api` e confirmar aplicação
  (extensão criada + índices presentes).

## 2. Contratos compartilhados (packages/shared)

- [ ] 2.1 Criar `packages/shared/src/search.ts`: enum `FileCategory`
  (`IMAGE`/`VIDEO`/`AUDIO`/`PDF`/`DOCUMENT`/`OTHER`) e função
  `fileCategory(contentType: string | null): FileCategory` — fonte única do
  mapeamento categoria↔MIME (design.md D4), com a lista de MIMEs Office
  (Word/Excel/PowerPoint, OOXML + legados) e `text/*` em `DOCUMENT`, `null` ⇒
  `OTHER`.
- [ ] 2.2 No mesmo arquivo, contrato `SearchFilesQuery` (`q?`, `type?:
  FileCategory`, `author?`, `dateFrom?`, `dateTo?`) e reuso de
  `FileSummaryResponse` como item da resposta (`SearchFilesResponse`).
- [ ] 2.3 Exportar `./search.js` em `packages/shared/src/index.ts` e rodar
  `npm run build --workspace packages/shared` (consumido compilado).

## 3. Tradução categoria → predicados SQL (helper reutilizável)

- [ ] 3.1 Em `apps/api/src/lib` (ex.: `search-filters.ts`), helper que recebe a
  `FileCategory` e devolve o fragmento SQL de `content_type` correspondente
  (design.md D4): `LIKE 'image/%'` etc.; `document` = `text/%` OU `IN (<MIMEs
  Office>)`; `other` = negação dos anteriores incluindo `content_type IS NULL`.
  A categoria é constante interna do enum (não entra como texto de usuário).
- [ ] 3.2 Helper de intervalo de data: `created_at >= dateFrom` e `created_at <
  dateTo + 1 dia`, com valores como parâmetros `$n` (design.md D6).

## 4. Rota de busca (routes/search.ts)

- [ ] 4.1 Criar `apps/api/src/routes/search.ts` com `GET /files/search`, rodando
  em `withTenantTransaction(ctx, …)` (design.md D3): isolamento por unidade e
  exclusão de lixeira herdados da transação + do fragmento de visibilidade.
- [ ] 4.2 Montar o `WHERE` começando **sempre** por
  `visibleResourceClause(GrantResourceType.FILE, ownerPlaceholder, ctx)`
  (verbo `view`), replicando o cuidado de `listContents`: `ownerPlaceholder`/
  param do dono só entram quando **não**-admin (design.md D2).
- [ ] 4.3 Anexar em **AND** os filtros presentes: nome (`file_name ILIKE '%' ||
  $n || '%'`), tipo (helper 3.1), autor (`owner_id = $n`), data (helper 3.2);
  todos os valores de usuário como parâmetros `$n`. `SELECT` das mesmas colunas
  de `FileSummaryRow`, `ORDER BY created_at DESC` com `LIMIT` superior fixo.
- [ ] 4.4 Validar entrada: `type` fora do enum, data inválida ou `author`
  não-uuid ⇒ `400` sem executar a busca (design.md D6). Ausência de todos os
  filtros é válida e devolve todo o visível (design.md D7).
- [ ] 4.5 Registrar `searchRouter(ports)` em `apps/api/src/app.ts` sob
  `attachTenantContext`, junto das demais rotas de conteúdo.

## 5. Testes (apps/api/src/__tests__, padrão seedTwoUnits/withSystemBypass)

- [ ] 5.1 `search.test.ts`: busca por nome parcial (case-insensível) retorna os
  arquivos visíveis que casam; nome sem correspondência ⇒ vazio.
- [ ] 5.2 Cada filtro isolado e todos combinados (AND): tipo por categoria
  (um arquivo de cada categoria, incluindo `content_type IS NULL` ⇒ `other`),
  autor, intervalo de data; resultado é a interseção.
- [ ] 5.3 Alcance de permissão: colaborador **não** acha arquivo de terceiro sem
  grant; com grant `view` acha; admin da unidade acha os da unidade; a permissão
  vale mesmo quando o nome/filtro casaria (design.md D2).
- [ ] 5.4 Isolamento entre unidades: nome idêntico em arquivo de outra unidade
  **não** aparece; `global_admin` não vira alcance sobre outra unidade (US 5.1
  cenário 2).
- [ ] 5.5 Item na lixeira não aparece na busca; busca sem filtros devolve todo o
  visível; ordenação `created_at` desc; entrada malformada ⇒ 400.
- [ ] 5.6 `fileCategory` (unit test em `packages/shared` ou no api): um MIME de
  cada categoria mapeia para a categoria esperada, `null` ⇒ `OTHER`.

## 6. Gates

- [ ] 6.1 Rodar `npm run lint`, `npm run build` e `npm run test` (vitest
  sequencial) verdes.
