## Context

A Fatia 2 (`web-navegacao`, arquivada) entregou o explorador: `Table` unificando
pastas e arquivos, trilha (`Breadcrumb`), ações de gestão por item e o padrão de
tratar **403 fail-closed** do servidor (`handlePermissionError` em
`ExplorerPage.tsx`). Hoje uma linha de arquivo é **inerte quanto a abrir** — o
usuário vê metadados mas não o conteúdo.

O backend (US 9.2, `apps/api/src/routes/files.ts`, arquivado) é o **único
guardião de permissão** e já expõe tudo que esta fatia precisa — nenhuma
mudança de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `POST /files/:id/view-url` | URL de preview **ou** sinal de indisponibilidade | `ViewUrlResponse` |
| `POST /files/:id/download-url` | URL de download `attachment` | `SignedUrlResponse` |

Contrato de `ViewUrlResponse` (união discriminada por `previewAvailable`):

```ts
type ViewUrlResponse =
  | ({ previewAvailable: true } & SignedUrlResponse)        // { url, expiresAt, action:'view' }
  | { previewAvailable: false;
      reason: 'unsupported_format';
      download: { available: boolean } };
```

Regras de governança já implementadas no servidor, que o cliente **não
duplica**, apenas respeita:

- **Permissão antes da URL**: sem dono-ou-grant `view` (ou `download`), o
  endpoint responde **403** e **não** emite URL nem grava auditoria (fail-closed,
  US 4.2 / RF #10).
- **Auditoria na emissão**: o ramo `previewAvailable: true` grava um `view`;
  `download-url` grava um `download`. O ramo `previewAvailable: false` **não**
  emite URL nem audita — "nada foi visto".
- **TTL curto e disposição**: view ~5 min (`inline`); download ~15–30 min
  (`attachment`). O bucket é privado; os bytes trafegam direto do GCS ao browser.
- **`isPreviewable`/`fileCategory`** (`packages/shared/src/dashboard.ts`) são a
  **fonte única** do que é pré-visualizável: PDF, imagem, vídeo, áudio, texto.
  Office **não** é previewable hoje (conversão é fase futura — `PreviewConversionPort`).

## Goals / Non-Goals

**Goals:**
- Visualização inline de arquivos pré-visualizáveis, sem baixá-los — US 9.2
  cenário 1 (para os formatos que o backend hoje marca `previewAvailable: true`).
- Mensagem clara de "pré-visualização indisponível" com oferta de download
  conforme permissão — US 9.2 cenário 2.
- Download de arquivo por URL assinada `attachment` — RF #16.
- 403 do servidor tratado como bloqueio, sem expor preview — RF #10.
- Reuso máximo da fundação: `apiClient`, TanStack Query, Zod, `fileCategory` de
  `@gdoc/shared`, `renderApp`/`mock-fetch`.

**Non-Goals:**
- Preview de documentos de escritório (Word/Excel/PowerPoint): o backend hoje os
  marca `previewAvailable: false` (conversão futura); caem no ramo cenário 2 sem
  tratamento especial no cliente.
- Auto-refresh da URL assinada ao expirar o TTL: uma URL por abertura.
- Download de pasta completa em `.zip` (RF #6, parte do domínio de upload/lote —
  outra fatia).
- Qualquer mudança em `apps/api` ou `packages/shared`.

## Decisions

### D1 — Preview em `Modal`, aberto do explorador (não rota própria)

A visualização é um **`Modal`** aberto a partir da linha do arquivo — decisão
tomada na exploração, seguindo o card do roadmap. Duas entradas para a mesma
ação: o **nome do arquivo vira clicável** (`Button type="link"`) e um botão
**"Visualizar"** na coluna de ações. Alternativa considerada — rota dedicada
`/arquivos/:fileId` (deep-link partilhável, alinhada à narrativa "link
`/files/:id` é sempre seguro" do CLAUDE.md) — foi **adiada**: agrega uma rota e
uma busca de arquivo por id avulso sem requisito priorizado de compartilhamento;
fica para uma change futura, e o modal já isola a lógica de preview num
componente reaproveitável se a rota surgir.

### D2 — O cliente escolhe o renderizador por `fileCategory(contentType)`, não pela resposta

O ramo `previewAvailable: true` devolve **uma URL só**, sem dizer se é imagem,
vídeo, PDF… Mas a linha já carrega `contentType` (de `FileSummaryResponse`), e
`@gdoc/shared` exporta `fileCategory()` — a **mesma** função que o backend usa em
`isPreviewable`. O modal deriva a categoria e escolhe o elemento:

```
fileCategory(file.contentType)
  image → <Image src={url}>            (AntD, com zoom/preview nativo)
  video → <video src={url} controls>
  audio → <audio src={url} controls>
  pdf   → <iframe src={url}>           (visualizador nativo do browser)
  text  → <iframe src={url}>           (render inline de text/plain)
  office/other → não ocorre no ramo true (backend responde previewAvailable:false)
```

Reusar `fileCategory` mantém back e front concordando sobre "o que é
pré-visualizável" **sem duplicar regra**: quando a conversão Office→PDF entrar,
`PREVIEWABLE_CATEGORIES` muda num lugar só e os dois lados acompanham.
Alternativa — o backend devolver a categoria na resposta — foi descartada: muda
contrato/`packages/shared` (fora do escopo de fatia frontend) e a informação já
está na listagem.

### D3 — `view-url` e `download-url` como *mutations*, buscadas uma vez por ação

Emitir uma URL **grava auditoria** (efeito colateral, não leitura idempotente):
por isso são `useMutation`, não `useQuery` com cache. O modal chama `view-url`
**uma vez ao abrir** (`useEffect`/`mutate` no mount do conteúdo) e guarda o
resultado no estado local; fechar e reabrir dispara nova chamada (nova URL, nova
auditoria — o modelo "requested = accessed" do MVP). Sem `staleTime`/cache de
URL: uma URL assinada expirada em cache seria pior que rebuscar. "Baixar" é
`mutate` on-click. Não há invalidação de listagem — preview/download não alteram
metadados.

### D4 — Download por navegação numa âncora `attachment` (sem `fetch`+blob)

O GCS não expõe CORS para `fetch` da SPA, e a URL de download já vem com
`response-content-disposition=attachment`. Logo, disparar o download é uma
**navegação simples**: criar uma `<a href={url}>` (sem `target`/`rel` externos
desnecessários), acioná-la e descartá-la — o browser baixa sem sair da SPA e sem
abrir aba. Alternativa `window.open(url)` foi preterida (pode ser bloqueada como
popup e abre aba vazia com `attachment`). O clique só ocorre **após** o
`download-url` retornar `200` com a URL.

### D5 — Ramo `previewAvailable: false`: mensagem + download condicional

Renderiza `Result`/`Empty` com **"pré-visualização indisponível"** e um botão de
download **apenas quando `download.available === true`** — o backend já resolveu
o verbo `download` do solicitante e sinalizou. Com `false`, exibe só a mensagem
(a pessoa pode ver que o arquivo existe na sua pasta, mas não tem `download`).
Realiza US 9.2 cenário 2. O botão desse ramo reusa o mesmo fluxo de download do
D4.

### D6 — 403 tratado como bloqueio, reusando o padrão da Fatia 2

`view-url`/`download-url` respondem **403** quando falta permissão. O modal
distingue o 403 (via `ApiError.status`) e mostra *"permissão insuficiente"* —
mesma mensagem/padrão do `handlePermissionError` de `ExplorerPage.tsx` — **sem**
renderizar preview. Um 403 no download on-click vira `message.error`. Um 401
continua tratado centralmente (Fatia 1) → `/login`. Isso cobre o RF #10 (link
direto/ação sem permissão nunca expõe conteúdo).

### D7 — Novos schemas Zod amarrados a `ViewUrlResponse`/`SignedUrlResponse`

`lib/schemas.ts` ganha `signedUrlResponseSchema` e `viewUrlResponseSchema`
(união discriminada por `previewAvailable`, via `z.discriminatedUnion`), cada um
tipado como `z.ZodType<T>` contra o DTO de `@gdoc/shared` (mesmo padrão das
fatias anteriores): se o contrato mudar sem o schema acompanhar, o `tsc` acusa.
As respostas passam por `.parse()` antes de alimentar o modal — a fronteira com
a API é validada, inclusive o discriminante.

### D8 — Estado não-`active` e arquivos sem bytes

Um arquivo `pending`/`replacing`/`over_quota` pode aparecer na listagem (a Fatia
2 mostra o `status` como `Tag`). Abrir preview de um arquivo sem bytes ativos é
decisão do **servidor**: se ele emitir URL, o browser tenta renderizar; se
responder 403/erro, o modal mostra o aviso correspondente. O cliente **não**
tenta adivinhar — oferece a ação e reflete a resposta. (Ocultar "Visualizar"/
"Baixar" para `status !== 'active'` fica como refinamento de UX futuro, não
requisito da US.)

## Risks / Trade-offs

- **URL assinada expira com o modal aberto (~5 min)** → aceitável no MVP: o
  preview quebra silenciosamente se ficar aberto além do TTL; reabrir resolve
  (nova URL). Auto-refresh é Non-Goal explícito. Mitigação de UX: o modal é
  efêmero por natureza (consulta rápida, o próprio objetivo da US).
- **Office marcado indisponível surpreende quem espera preview de Word/Excel**
  → mitigado pela mensagem clara do cenário 2 + botão de download; documentado
  como lacuna que fecha quando a conversão Office→PDF existir (sem retrabalho de
  front, pois a decisão é 100% do backend via `fileCategory`).
- **`<iframe>` para texto/PDF depende do visualizador do browser** → PDF e
  `text/plain` têm suporte nativo amplo; formatos de texto exóticos podem baixar
  em vez de renderizar em navegadores sem viewer — comportamento do browser, não
  do app, e o download continua disponível como saída.
- **Cada abertura audita um `view`** → é o modelo "requested = accessed" do MVP
  (intencional); abrir o preview duas vezes gera duas linhas de auditoria. Não é
  bug: alinha com a métrica de governança "100% dos acessos registrados".

## Migration Plan

Fatia puramente aditiva no frontend: novo modal + renderizadores, duas ações na
`Table` do explorador, dois hooks e dois schemas Zod. Sem migração de dados, sem
mudança de API/contratos/infra. Rollback = reverter o commit da fatia; as fatias
1 e 2 permanecem funcionais.

## Open Questions

- Nenhuma bloqueante. A rota partilhável `/arquivos/:fileId` (D1) fica em aberto
  como evolução futura, se o compartilhamento de link por arquivo virar
  requisito priorizado.
