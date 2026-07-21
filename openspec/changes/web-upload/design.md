## Context

As Fatias 2 (`web-navegacao`) e 3 (`web-visualizacao`), arquivadas, entregaram o
explorador (`Table` unificando pastas/arquivos, `Breadcrumb`, ações de gestão, o
padrão **403 fail-closed** via `handlePermissionError`) e a
visualização/download. Hoje **não há entrada de arquivos pela SPA** — o único
caminho é o `curl` manual das URLs assinadas (README).

O backend (Épico 3, `apps/api/src/routes/files.ts`, arquivado) é o **único
guardião de permissão e cota** e já expõe tudo que esta fatia precisa —
nenhuma mudança de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `POST /files/upload-urls` | pede N URLs assinadas de PUT (lote/pasta) | `BatchUploadUrlRequest` → `BatchUploadUrlResponse` |
| `POST /files/upload-url` | URL única (não usado pela SPA — ver D1) | `UploadUrlRequest` → `UploadUrlResponse` |

Contrato de `POST /files/upload-urls`:

```ts
interface BatchUploadUrlRequest {
  destinationFolderId?: string;             // ausente = raiz da unidade
  items: {
    fileName: string; contentType: string; declaredSizeBytes: number;
    relativePath?: string;                  // subpasta a recriar (ex.: "Rel/2024")
  }[];
}
type BatchUploadItemResult =                 // por item, união discriminada em `ok`
  | { fileName; ok: true;  uploadUrl; objectPath; folderId; expiresAt }
  | { fileName; ok: false; error: string };
interface BatchUploadUrlResponse { results: BatchUploadItemResult[]; }
```

Regras de governança já implementadas no servidor, que o cliente **não
duplica**, apenas respeita:

- **Destino validado e cota reservada antes de assinar**: destino inválido/de
  outra unidade derruba o lote inteiro (**404/403**); erro por item
  (`quota exceeded`, `invalid item`) marca só aquele item, sem abortar os demais.
  A reserva de cota é **consciente do lote** (soma pendentes + cresce a cada
  item aceito) — o cliente não pré-calcula folga.
- **Bucket privado, PUT simples**: o objeto entra por uma URL assinada de PUT de
  TTL curto; os bytes trafegam **direto do browser ao GCS**, nunca pela API.
- **Reconciliação out-of-band**: `pending`→`active` e a atualização de
  `storage_used_bytes` ocorrem em `POST /internal/storage-events` (Pub/Sub em
  prod; `curl` manual no dev), **não** na SPA.

## Goals / Non-Goals

**Goals:**
- Envio de múltiplos arquivos com progresso e desfecho independentes por item —
  US 3.1 (cenários 1 e 2).
- Envio de pasta preservando subpastas idênticas — US 3.2.
- Aviso reativo ao atingir a cota — RF #13.
- 403/404 de destino tratados como bloqueio, sem iniciar transferência — RF #10.
- Reuso máximo da fundação: `apiClient` (só para pedir URLs), TanStack Query,
  Zod, `renderApp`/`mock-fetch`, e o `Upload` do AntD.

**Non-Goals:**
- Download de pasta compactada em `.zip` (US 3.3) — **sem endpoint de backend**;
  change futura.
- Barra proativa de uso/cota — não há endpoint self de uso para colaborador.
- Upload resumável/chunked — o contrato é PUT simples.
- Aguardar/forçar a reconciliação (`storage-events`) pela SPA.
- Qualquer mudança em `apps/api` ou `packages/shared`.

## Decisions

### D1 — A SPA usa **sempre o lote** (`upload-urls`), nunca o singular

Multi-arquivo é lote de N; pasta é lote com `relativePath`; **arquivo único é
lote de 1**. Um caminho de código só, e ganha a **reserva de cota consciente do
lote** que o singular não faz. Alternativa — ramificar entre `upload-url`
(1 arquivo) e `upload-urls` (N) — foi descartada: duplica a lógica de PUT/
progresso por um ganho nulo. O endpoint singular permanece no backend sem
consumidor no front (documentado como fora de escopo na proposta).

### D2 — PUT ao GCS por **`XMLHttpRequest`**, fora do `apiClient`

