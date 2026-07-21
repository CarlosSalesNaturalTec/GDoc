## 1. Camada de dados (schemas + hooks)

- [x] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `searchFilesResponseSchema`
  tipado como `z.ZodType<SearchFilesResponse>` contra `@gdoc/shared`, reusando o
  `fileSummaryResponseSchema` já existente (`z.array(...)`) — design.md D6
- [x] 1.2 `apps/web/src/lib/schemas.ts`: adicionar um schema mínimo para a
  resposta de `GET /users` validando **apenas** os campos usados pelo filtro de
  autor (id + nome), tolerante aos demais campos de `PersonResponse` — design.md
  D6
- [x] 1.3 `apps/web/src/busca/queries.ts`: hook `useSearchFiles(params)` como
  `useQuery` com `queryKey` derivada de `params`, montando a query string de
  `GET /files/search` **só com os critérios ativos** (campo vazio é omitido) e
  fazendo `.parse()` da resposta via `apiClient` — design.md D3
- [x] 1.4 `apps/web/src/busca/queries.ts`: hook `useAuthorOptions()` (para o
  filtro de autor) que chama `GET /users` via `apiClient`, **habilitado apenas
  quando o papel é `unit_admin`/`global_admin`** (`enabled`), mapeando para
  `{ value: id, label: nome }` — design.md D2/D6

## 2. Barra de filtros e conversões (US 9.1)

- [x] 2.1 Mapa local **`FileCategory` → rótulo pt-BR** (imagem, vídeo, áudio,
  PDF, documento de escritório, texto, outros) para popular o `Select` de tipo a
  partir do enum de `@gdoc/shared` — design.md D4
- [x] 2.2 Conversão do `RangePicker` (dayjs) para `dateFrom`/`dateTo` no formato
  `YYYY-MM-DD` (`dateTo` inclusivo — sem aritmética de data no cliente, o
  servidor já trata) — design.md D4
- [x] 2.3 Estado único de filtros (`{ q, type, author, dateRange }`) como fonte
  da `queryKey`; estado inicial vazio ⇒ busca sem parâmetros = estado inicial
  permitido — design.md D3

## 3. Página de busca (`BuscaPage`)

- [x] 3.1 `apps/web/src/busca/BuscaPage.tsx`: barra de filtros com
  `Input.Search` (q), `Select` de tipo (2.1), `RangePicker` de data e botão
  **"Limpar filtros"**; o filtro de autor (`Select` `showSearch` de 1.4) é
  renderizado **só para admin** (papel via `useSession`) — spec: US 9.1 c1/c2,
  filtro de autor restrito; design.md D2/D3
- [x] 3.2 Botão **"Limpar filtros"** reseta o estado de filtros para vazio; a
  busca sem critérios refaz-se por mudança de `queryKey` (sem caminho separado de
  reset) — spec: limpar filtros; design.md D3
- [x] 3.3 Tabela de resultados **só-arquivos**: colunas Tipo · Nome · Tamanho ·
  Data · Ações, reusando `formatDate`/`formatFileSize` de `navegacao/format.ts`;
  `Empty` quando não há resultados; `Spin` em carregamento — spec: sem resultados
  exibe estado vazio; design.md D5
- [x] 3.4 Ações da linha reusando `web-visualizacao`: nome clicável e
  "Visualizar" abrem o `PreviewModal`; "Baixar" usa `useDownloadFile`; 403
  tratado com aviso de permissão insuficiente (padrão `handlePermissionError`) —
  spec: visualização e download a partir dos resultados; design.md D5

## 4. Rota e navegação

- [x] 4.1 `apps/web/src/app/router.tsx`: nova rota `/busca` sob `RequireAuth`
  (qualquer papel), dentro do `AppShell` — design.md D1
- [x] 4.2 `apps/web/src/shell/AppShell.tsx`: item de menu **"Buscar"** (ícone
  `SearchOutlined`) ao lado de "Arquivos", visível a qualquer papel; ajustar
  `selectedKey` para destacar em `/busca` — design.md D1

## 5. Testes (Vitest + Testing Library)

- [x] 5.1 `apps/web/src/__tests__/busca.test.tsx`: reusar `renderApp` +
  `mock-fetch`; busca com nome + tipo + data monta a query string esperada e
  lista só o retornado pelo servidor — spec: busca com filtros combinados
- [x] 5.2 Limpar filtros reseta os controles e refaz a busca sem critérios
  (estado inicial permitido) — spec: limpar filtros
- [x] 5.3 Filtro de autor **aparece para admin** (popula de `GET /users` e envia
  `author`) e **não aparece para colaborador** (sem chamada a `GET /users`) —
  spec: filtro de autor restrito a administrador
- [x] 5.4 Resultado vazio exibe `Empty`; nome/"Visualizar" abre o `PreviewModal`
  e "Baixar" dispara o fluxo de URL assinada — spec: sem resultados / visualização
  e download a partir dos resultados

## 6. Verificação e documentação

- [x] 6.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  passando (a fatia não toca `apps/api`/`packages/shared`)
- [x] 6.2 `docs/frontend_roadmap.md`: marcar a **Fatia 5** como entregue (✅) e
  registrar a lacuna conhecida do filtro de autor para colaborador
