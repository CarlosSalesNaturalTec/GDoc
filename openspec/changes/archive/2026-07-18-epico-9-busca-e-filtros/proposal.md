## Why

O PRD (`docs/prd_final.md`, Épico 9 / **US 9.1**, RF #15) exige que o
colaborador **encontre rapidamente** um arquivo: busca por nome combinada com
filtros por data, tipo de arquivo (imagens, vídeos, áudios, PDFs, documentos,
entre outros) e autor, **sempre limitada aos itens que ele tem permissão de
ver**, com um botão para limpar os filtros e voltar ao estado inicial. Hoje o
`apps/api` só oferece **navegação pasta a pasta** (`GET /folders/:id/contents`,
Épicos 2/4): não existe nenhuma via de **procurar** um arquivo pelo nome ou
filtrá-lo transversalmente, atravessando pastas. Esta mudança entrega o lado de
API dessa busca, reaproveitando integralmente a resolução de visibilidade já
consolidada (dono OU grant `view` OU admin da unidade) — sem afrouxar a
fronteira de permissão nem o isolamento por unidade.

## What Changes

- **Rota de busca transversal (US 9.1 cenário 1)**: `GET /files/search`
  retorna os **arquivos** (não pastas — ver design) que o solicitante pode ver
  e que atendem, em conjunto (**AND**), aos critérios informados:
  - **nome** (`q`): correspondência parcial, sem diferenciar maiúsculas/acentos
    de caixa (`ILIKE`) sobre `file_name`;
  - **tipo** (`type`): categoria funcional (`image` / `video` / `audio` / `pdf`
    / `document` / `other`) derivada de `content_type` — o mapeamento
    categoria↔MIME vive em `packages/shared` para api e web concordarem;
  - **autor** (`author`): `owner_id` do arquivo;
  - **data** (`dateFrom` / `dateTo`): intervalo sobre `created_at`.
  Os resultados vêm ordenados do mais recente para o mais antigo, cada item no
  mesmo formato `FileSummaryResponse` já usado na navegação.
- **Permissão é a fronteira, não um filtro a mais (US 9.1 "…e para os quais
  tenho permissão")**: a query **sempre** aplica `visibleResourceClause`
  (verbo `view`) de `lib/access.ts` — o mesmo fragmento usado em `listContents`
  (`routes/folders.ts`). Colaborador vê só o que é seu ou foi liberado; admin da
  unidade vê a unidade inteira; `global_admin` continua travado explicitamente
  ao `unit_id` do contexto (sem virar "olho universal"). Filtros do usuário são
  **restrições adicionais** sobre esse alcance, nunca uma forma de ampliá-lo.
- **Isolamento por unidade preservado (RF #4)**: a rota roda na transação
  tenant já aberta (`withTenantTransaction`), então a RLS por `unit_id` filtra
  cada linha por baixo — busca nunca atravessa unidade, exatamente como a
  navegação. Fecha a US 5.1 cenário 2 ("nunca vejo arquivos de outra unidade,
  **mesmo por busca**") também para a nova via.
- **Item na lixeira nunca aparece**: `visibleResourceClause` já embute
  `deleted_at IS NULL`; arquivo excluído resolve como inexistente na busca,
  consistente com o Épico 6.
- **Limpar filtros = busca sem critérios (US 9.1 cenário 2)**: chamar a rota
  sem nenhum filtro devolve todos os arquivos visíveis ao solicitante (o
  "estado inicial permitido" da página de arquivos, agora em visão plana). O
  **botão** de limpar em si é comportamento de UI (`apps/web`, fora desta
  fatia); o contrato de API apenas garante que a ausência de filtro é válida e
  bem definida.
- **Categorização de tipo compartilhada**: novo helper/enum em
  `packages/shared` (`FileCategory` + `fileCategory(contentType)`), fonte única
  para (a) traduzir `type` recebido no filtro para os predicados de
  `content_type` na query e (b) permitir que a futura UI e o painel (Épico 8, já
  entregue) rotulem tipos de forma coerente.

### Fora de escopo (mudanças futuras)

- **Busca de pastas por nome**: os filtros do PRD (tipo de arquivo, autor) são
  centrados em arquivo; a busca desta fatia devolve **arquivos**. Incluir pastas
  no resultado é extensão futura de UI/API.
- **Localização/breadcrumb de cada resultado**: o item retorna no formato
  `FileSummaryResponse` (inclui `folderId`), mas **não** a trilha completa até a
  raiz por resultado — montar o caminho de cada arquivo achado fica para quando
  a UI exigir.
- **Paginação/cursor**: esta fatia ordena por `created_at` desc com um limite
  superior fixo; paginação por cursor entra quando o volume exigir.
- **Busca full-text no conteúdo dos arquivos** (dentro de PDFs/documentos): fora
  do escopo do MVP — a busca é por **nome** e metadados, não por conteúdo.
- **US 9.2 (visualização sem download / preview de documentos Office)**: é a
  outra metade do Épico 9 e vira change própria (depende do
  `PreviewConversionPort`, hoje reservado e não implementado).
- **UI/SPA da página de busca e do botão de limpar filtros** (`apps/web` segue
  esqueleto) — só o contrato de API entra aqui.

## Capabilities

### New Capabilities
- `busca`: busca transversal de arquivos por nome com filtros combináveis
  (tipo, autor, intervalo de data), restrita ao alcance de visibilidade do
  solicitante (dono/grant `view`/admin da unidade) e à sua unidade pela RLS,
  com categorização de tipo derivada de `content_type`. Cobre **US 9.1**
  (cenários 1 e 2, lado de API).

### Modified Capabilities
<!-- Nenhuma: navegação/gestão de arquivos e a resolução de acesso não mudam de
     comportamento; esta fatia só adiciona uma via de leitura nova (busca), que
     reaproveita `visibleResourceClause` sem alterá-la. -->

## Impact

- **Código** (`apps/api/src`): nova rota `routes/search.ts`
  (`GET /files/search`) registrada em `app.ts` sob `attachTenantContext`; reuso
  de `lib/access.ts` (`visibleResourceClause`, verbo `view`) sem modificá-lo;
  pequeno helper que traduz `FileCategory` → predicados `content_type`.
- **Contratos** (`packages/shared`): `FileCategory` (enum) +
  `fileCategory(contentType)`; `SearchFilesQuery` (nome/tipo/autor/datas) e
  reuso de `FileSummaryResponse` na resposta. Rebuild de `packages/shared`
  (consumido compilado).
- **Banco** (`apps/api/src/db/migrations/`): **nenhuma tabela nova** — a busca é
  `SELECT` sobre `files` na transação tenant. Avaliar em design um índice
  aditivo para acelerar o `ILIKE` por nome (ex.: `pg_trgm` GIN); se adotado,
  entra como **migração aditiva nova**, sem editar nenhuma já aplicada, e a
  extensão vira parte do provisionamento. Se não, fica registrado como
  otimização futura.
- **Infra / Paridade dev**: nenhum port novo, nenhum recurso de nuvem novo. Um
  eventual `CREATE EXTENSION pg_trgm` é a única pegada de infra a confirmar no
  design (disponível tanto no Postgres local do sandbox quanto no Cloud SQL).
- **Testes** (`apps/api/src/__tests__`, padrão `seedTwoUnits` /
  `withSystemBypass`): busca por nome parcial; cada filtro isolado e todos
  combinados (AND); resultado restrito à visibilidade (colaborador não acha
  arquivo de terceiro sem grant; com grant `view` acha; admin acha os da
  unidade); isolamento entre unidades (busca não traz arquivo de outra unidade);
  item na lixeira não aparece; busca sem filtros devolve todo o visível;
  ordenação desc.
