## 1. Camada de dados (schemas + hook de lote)

- [ ] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `batchUploadItemResultSchema`
  (via `z.discriminatedUnion('ok', ...)`) e `batchUploadUrlResponseSchema`,
  tipado como `z.ZodType<BatchUploadUrlResponse>` contra `@gdoc/shared` (padrão
  dos schemas das fatias anteriores) — design.md D8
- [ ] 1.2 `apps/web/src/upload/queries.ts`: hook `useRequestUploadUrls` como
  `useMutation` que chama `POST /files/upload-urls` via `apiClient` com
  `{ destinationFolderId, items }` e faz `.parse()` da resposta — design.md D3/D8
- [ ] 1.3 No mesmo módulo, expor um helper de invalidação da listagem reusando a
  chave `folder-contents` da Fatia 2 (`queryClient.invalidateQueries`) —
  design.md D6

## 2. Transferência ao GCS (PUT por XHR)

- [ ] 2.1 `apps/web/src/upload/put-object.ts`: utilitário que faz **PUT por
  `XMLHttpRequest`** a uma URL assinada (`setRequestHeader('Content-Type',
  file.type)`, `xhr.send(file)`), expondo callbacks de progresso
  (`xhr.upload.onprogress`), sucesso (2xx) e erro — sem `fetch`, fora do
  `apiClient` — design.md D2
- [ ] 2.2 Derivação de `relativePath` a partir de `webkitRelativePath` (trecho de
  diretório sem o nome do arquivo, preservando a pasta-raiz); arquivo sem
  `webkitRelativePath` vai sem `relativePath` — design.md D5

## 3. Componente de envio (US 3.1 / US 3.2)

- [ ] 3.1 `apps/web/src/upload/UploadArea.tsx`: componente com `Upload` (lista de
  itens + `Progress` por arquivo) que recebe `destinationFolderId` = pasta
  corrente; dois modos de seleção (`multiple` e `directory`) — design.md D9
- [ ] 3.2 Orquestração em duas fases: ao iniciar o envio, **uma** chamada
  `useRequestUploadUrls` com todos os itens (mapeando `fileName`/`contentType`/
  `declaredSizeBytes`/`relativePath`); guardar os resultados casados por chave
  estável do arquivo (nome + `relativePath`, com `uid` como reforço) — design.md
  D3
- [ ] 3.3 `customRequest` por item: consome o resultado casado — item `ok:true`
  faz o PUT (2.1) reportando `onProgress`/`onSuccess`; item `ok:false` chama
  `onError` com o motivo, sem transferir — design.md D3/D4
- [ ] 3.4 Falha e nova tentativa independentes (US 3.1 c2): item em erro mostra
  **repetir**, que reenvia só aquele arquivo; repetir de item sem URL válida
  (ex.: recusado por cota) refaz uma **chamada de lote de 1** para reconquistar a
  folga; item que falhou só no PUT (URL válida) reusa a URL — design.md D4
- [ ] 3.5 Aviso reativo de cota (RF #13): item recusado com erro de cota dispara
  `notification` de cota atingida e marca só aquele item como falho, sem derrubar
  os demais — design.md D4
- [ ] 3.6 Erro de destino do lote (404/403) → `message.error`/`notification` de
  permissão insuficiente/destino indisponível, **sem iniciar PUT algum** (padrão
  `handlePermissionError` da Fatia 2); 401 segue central → `/login` — design.md D7
- [ ] 3.7 Ao concluir com sucesso (PUT 2xx), invalidar a listagem da pasta
  corrente (1.3); mensagem de "enviado" (não "disponível"); **sem polling** por
  `active` — design.md D6

## 4. Integração no explorador

- [ ] 4.1 `navegacao/ExplorerPage.tsx`: botões **"Enviar arquivos"** e **"Enviar
  pasta"** na toolbar (ao lado de "Nova pasta"), abrindo o `UploadArea` com
  `destinationFolderId` = `currentFolderId` — design.md D9

## 5. Testes (Vitest + Testing Library)

- [ ] 5.1 Reusar `renderApp(['/pastas'])` + `mock-fetch`; helper de resposta para
  `POST /files/upload-urls` (itens `ok:true`/`ok:false`) e para o PUT ao GCS
  (stub de `XMLHttpRequest` com progresso/2xx/erro)
- [ ] 5.2 Lote de vários arquivos: uma chamada `upload-urls`, cada item exibe
  progresso próprio e conclui independentemente — US 3.1 cenário 1
- [ ] 5.3 Falha parcial: um item recusado por cota é sinalizado (aviso de cota)
  enquanto os demais concluem; **repetir** reenvia só o item falho — US 3.1
  cenário 2, RF #13
- [ ] 5.4 Envio de pasta: cada item leva o `relativePath` derivado de
  `webkitRelativePath`, preservando a hierarquia — US 3.2
- [ ] 5.5 Sucesso do PUT invalida a listagem e o arquivo aparece com o estado do
  servidor (`pending`), sem polling por `active` — design.md D6
- [ ] 5.6 Destino sem permissão (403 no `upload-urls`) exibe aviso e não inicia
  transferência alguma — RF #10

## 6. Documentação e verificação

- [ ] 6.1 `docs/frontend_roadmap.md`: marcar a Fatia 4 (`web-upload`) como
  proposta/entregue
- [ ] 6.2 Rodar `npm run lint`, `npm run build` e
  `npm run test --workspace apps/web` verdes; `openspec validate web-upload`
