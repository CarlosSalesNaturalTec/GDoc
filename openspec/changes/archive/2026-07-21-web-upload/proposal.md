## Why

Com o explorador de pastas/arquivos (change `web-navegacao`, Fatia 2) e a
visualização/download (change `web-visualizacao`, Fatia 3) já entregues, o
usuário navega, gerencia e consome seus arquivos — mas ainda **não consegue
colocar arquivo algum no sistema pela SPA**: o único caminho de entrada hoje é
o `curl` manual das URLs assinadas (documentado no `README.md`). O backend do
**Épico 3 já está pronto e arquivado** (`apps/api/src/routes/files.ts`),
expondo `POST /files/upload-url` (unitário) e `POST /files/upload-urls`
(lote/pasta, com `relativePath` e resultado por item), ambos checando destino e
**reservando cota** no servidor antes de assinar. Esta é a **Fatia 4**: o envio
de múltiplos arquivos e de pastas a partir do explorador, cobrindo o lado de
frontend da **US 3.1** (progresso e falha independentes), **US 3.2** (pasta com
subpastas preservadas), do **RF #6** e do aviso de **cota (RF #13)**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (Épico 3 do PRD) sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Envio de múltiplos arquivos com progresso individual (US 3.1 cenário 1)**:
  botão **"Enviar arquivos"** na toolbar do explorador abre a seleção múltipla
  (`Upload`). Para o lote, a SPA chama **`POST /files/upload-urls` uma vez** com
  `destinationFolderId` = pasta corrente e um `item` por arquivo, e então faz o
  **PUT de cada arquivo direto ao GCS** pela sua URL assinada, exibindo o
  **`Progress` próprio de cada um** e o desfecho (sucesso/falha) **independente
  dos demais**.
- **Falha parcial e nova tentativa só do que falhou (US 3.1 cenário 2)**: cada
  item tem desfecho próprio — quer pela resposta do servidor (item marcado
  `ok: false`, ex.: `quota exceeded`), quer pelo PUT ao GCS. Os que concluíram
  **permanecem enviados**; o que falhou fica **sinalizado com botão de repetir**
  que reenvia **apenas aquele item**, sem reprocessar os demais.
- **Envio de pasta preservando subpastas (US 3.2)**: botão **"Enviar pasta"**
  usa `Upload` com `directory`; a SPA deriva o **`relativePath`** de cada
  arquivo a partir do `webkitRelativePath` (trecho de diretório, incluindo a
  pasta-raiz selecionada) e o envia no `item`. O servidor recria a **hierarquia
  idêntica** via `ensureFolderPath` sob a pasta corrente.
