## Why

Com o explorador (`web-navegacao`, Fatia 2), a visualização/download
(`web-visualizacao`, Fatia 3) e o envio (`web-upload`, Fatia 4) já entregues, o
usuário navega, consome e envia arquivos — mas só consegue **encontrá-los
navegando pasta a pasta**. Quando não se sabe onde o arquivo está, não há
caminho pela SPA. O backend do **Épico 9 (US 9.1) já está pronto e arquivado**
(`apps/api/src/routes/search.ts`), expondo **`GET /files/search`** com busca por
nome (`q`) e filtros combináveis de **tipo** (`type`), **autor** (`author`) e
**data** (`dateFrom`/`dateTo`) — todos opcionais, combinados em **AND**, já
escopados à permissão do requisitante (`visibleResourceClause`, verbo `view`),
à RLS por unidade e à exclusão da lixeira, com limite de 500 resultados. Esta é
a **Fatia 5**: a página de busca da SPA, cobrindo o lado de frontend da
**US 9.1** e do **RF #15**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (Épico 9 do PRD) sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Página de busca com nome + filtros combináveis (US 9.1 cenário 1)**: nova
  rota `/busca` (sob `RequireAuth`, qualquer papel) com item **"Buscar"** no
  menu do shell. Uma barra de filtros — `Input.Search` (nome, `q`), `Select` de
  **tipo** mapeado do enum `FileCategory` de `@gdoc/shared` com rótulos pt-BR,
  `RangePicker` de **data**, e (ver abaixo) `Select` de **autor** — dispara uma
  chamada a `GET /files/search` com os critérios ativos. A tabela mostra
  **apenas os itens que atendem a todos os critérios e para os quais há
  permissão** (o próprio servidor já filtra; a SPA não infere permissão).
- **Botão de limpar filtros (US 9.1 cenário 2)**: um botão **"Limpar filtros"**
  reseta todos os controles; a lista volta ao **estado inicial permitido** — uma
  busca sem filtro algum, que retorna todos os arquivos visíveis (até 500),
  ordenados por `created_at DESC` como o servidor já faz.
- **Filtro de autor restrito a administrador (decisão Opção A — ver design.md
  D2)**: o `Select` de autor é populado por **`GET /users`**, que é
  **admin-only** (retorna 403 para colaborador). Logo, o filtro de autor é
  renderizado **somente para `unit_admin`/`global_admin`**; o colaborador recebe
  nome + tipo + data. O filtro de autor **para colaborador** fica registrado
  como **lacuna conhecida** (ver Fora de escopo) — precisa de um endpoint de
  pessoas seguro-para-colaborador que ainda não existe, no mesmo espírito da
  lacuna de "renomear pasta" da Fatia 2.
- **Reuso da visualização e download**: a tabela de resultados é **só-arquivos**
  (busca não retorna pastas) e reusa o `PreviewModal` e o `useDownloadFile` de
  `web-visualizacao` — nome clicável/"Visualizar" abre o preview, "Baixar"
  navega para a URL assinada `attachment`. Sem resultados, exibe `Empty`.
- **Datas**: o `RangePicker` (dayjs) é convertido para `YYYY-MM-DD` em
  `dateFrom`/`dateTo`; o servidor já trata `dateTo` como **inclusivo** no dia
  informado (limite superior exclusivo = início do dia seguinte).
- **Camada de dados**: novo schema Zod `searchFilesResponseSchema` espelhando
  `SearchFilesResponse` de `@gdoc/shared` (reusando o `fileSummaryResponseSchema`
  já existente), e hook TanStack Query `useSearchFiles(params)` (query keyed nos
  parâmetros) sobre o `apiClient`, montando a query string só com os critérios
  ativos.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Filtro de autor para colaborador**: exige um endpoint de pessoas
  seguro-para-colaborador (ex.: pessoas da própria unidade que são autoras de
  arquivos visíveis, retornando `{id, nome}`), que **não existe** hoje —
  `GET /users` é admin-only e `FileSummaryResponse` carrega só `ownerId` (UUID),
  sem nome. Fica para uma change de backend futura; o colaborador ganha o filtro
  de autor quando o endpoint existir. Paralelo à lacuna de "renomear pasta"
  (Fatia 2) e ao ZIP de pasta (Fatia 4).