O `apiClient` sempre manda `Content-Type: application/json` e `credentials:
'include'` a caminho same-origin — inútil para o PUT, que é **cross-origin**
(sem cookie de sessão), com o `Content-Type` do próprio arquivo e **corpo cru**.
Decisivo: **`fetch` não expõe progresso de upload**; o `onProgress({percent})`
do `Upload` exige `xhr.upload.onprogress`. Logo o PUT é um **XHR próprio**
(`PUT url`, `setRequestHeader('Content-Type', file.type)`, `xhr.send(file)`,
`xhr.upload.onprogress` → `onProgress`). O **pedido de URLs** continua pelo
`apiClient` (same-origin, JSON, cookie). Alternativa `fetch` foi descartada só
pela ausência de progresso — que é requisito literal da US 3.1.

```
customRequest(file):
  (URLs já obtidas em lote no início do envio — ver D3)
  result = resultByFileName[file]
  if !result.ok → onError(new Error(result.error))        // item recusado (cota/inválido)
  else → xhr PUT result.uploadUrl, body=file, onprogress→onProgress, 2xx→onSuccess
```

### D3 — Uma chamada de lote **antes** dos PUTs; resultados casados por item

O envio tem duas fases: (1) **uma** chamada `POST /files/upload-urls` com todos
os itens da seleção; (2) os PUTs individuais, um por item aceito. O `Upload` do
AntD dispara `customRequest` **por arquivo**, então a fase (1) roda uma vez
(no início do envio) e cada `customRequest` **consome** o resultado já obtido,
casado por identidade do arquivo (nome + `relativePath` para desambiguar arquivos
homônimos em subpastas distintas). Casar por item — em vez de uma chamada de URL
por arquivo — é o que dá a **reserva de cota atômica do lote** (D1) e uma única
ida ao servidor. O casamento usa uma chave estável derivada do arquivo, não a
ordem, porque o `Upload` pode disparar `customRequest` fora de ordem.

### D4 — Desfecho e nova tentativa **independentes** por item (US 3.1 c2)

Cada arquivo é um item da `fileList` do `Upload`, com estado próprio
(`uploading`/`done`/`error`) e seu `Progress`. Uma falha — item recusado pelo
servidor (`ok: false`) **ou** PUT sem `2xx` — chama `onError` **só daquele
item**; os demais seguem. O item em `error` mostra a ação **repetir**, que
reexecuta `customRequest` **apenas para ele** (`Upload` já suporta re-upload de
um item). Ponto sutil: repetir um item cuja falha foi de **cota** precisa de uma
**nova URL** — a reserva anterior daquele item não chegou a existir. Decisão: o
botão repetir de um item sem URL válida **refaz uma chamada de lote de 1** para
aquele arquivo; um item que falhou só no PUT (já tem URL válida, não expirada)
**reusa a URL**. Simples e correto: a nova tentativa sempre reconquista a folga
de cota atual do servidor.

### D5 — `relativePath` derivado de `webkitRelativePath` (US 3.2)

`Upload` com `directory` entrega arquivos com `webkitRelativePath` =
`"Pasta/Sub/arquivo.txt"`. A SPA deriva `relativePath` = **o trecho de diretório
sem o nome do arquivo** (`"Pasta/Sub"`), preservando a **pasta-raiz selecionada**
no caminho — assim o servidor recria a hierarquia idêntica sob a pasta corrente
via `ensureFolderPath`. Arquivo sem `webkitRelativePath` (envio plano) vai sem
`relativePath` (direto no destino). A normalização de segmentos (`.`/`..`, vazios)
é responsabilidade do servidor (`normalizeRelativePath`); o cliente só recorta.

### D6 — Sucesso = PUT `2xx`; invalida listagem; **sem polling** por `active`

Ao `onSuccess` do PUT, a SPA considera o arquivo **enviado** e **invalida a
query de listagem** da pasta corrente (mesma chave `folder-contents` da Fatia 2,
via `queryClient.invalidateQueries`). O arquivo aparece então com o `status` que
o servidor retornar — hoje **`pending`**, já renderizado como `Tag` pela Fatia 2
— porque a promoção a `active` é out-of-band. A SPA **não** faz polling à espera
de `active`: seria acoplar o front a um evento que, no dev, nem dispara sozinho.
Alternativa — poll até `active` — descartada por Non-Goal e por dar falsa
impressão de que a SPA controla a reconciliação. A invalidação é disparada uma
vez ao fim do lote (ou por item concluído; escolha de implementação, sem efeito
no contrato).

