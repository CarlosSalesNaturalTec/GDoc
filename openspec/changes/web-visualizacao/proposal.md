## Why

Com o explorador de pastas/arquivos já entregue (change `web-navegacao`,
Fatia 2 do `docs/frontend_roadmap.md`), o usuário navega e gerencia seus
itens, mas ainda **não consegue ver nem baixar o conteúdo** de um arquivo: a
listagem mostra nome/tamanho/data e ações de gestão, e nada mais. O backend
já está pronto e arquivado (`apps/api/src/routes/files.ts`), expondo
`POST /files/:id/view-url` (com `ViewUrlResponse` discriminado — ramo
pré-visualizável ou ramo "formato não suportado") e
`POST /files/:id/download-url`, ambos checados no servidor por dono-ou-grant e
auditados na emissão da URL. Esta é a **Fatia 3**: a visualização inline e o
download que abrem a partir do explorador, cobrindo o lado de frontend da
**US 9.2** (cenários 1 e 2) e dos **RF #10/#16** do PRD.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (US 9.2 do PRD) sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Ação de visualizar por arquivo (US 9.2)**: na `Table` do explorador, o
  **nome do arquivo vira clicável** e um botão **"Visualizar"** entra na coluna
  de ações; ambos abrem um **`Modal` de preview**. Ao abrir, o modal chama
  `POST /files/:id/view-url` **uma vez** e ramifica pela união discriminada
  `ViewUrlResponse`:
  - `previewAvailable: true` → renderiza o conteúdo **inline** escolhendo o
    elemento por `fileCategory(contentType)` de `@gdoc/shared` (fonte única
    já usada pelo backend em `isPreviewable`): `Image` (imagem), `<video>`
    (vídeo), `<audio>` (áudio), `<iframe>` (PDF e texto) — apontando para a
    URL assinada `inline`, sem baixar o arquivo (US 9.2 cenário 1).
  - `previewAvailable: false` (`reason: 'unsupported_format'`) → `Result`/`Empty`
    com a mensagem **"pré-visualização indisponível"** e um botão de download
    **apenas quando `download.available === true`** (US 9.2 cenário 2).
- **Ação de baixar por arquivo (RF #16)**: botão **"Baixar"** na coluna de
  ações chama `POST /files/:id/download-url` e dispara o download por
  **navegação simples numa âncora** para a URL assinada `attachment` (o GCS não
  permite `fetch`+blob por CORS; a própria disposição `attachment` faz o
  browser baixar sem sair da SPA).
- **Ações conforme permissão via fail-closed 403 (RF #10)**: como o
  `FileSummaryResponse` não carrega os verbos concedidos, o cliente **oferece**
  as ações e trata o **403** do servidor exibindo *"permissão insuficiente"*
  (mesmo padrão `handlePermissionError` da Fatia 2) — sem inferir permissão no
  cliente e sem expor preview.
- **Camada de dados**: novos schemas Zod espelhando `ViewUrlResponse` (união
  discriminada) e `SignedUrlResponse` de `@gdoc/shared`, e hooks TanStack Query
  (`useViewUrl`/`useDownloadUrl` como mutations) sobre o `apiClient` existente.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Pré-visualização de documentos de escritório (Word/Excel/PowerPoint)**: a
  US 9.2 cenário 1 os lista como suportados, mas o backend hoje retorna
  `previewAvailable: false` para Office — a conversão Office→PDF depende do
  `PreviewConversionPort` (fase futura, ainda não implementada). Nesta fatia,
  Office cai naturalmente no **ramo cenário 2** ("indisponível" + download);
  **nenhum tratamento especial** é feito no cliente. Quando a conversão existir,
  o backend passa a responder `previewAvailable: true` e o front já os
  renderiza sem mudança.
- **Auto-refresh da URL assinada no vencimento do TTL** (~5 min view /
  ~15–30 min download): fora de escopo — o MVP busca a URL uma vez por abertura
  ("requested = accessed"); reabrir o preview gera nova URL e nova auditoria.
- **Upload** (Fatia 4), **busca** (Fatia 5), **permissões** (Fatia 6),
  **lixeira** (Fatia 7) e **auditoria** (Fatia 8): cada uma é change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta
  fatia só os consome.

## Capabilities

### New Capabilities
- `web-visualizacao`: a visualização inline e o download de arquivos na SPA,
  abertos a partir do explorador — modal de preview que ramifica pela resposta
  discriminada do servidor (renderização nativa por categoria de MIME ou
  mensagem de indisponibilidade com oferta de download conforme permissão), e a
  ação de baixar por URL assinada `attachment`, com o 403 do servidor tratado
  como bloqueio sem preview. Cobre o lado de frontend da **US 9.2** (cenários 1
  e 2) e dos **RF #10/#16**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona telas de frontend sobre endpoints já existentes. -->

## Impact

- **Novo código** (`apps/web`): modal de preview e seus renderizadores por
  categoria; ações "Visualizar"/"Baixar" e nome clicável na `Table` do
  explorador (`navegacao/ExplorerPage.tsx`); hooks TanStack Query de view/download.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novos schemas Zod
  amarrados a `ViewUrlResponse`/`SignedUrlResponse` de `@gdoc/shared`
  (`z.ZodType<T>`), sem alterar os contratos.
- **Contratos** (`packages/shared`): **sem mudança** — `ViewUrlResponse`,
  `SignedUrlResponse`, `fileCategory`/`isPreviewable` consumidos como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome
  `POST /files/:id/view-url` e `POST /files/:id/download-url` já arquivados.
- **Testes** (`apps/web`, Vitest + Testing Library): preview de imagem/PDF
  renderiza inline; ramo indisponível com `download.available:true` mostra
  mensagem + botão; com `false` mostra mensagem sem botão; 403 no view/download
  mostra aviso de permissão; clique em "Baixar" dispara a navegação para a URL
  assinada.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 3 como proposta/entregue.
