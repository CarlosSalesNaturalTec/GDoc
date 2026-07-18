## Context

O `apps/api` só oferece navegação pasta a pasta (`GET /folders/:id/contents`,
`listContents` em `routes/folders.ts`). Não existe via para **procurar** um
arquivo pelo nome nem para filtrá-lo transversalmente (atravessando pastas).
A US 9.1 (`docs/prd_final.md`, RF #15) pede busca por nome + filtros por data,
tipo de arquivo e autor, **restrita ao que o solicitante pode ver**, com botão
para limpar filtros.

A resolução de visibilidade já está consolidada em `apps/api/src/lib/access.ts`:
`visibleResourceClause(resourceType, ownerIdParam, ctx)` devolve o fragmento SQL
`deleted_at IS NULL AND <alcance view>`, onde o alcance é **dono OU grant `view`
OU admin da unidade**, com a trava explícita de bypass do `global_admin`
(literal de `unit_id` em vez de `TRUE`). É exatamente o mesmo fragmento que
`listContents` usa hoje para a coluna de arquivos. A busca desta fatia é, em
essência, `listContents` **sem a âncora de pasta** e **com filtros adicionais**.

## Goals / Non-Goals

**Goals:**
- `GET /files/search`: busca de arquivos por nome (parcial, case/acento-insensível)
  com filtros combináveis (AND) de tipo, autor e intervalo de data.
- Reusar `visibleResourceClause` (verbo `view`) **sem alterá-lo** como fronteira
  de permissão; filtros do usuário são só restrições adicionais.
- Isolamento por unidade e exclusão de itens na lixeira herdados de graça da
  transação tenant + do fragmento de visibilidade.
- Categorização de tipo (`FileCategory`) em `packages/shared`, fonte única do
  mapeamento categoria↔MIME.

**Non-Goals:**
- Busca de pastas, breadcrumb por resultado, paginação por cursor, full-text no
  conteúdo dos arquivos, US 9.2 (preview) e qualquer UI (`apps/web`). Todos
  registrados como fora de escopo no `proposal.md`.

## Decisions

### D1 — Rota única `GET /files/search`, arquivos apenas
Uma rota `GET` com os critérios em query string (`q`, `type`, `author`,
`dateFrom`, `dateTo`), todos opcionais. Devolve **arquivos** no formato
`FileSummaryResponse` (mesmo da navegação), ordenados por `created_at` desc, com
um `LIMIT` superior fixo. **Por que arquivos e não pastas:** os filtros do PRD
(tipo de arquivo, autor) são centrados em arquivo; incluir pastas exigiria
semântica de filtro que a US não define. *Alternativa considerada:* devolver
itens mistos (pastas + arquivos) como em `listContents` — descartada por não ter
critério de "tipo/autor" bem definido para pastas e por inflar o contrato sem
requisito.

### D2 — Permissão pela cláusula de visibilidade, nunca por filtro
A query **sempre** injeta `visibleResourceClause(GrantResourceType.FILE,
ownerPlaceholder, ctx)` como primeiro predicado do `WHERE`; os filtros do
usuário entram **em conjunção** depois. Isso garante, por construção, que
nenhum filtro (nem a ausência deles) possa expor um arquivo fora do alcance do
solicitante. Reaproveita-se o mesmo cuidado de `listContents`: quando o ctx é
admin da unidade, o fragmento não referencia `ownerPlaceholder`, então o
parâmetro do dono só entra na lista de params quando **não**-admin (senão o
driver `pg` rejeita um `$n` sem uso). *Alternativa:* filtrar em aplicação após
um `SELECT` amplo — descartada: violaria o princípio de que a permissão é
imposta no servidor **na própria query** e traria linhas de outras unidades para
a memória do processo.

### D3 — Isolamento e lixeira herdados da transação tenant
A rota roda dentro de `withTenantTransaction(ctx, …)`, então a RLS por `unit_id`
filtra cada linha por baixo (fecha US 5.1 cenário 2 para a busca), e o
`deleted_at IS NULL` já embutido em `visibleResourceClause` exclui itens na
lixeira. Nenhuma lógica nova de isolamento — é o mesmo caminho da navegação.

### D4 — Categorização de tipo em `packages/shared`, filtro traduzido para predicados de `content_type`
Novo enum `FileCategory` (`IMAGE` / `VIDEO` / `AUDIO` / `PDF` / `DOCUMENT` /
`OTHER`) e função `fileCategory(contentType)` em `packages/shared`. O filtro
`type` recebido é validado contra o enum e **traduzido em SQL** para predicados
sobre `content_type`:
- `image` → `content_type LIKE 'image/%'`
- `video` → `content_type LIKE 'video/%'`
- `audio` → `content_type LIKE 'audio/%'`
- `pdf`   → `content_type = 'application/pdf'`
- `document` → `content_type LIKE 'text/%'` **OU** `content_type IN (<MIMEs
  Office: Word/Excel/PowerPoint, incl. OOXML e legados>)`
- `other` → negação dos anteriores (`NOT (…)`), incluindo `content_type IS NULL`

O mapeamento categoria↔MIME fica **numa única fonte** compartilhada, para a
futura UI e o painel (Épico 8) rotularem tipos de forma coerente com o filtro.
*Por que não uma coluna `category` materializada:* `content_type` já é gravado e
o conjunto de MIMEs por categoria é pequeno e estável — traduzir em predicados
evita migração de dados e mantém a categoria como função pura do MIME, sem risco
de dessincronia. A lista de MIMEs Office e os predicados de tradução ficam
centralizados (helper em `apps/api` que consome o enum do `shared`), para o
`document` cobrir os mesmos formatos que a US 9.2 promete pré-visualizar.

### D5 — Nome: `ILIKE` parcial; índice `pg_trgm` como otimização aditiva
Busca por nome usa `file_name ILIKE '%' || $q || '%'` (parcial, insensível a
caixa). Para volumes do MVP isso é suficiente. Como a busca por substring com
curinga à esquerda não usa índice B-tree comum, **adota-se** um índice GIN
`pg_trgm` sobre `file_name` numa **migração aditiva nova**
(`CREATE EXTENSION IF NOT EXISTS pg_trgm` + `CREATE INDEX … USING gin (file_name
gin_trgm_ops)`), sem editar nenhuma migração aplicada. `pg_trgm` é uma extensão
padrão disponível tanto no Postgres local do sandbox quanto no Cloud SQL, então
não muda a topologia de infra nem exige port novo. *Alternativa:* adiar o índice
e deixar o `ILIKE` sem suporte — descartada por deixar uma regressão de
desempenho previsível já conhecida; o índice é barato e aditivo.

### D6 — Datas e combinação
`dateFrom`/`dateTo` são datas ISO; o filtro aplica `created_at >= dateFrom` e
`created_at < dateTo + 1 dia` (intervalo inclusivo no dia final, evitando a
armadilha de comparar timestamp com data). Todos os filtros presentes entram em
**AND** entre si e com a cláusula de visibilidade (US 9.1 cenário 1: "atendem a
**todos** os critérios"). Entrada malformada (data inválida, `type` fora do
enum, `author` não-uuid) ⇒ `400`, sem executar a busca.

### D7 — Limpar filtros = chamada sem critérios
A rota trata todos os filtros como opcionais; a chamada sem nenhum devolve todos
os arquivos visíveis ao solicitante — o "estado inicial permitido" (US 9.1
cenário 2), agora em visão plana. O **botão** de limpar é UI (`apps/web`, fora
de escopo); o contrato apenas garante que ausência de filtro é válida.

## Risks / Trade-offs

- **[Visão plana sem localização]** o resultado não diz em qual pasta cada
  arquivo está (só `folderId`). → Aceitável no MVP; breadcrumb por resultado
  está registrado como fora de escopo e pode ser adicionado sem quebrar o
  contrato (campo novo).
- **[Sem paginação]** históricos/acervos grandes retornam até o `LIMIT` fixo. →
  Ordenação `created_at` desc entrega os mais relevantes primeiro; cursor entra
  quando o volume exigir, sem mudar a forma do item.
- **[Categoria `other` por negação]** depende da lista de MIMEs conhecidos
  ficar coerente com a categorização do `shared`. → Mitigado por centralizar o
  mapeamento numa única fonte (`FileCategory`/`fileCategory`) e cobri-lo em
  teste (um arquivo de cada categoria, incluindo `content_type IS NULL` ⇒
  `other`).
- **[Injeção]** filtros vêm do usuário. → Todos os valores entram como
  **parâmetros** (`$n`); só constantes internas do enum e o `unit_id` do ctx
  (nunca entrada do usuário) são interpolados em texto, mesmo padrão já validado
  em `resourceScopeClause`.

## Migration Plan

1. Migração aditiva nova `apps/api/src/db/migrations/00NN_search_indexes.sql`:
   `CREATE EXTENSION IF NOT EXISTS pg_trgm` + índice GIN trigram em
   `files(file_name)` (e, se útil, índice em `files(owner_id)` para o filtro de
   autor). Não edita nenhuma migração aplicada.
2. `packages/shared`: adicionar `FileCategory` + `fileCategory` e o DTO de query;
   `npm run build --workspace packages/shared` (consumido compilado).
3. `apps/api`: `routes/search.ts` + registro em `app.ts`; helper de tradução
   categoria→predicados.
4. Rollback: a rota é aditiva (nenhum contrato existente muda); reverter =
   remover a rota, o DTO e a migração (o índice é `DROP INDEX`/`DROP EXTENSION`
   sem perda de dado).

## Open Questions

- **Índice de autor**: incluir `files(owner_id)` já nesta fatia ou só o de nome?
  Proposta: adicionar ambos na mesma migração aditiva (baratos, e o filtro de
  autor é de primeira classe na US). A confirmar na implementação conforme o
  plano de query.