- **Coluna de autor na tabela de resultados**: sem fonte de nome de dono
  acessível a colaborador (mesma lacuna acima), a tabela espelha as colunas do
  explorador (Tipo · Nome · Tamanho · Data · Ações) e **não** exibe coluna de
  autor. Entra junto do endpoint de pessoas futuro.
- **Paginação por cursor**: o servidor tem limite fixo de 500 (documentado no
  seu `design.md`); a SPA exibe o que vier, sem paginação. Cursor fica para
  quando o volume exigir — decisão já registrada no backend.
- **Renomear/excluir a partir dos resultados**: as ações de mutação
  (renomear/excluir) permanecem no explorador (contexto de pasta); a busca
  entrega **encontrar → visualizar → baixar**. Adicionar mutação aqui é escopo
  futuro, se a necessidade aparecer.
- **Busca dentro de uma pasta específica / por conteúdo (full-text)**: o
  endpoint busca por nome (`ILIKE`) em toda a unidade; busca por conteúdo do
  arquivo não é do MVP.
- **Permissões** (Fatia 6), **lixeira** (Fatia 7), **auditoria** (Fatia 8),
  **pessoas** (Fatia 9), **painel** (Fatia 10): cada uma é change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta fatia
  só os consome.

## Capabilities

### New Capabilities
- `web-busca`: a página de busca da SPA — busca por nome e filtros combináveis
  de tipo, autor e data sobre `GET /files/search`, com botão de limpar filtros
  que retorna ao estado inicial permitido, tabela de resultados só-arquivos
  reusando visualização/download, e o filtro de autor restrito a administrador
  (decisão Opção A) enquanto não há endpoint de pessoas seguro-para-colaborador.
  Cobre o lado de frontend da **US 9.1** e do **RF #15**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona uma tela de frontend sobre um endpoint já existente. -->

## Impact

- **Novo código** (`apps/web`): página de busca (`busca/BuscaPage.tsx`) com a
  barra de filtros e a tabela de resultados; hook TanStack Query
  `useSearchFiles` (`busca/queries.ts`) e o hook de lista de autores
  (admin-only) sobre `GET /users`; nova rota `/busca` em `app/router.tsx` e novo
  item de menu em `shell/AppShell.tsx`.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novo
  `searchFilesResponseSchema` amarrado a `SearchFilesResponse` de `@gdoc/shared`
  (`z.ZodType<T>`), reusando `fileSummaryResponseSchema`; schema mínimo para a
  resposta de `GET /users` (id + nome) consumido só pelo filtro de autor.
- **Reuso**: `PreviewModal` e `useDownloadFile` de `visualizacao/*`, `formatDate`
  e `formatFileSize` de `navegacao/format.ts`, `apiClient`, `renderApp` +
  `mock-fetch` dos testes.
- **Contratos** (`packages/shared`): **sem mudança** — `SearchFilesQuery`,
  `SearchFilesResponse`, `FileSummaryResponse`, `FileCategory` consumidos como
  estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome `GET /files/search`
  (e `GET /users` para o filtro de autor admin), ambos já arquivados.
- **Testes** (`apps/web`, Vitest + Testing Library): busca com filtros
  combinados monta a query string certa e lista só o retornado; limpar filtros
  reseta os controles e refaz a busca sem critérios; o filtro de autor aparece
  para admin e não aparece para colaborador; resultado vazio exibe `Empty`; o
  nome/"Visualizar" abre o preview e "Baixar" usa a URL assinada.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 5 como proposta/entregue.