### D7 — Erro de destino (404/403) do lote bloqueia sem transferir; 401 central

Se `POST /files/upload-urls` responder **404** (destino inexistente) ou **403**
(sem permissão sobre o destino), **nenhum** item recebe URL e a SPA **não inicia
PUT algum** — exibe um aviso (`message.error`/`notification`) reusando o padrão
`handlePermissionError` da Fatia 2. Erro **por item** (`ok: false`) é diferente:
não é falha de destino, é recusa localizada (cota/inválido) tratada no D4.
**401** permanece tratado centralmente (Fatia 1) → limpa sessão → `/login`.

### D8 — Novos schemas Zod amarrados aos DTOs de lote

`lib/schemas.ts` ganha `batchUploadUrlResponseSchema` (com
`batchUploadItemResultSchema` via `z.discriminatedUnion('ok', …)`), tipado como
`z.ZodType<BatchUploadUrlResponse>` contra `@gdoc/shared` (mesmo padrão das
fatias anteriores): se o contrato mudar sem o schema acompanhar, o `tsc` acusa.
A resposta passa por `.parse()` antes de alimentar o casamento por item (D3),
validando o discriminante `ok`.

### D9 — UI: `Upload` na toolbar do explorador, com lista de progresso

Dois gatilhos na toolbar do `ExplorerPage` (ao lado de "Nova pasta"): **"Enviar
arquivos"** (`Upload multiple`) e **"Enviar pasta"** (`Upload directory`),
extraídos num componente próprio (`navegacao/UploadArea.tsx` ou similar) que
recebe o `destinationFolderId` = pasta corrente. A lista de itens do `Upload`
mostra `Progress` por arquivo e a ação repetir por item em erro; `notification`
cobre o aviso de cota (D4) e o erro de destino (D7). O componente não altera o
contrato do explorador — só injeta a invalidação (D6) via o mesmo `queryClient`.

## Risks / Trade-offs

- **Arquivo fica `pending` e nunca vira `active` no dev** (sem Pub/Sub) → é o
  comportamento honesto do sandbox; a reconciliação é out-of-band e documentada
  (README `curl`). A SPA cumpriu seu papel ao concluir o PUT; a `Tag pending` é
  informação verdadeira, não bug. Mitigação: a mensagem de sucesso diz "enviado"
  (não "disponível").
- **URL assinada expira antes do PUT** (TTL curto; lote grande/conexão lenta) →
  o PUT falha, o item entra em `error` e o **repetir** (D4) reconquista uma URL
  nova. Aceitável no MVP; não há renovação automática em background.
- **Casar resultado por nome+`relativePath` colide se houver dois arquivos com o
  mesmo nome no mesmo caminho** → não ocorre num sistema de arquivos real (nomes
  são únicos por diretório); a chave é segura para a origem (seleção de FS). Para
  seleção plana com homônimos, o `uid` do próprio `Upload` desambigua como reforço.
- **Reserva de cota do lote conta itens que ainda vão falhar no PUT** → o servidor
  reserva na assinatura, não na finalização; um PUT que nunca acontece deixa uma
  reserva `pending` até o expurgo/reconciliação. É comportamento do backend já
  existente (fora do escopo desta fatia frontend), apenas registrado.

## Migration Plan

Fatia puramente aditiva no frontend: novo componente de upload + dois gatilhos na
toolbar do explorador, um hook de lote e novos schemas Zod. Sem migração de
dados, sem mudança de API/contratos/infra. Rollback = reverter o commit da fatia;
as Fatias 1–3 permanecem funcionais.

## Open Questions

- Nenhuma bloqueante. A **barra proativa de uso/cota** e o **download de pasta
  `.zip` (US 3.3)** ficam em aberto como evoluções que dependem de novos
  endpoints de backend, fora do escopo desta fatia.
