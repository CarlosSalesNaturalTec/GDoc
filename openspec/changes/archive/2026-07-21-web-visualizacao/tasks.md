## 1. Camada de dados (schemas + hooks)

- [x] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `signedUrlResponseSchema` e
  `viewUrlResponseSchema` (via `z.discriminatedUnion('previewAvailable', ...)`),
  cada um tipado como `z.ZodType<T>` contra `SignedUrlResponse`/`ViewUrlResponse`
  de `@gdoc/shared` (padrão dos schemas das fatias anteriores) — design.md D7
- [x] 1.2 `apps/web/src/visualizacao/queries.ts`: hook `useViewUrl` como
  `useMutation` que chama `POST /files/:id/view-url` via `apiClient` e faz
  `.parse()` da resposta discriminada — sem cache/`staleTime` (emissão audita)
  — design.md D3
- [x] 1.3 Hook `useDownloadUrl` como `useMutation` que chama
  `POST /files/:id/download-url` e faz `.parse()` (`signedUrlResponseSchema`) —
  design.md D3

## 2. Fluxo de download

- [x] 2.1 `apps/web/src/visualizacao/download.ts`: utilitário que, dada uma URL
  assinada, dispara o download por **navegação numa âncora** (`<a href>` criada,
  acionada e descartada; disposição `attachment` do servidor faz o browser
  baixar), sem `fetch`+blob e sem abrir aba — design.md D4

## 3. Modal de preview (US 9.2)

- [x] 3.1 `apps/web/src/visualizacao/PreviewModal.tsx`: `Modal` que, ao abrir,
  dispara `useViewUrl(file.id)` **uma vez** e guarda o resultado em estado local;
  fechar/reabrir dispara nova chamada — design.md D1/D3
- [x] 3.2 Renderizadores por categoria (ramo `previewAvailable: true`): escolher
  o elemento por `fileCategory(file.contentType)` de `@gdoc/shared` — `Image`
  (imagem), `<video controls>` (vídeo), `<audio controls>` (áudio), `<iframe>`
  (PDF e texto) — apontando para a URL assinada `inline` (US 9.2 cenário 1) —
  design.md D2
- [x] 3.3 Ramo `previewAvailable: false`: `Result`/`Empty` com mensagem
  **"pré-visualização indisponível"** + botão de download **apenas quando**
  `download.available === true` (reusa o utilitário do 2.1) — US 9.2 cenário 2 —
  design.md D5
- [x] 3.4 Estados do modal: `Spin` durante a emissão da URL; tratamento de
  **403** → aviso de **permissão insuficiente** sem renderizar conteúdo (padrão
  `handlePermissionError` da Fatia 2); erro genérico com mensagem — design.md D6

## 4. Integração no explorador

- [x] 4.1 `navegacao/ExplorerPage.tsx`: nome do arquivo vira clicável
  (`Button type="link"`) e nova ação **"Visualizar"** na coluna de ações, ambos
  abrindo o `PreviewModal` do arquivo da linha — design.md D1
- [x] 4.2 Nova ação **"Baixar"** na coluna de ações do arquivo → `useDownloadUrl`
  + utilitário de download (2.1); 403 on-click → `message.error` de permissão
  insuficiente — design.md D4/D6

## 5. Testes (Vitest + Testing Library)

- [x] 5.1 Reusar `renderApp(['/pastas'])` + `mock-fetch`; helper de resposta para
  `view-url`/`download-url` (ramos `previewAvailable` true/false e 403)
- [x] 5.2 Visualizar arquivo de imagem renderiza inline (`<img>`) a partir da URL
  assinada; PDF renderiza em visualizador embutido (`<iframe>`) — US 9.2 cenário 1
- [x] 5.3 Formato não suportado com `download.available: true` mostra mensagem de
  indisponibilidade + botão de download — US 9.2 cenário 2
- [x] 5.4 Formato não suportado com `download.available: false` mostra a mensagem
  sem botão de download — US 9.2 cenário 2
- [x] 5.5 Clicar em "Baixar" dispara `POST /files/:id/download-url` e a navegação
  para a URL assinada (âncora acionada) — RF #16
- [x] 5.6 403 em view-url/download-url exibe aviso de permissão insuficiente, sem
  expor conteúdo do arquivo — RF #10

## 6. Documentação e verificação

- [x] 6.1 `docs/frontend_roadmap.md`: marcar a Fatia 3 (`web-visualizacao`) como
  proposta/entregue
- [x] 6.2 Rodar `npm run lint`, `npm run build` e
  `npm run test --workspace apps/web` verdes; `openspec validate web-visualizacao`