- **Aviso de cota (RF #13)**: como não há endpoint de "meu uso/cota" para
  colaborador (o `/dashboard` é agregado e restrito a admin — Fatia 10), o aviso
  é **reativo**: quando o servidor recusa um item com `quota exceeded`, a SPA
  exibe `notification` explicando que a cota (10 GB/usuário) foi atingida e
  marca **só aquele item** como falho, deixando os demais seguirem.
- **Sucesso = PUT concluído, não arquivo `active`**: a reconciliação de estado
  (`status` `pending`→`active` e atualização de `storage_used_bytes`) é
  **out-of-band** (`POST /internal/storage-events`, alvo do Pub/Sub em prod;
  `curl` manual no dev). Após o PUT `200`, a SPA sinaliza "enviado", **invalida
  a listagem** e o arquivo aparece com a `Tag` `pending` que o explorador já
  renderiza — **sem polling** esperando virar `active`.
- **PUT ao GCS via `XMLHttpRequest`, fora do `apiClient`**: o PUT é cross-origin
  (sem cookie de sessão), com o `Content-Type` do próprio arquivo e corpo cru —
  incompatível com o `apiClient` (JSON same-origin). Além disso, **`fetch` não
  expõe progresso de upload**; o `onProgress` do `Upload` exige
  `xhr.upload.onprogress`. O PUT usa XHR próprio; o pedido de URL assinada
  continua pelo `apiClient`.
- **Camada de dados**: novos schemas Zod espelhando `BatchUploadUrlRequest`,
  `BatchUploadUrlResponse` e `BatchUploadItemResult` (união discriminada em
  `ok`) de `@gdoc/shared`, e hook TanStack Query (`useRequestUploadUrls` como
  mutation) sobre o `apiClient` existente.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Download de pasta compactada (US 3.3)**: o Épico 3 inclui baixar uma pasta
  inteira como um único ZIP (respeitando permissão por item, cenário 2), mas
  **não há endpoint de backend** para isso (nenhuma rota de zip/archive existe).
  Fica para uma change de backend futura (geração de ZIP server-side com
  filtragem por permissão); o frontend ganha a ação quando o endpoint existir —
  paralelo à lacuna de "renomear pasta" registrada na Fatia 2.
- **Barra proativa de uso/cota**: mostrar "X de 10 GB usados" antes de enviar
  exigiria um endpoint self de uso para colaborador, que não existe. O aviso
  desta fatia é reativo (item recusado). O endpoint self fica para change
  futura.
- **Upload resumável / chunked**: o contrato do backend é **PUT simples** (o
  `fake-gcs-server` não trata sessões resumáveis por URL assinada v4); esta
  fatia mantém "uma URL, um PUT". Retomar upload interrompido está fora.
- **Aguardar/forçar a reconciliação (`storage-events`) pela SPA**: a promoção a
  `active` é responsabilidade do finalize (Pub/Sub em prod); a SPA não a dispara
  nem espera por ela.
- **Uso do endpoint unitário `POST /files/upload-url`**: a SPA usa **sempre o
  lote** (`upload-urls`) — arquivo único vira lote de 1, ganhando a reserva de
  cota consciente do lote e um caminho de código só. O endpoint singular
  permanece no backend, sem consumidor no front.
- **Busca** (Fatia 5), **permissões** (Fatia 6), **lixeira** (Fatia 7),
  **auditoria** (Fatia 8): cada uma é change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta
  fatia só os consome.

## Capabilities

### New Capabilities
- `web-upload`: o envio de arquivos na SPA a partir do explorador — seleção
  múltipla e seleção de pasta, com pedido de URLs assinadas em lote ao servidor,
  PUT direto ao GCS por `XMLHttpRequest` com progresso individual, desfecho e
  nova tentativa independentes por item, preservação de hierarquia de subpastas,
  aviso reativo de cota, e invalidação da listagem ao concluir (arquivo recém
  enviado exibido como `pending` até a reconciliação out-of-band). Cobre o lado
  de frontend da **US 3.1**, **US 3.2**, do **RF #6** e do aviso de **RF #13**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona telas de frontend sobre endpoints já existentes. -->

## Impact

- **Novo código** (`apps/web`): componente de envio (área/drawer com lista de
  progresso por arquivo) e sua lógica de `customRequest` → pedir URL assinada +
  PUT ao GCS por XHR; botões "Enviar arquivos" e "Enviar pasta" na toolbar do
  explorador (`navegacao/ExplorerPage.tsx`); hook TanStack Query de lote.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novos schemas Zod
  amarrados a `BatchUploadUrlRequest`/`BatchUploadUrlResponse`/
  `BatchUploadItemResult` de `@gdoc/shared` (`z.ZodType<T>`), sem alterar os
  contratos.
- **Contratos** (`packages/shared`): **sem mudança** — `BatchUploadUrlRequest`,
  `BatchUploadUrlResponse`, `BatchUploadItemResult` consumidos como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome
  `POST /files/upload-urls` já arquivado.
- **Testes** (`apps/web`, Vitest + Testing Library): lote de N arquivos mostra
  progresso por item e conclui independente; um item recusado por `quota
  exceeded` é sinalizado com repetir enquanto os demais concluem; envio de pasta
  monta `relativePath` a partir de `webkitRelativePath`; após o PUT, a listagem
  é invalidada e o arquivo aparece `pending`; repetir reenvia só o item falho.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 4 como proposta/entregue.
