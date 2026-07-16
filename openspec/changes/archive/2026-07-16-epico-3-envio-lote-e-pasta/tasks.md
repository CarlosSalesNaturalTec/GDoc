# Tasks — epico-3-envio-lote-e-pasta

Ordem por dependência: schema (unicidade de pasta) → contratos → helper de garantia
de árvore de pastas → endpoint de lote (cota + `relativePath` + resultado por item)
→ testes → prova ponta a ponta. Somente backend (apps/api); nenhuma feature de
frontend. US 3.3 (download ZIP) fora desta fatia — depende do Épico 4 (permissões).

## 1. Banco: unicidade de nome de pasta por pai

- [x] 1.1 Criar migração `0006_folder_name_unique_per_parent.sql` (arquivo novo, não
      editar migrações aplicadas) que verifica duplicatas pré-existentes e falha
      explícita se houver (não há dado de produção a preservar)
- [x] 1.2 Criar o índice único `folders_unit_parent_name_uidx` em
      `(unit_id, parent_id, lower(name))` para a criação idempotente de caminho
- [x] 1.3 Rodar `npm run migrate --workspace apps/api` e conferir `schema_migrations`

## 2. Contratos (packages/shared)

- [x] 2.1 DTO de entrada do lote: `{ destinationFolderId?, items: [{ fileName,
      contentType, declaredSizeBytes, relativePath? }] }`
- [x] 2.2 DTO de saída por item (união): sucesso `{ fileName, ok: true, uploadUrl,
      objectPath, folderId, expiresAt }` | falha `{ fileName, ok: false, error }`,
      dentro de `{ results: [...] }` na mesma ordem da entrada
- [x] 2.3 `npm run build --workspace packages/shared`

## 3. Helper de garantia da árvore de pastas

- [x] 3.1 Extrair de `routes/folders.ts` a lógica de criação/validação de pasta
      (checagem de dono/unidade da âncora) para um helper compartilhado, sem alterar
      o comportamento de `POST /folders`
- [x] 3.2 Implementar `ensureFolderPath(client, ctx, anchorId, relativePath)`:
      normaliza segmentos rejeitando vazios/`.`/`..`/traversal; caminha nível a nível
      a partir de `anchorId`; para cada segmento faz leitura por
      `(unit_id, parent_id IS NOT DISTINCT FROM $pai, lower(name))` e, se ausente,
      `INSERT ... ON CONFLICT DO NOTHING` + re-leitura (idempotente); devolve o `id`
      da pasta-folha
- [x] 3.3 Validar a âncora `destinationFolderId` quando presente: mesma unidade (RLS)
      e `owner_id = ctx.userId`; de outra unidade/ inexistente → 403/404 sem vazar
      (lote inteiro falha só neste caso de pré-condição global)

## 4. Endpoint de envio em lote (`POST /files/upload-urls`)

- [x] 4.1 `routes/files.ts`: novo `POST /files/upload-urls` que abre uma transação
      tenant e valida o corpo (lista não vazia; `destinationFolderId` opcional)
- [x] 4.2 Reserva de cota consciente do lote: `disponivel = 10 GB −
      storage_used_bytes − SUM(size_bytes das linhas pending/replacing do usuário)`;
      percorrer os itens na ordem debitando `declaredSizeBytes`; item que cabe recebe
      URL, item que estoura vira `{ ok:false, error:"quota exceeded" }` sem inserir
      linha
- [x] 4.3 Por item bem-sucedido: `ensureFolderPath` pelo `relativePath` (relativo à
      âncora ou à raiz), `buildObjectPath` (uuid), inserir linha `pending` com o
      `folder_id` resolvido, assinar o PUT e montar o resultado de sucesso
- [x] 4.4 Item malformado (`fileName`/`declaredSizeBytes` inválidos, `relativePath`
      com traversal) vira `{ ok:false, error }` na sua posição, sem abortar o lote;
      preservar a ordem de entrada em `results[]`
- [x] 4.5 Manter `POST /files/upload-url` (singular) inalterado para arquivo único
- [x] 4.6 `routes/storage-events.ts`: confirmar que **nenhuma** mudança é necessária
      (cada item é uma linha `pending` reconciliada por objeto como qualquer upload)

## 5. Testes

- [x] 5.1 Lote totalmente válido: cada item recebe URL própria; conclusão de um item
      é independente dos demais
- [x] 5.2 Falha parcial: um item recusado (cota) não impede os demais de receber URL
      e concluir; nova tentativa só do item recusado funciona isolada
- [x] 5.3 Cota de lote: itens que cabem recebem URL e os que excedem o limite (com
      pendentes somados) são recusados sem inserir linha; reserva não conta o recusado
- [x] 5.4 `ensureFolderPath` idempotente: reenvio do mesmo lote não duplica pastas;
      pasta existente é reaproveitada; só os níveis faltantes são criados
- [x] 5.5 Estrutura preservada: `relativePath` com subpastas recria a hierarquia
      idêntica e vincula cada arquivo à pasta-folha correta
- [x] 5.6 Ancoragem e isolamento: árvore ancorada na `destinationFolderId`; destino
      de outra unidade → 403 sem vazar; `relativePath` com traversal recusado por item
- [x] 5.7 `npm run lint`, `npm run build`, `npm run test` verdes na raiz

## 6. Prova ponta a ponta

- [x] 6.1 Fluxo em dev: login → `POST /files/upload-urls` com vários itens, alguns com
      `relativePath` de subpasta → PUT em cada URL → reconciliação → `GET
      /folders/:id/contents` mostra a árvore recriada e os arquivos nas pastas certas
- [x] 6.2 Falha parcial ponta a ponta: um item além da cota é sinalizado enquanto os
      demais concluem e permanecem salvos; reenviar só o que falhou conclui
- [x] 6.3 Isolamento: sessão da unidade A não consegue ancorar envio em pasta da
      unidade B (destino de outra unidade recusado, sem vazar existência)
