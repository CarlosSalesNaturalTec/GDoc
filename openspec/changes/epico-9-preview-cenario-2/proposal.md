## Why

O PRD (`docs/prd_final.md`, Épico 9 / **US 9.2**, RF #16) exige que o
colaborador visualize arquivos sem baixá-los e, **quando o formato não tiver
pré-visualização disponível**, que o sistema o informe claramente e ofereça o
download, **respeitando suas permissões** (cenário 2). Hoje
`POST /files/:id/view-url` (`apps/api/src/routes/files.ts`) assina uma URL
`inline` e grava auditoria `view` para **qualquer** `content_type` — inclusive
documentos Office e binários que o navegador não renderiza: nesses casos o
usuário não "visualiza" nada (o browser baixa ou mostra lixo), e ainda assim um
acesso `view` é registrado. Esta mudança fecha **apenas o cenário 2** da US 9.2:
distinguir o que é pré-visualizável do que não é e, no segundo caso, responder
"pré-visualização indisponível" + oferta de download sujeita à permissão — sem
emitir URL nem auditar um `view` que não aconteceu.

O **cenário 1** da US 9.2 (renderizar formatos suportados na tela, incluindo a
conversão de documentos Office para PDF via `PreviewConversionPort`, hoje
reservado e não implementado) **NÃO** entra nesta fatia: fica para uma fase
futura do MVP (ver "Fora de escopo").

## What Changes

- **Classificação de pré-visualização (US 9.2 cenário 2)**: novo predicado
  compartilhado em `packages/shared` — `isPreviewable(contentType)` — derivado
  da taxonomia `FileCategory` já existente (`dashboard.ts`). Nesta fase, são
  **pré-visualizáveis** os formatos que o **navegador renderiza nativamente**:
  PDF, imagem, vídeo, áudio e texto. **Office** (Word/Excel/PowerPoint) e
  **outros** binários são classificados como **não pré-visualizáveis** por ora —
  o Office só passa a ser pré-visualizável quando a conversão do cenário 1 for
  implementada (fase futura), e o predicado deixa esse ponto de virada explícito.
- **`POST /files/:id/view-url` passa a ramificar pelo formato** (mantendo a
  checagem de permissão `view` fail-closed que já existe e cobre link direto,
  lixeira e cross-unidade):
  - **Formato pré-visualizável** → comportamento atual **inalterado**: grava
    auditoria `view` e emite a URL assinada `inline` de TTL curto.
  - **Formato não pré-visualizável (cenário 2)** → **nenhuma** URL de
    visualização é emitida e **nenhum** `view` é auditado (nada foi
    visualizado). A resposta informa que a pré-visualização está indisponível e
    indica se o download está disponível para o solicitante, checando o verbo
    `download` (dono OU grant `download` OU admin da unidade) — "oferece o
    download, **respeitando minhas permissões**". A oferta é apenas um sinal; o
    download em si segue pela rota existente `POST /files/:id/download-url`, que
    faz sua própria checagem e audita `download`.
- **Contrato de resposta do view-url vira uma união discriminada** por
  `previewAvailable`: no ramo pré-visualizável, um **superset** do
  `SignedUrlResponse` atual (`{ previewAvailable: true, url, expiresAt, action }`);
  no ramo indisponível, `{ previewAvailable: false, reason, download: { available } }`.
  O caminho feliz permanece aditivo; só o ramo do cenário 2 é novo.
- **Permissão continua sendo a fronteira**: sem o verbo `view`, a resposta segue
  403 fail-closed **antes** de qualquer classificação (inalterado) — o ramo
  "indisponível" só é alcançado por quem já pode ver o item, então nunca vaza
  existência de arquivo de outra unidade nem da lixeira.

### Fora de escopo (mudanças futuras)

- **US 9.2 cenário 1 (formatos suportados / preview na tela)**: a renderização
  inline dos formatos nativos já existe no `view-url` desde épicos anteriores e
  **não é (re)construída** aqui; e a **conversão de documentos Office → PDF**
  (`PreviewConversionPort` + Job LibreOffice headless, Cloud Run Job) fica para
  uma **fase futura do MVP**, a ser discutida em outra ocasião. Quando entrar,
  vira change própria e flipa o Office para pré-visualizável no predicado desta
  fatia.
- **Auditoria de "tentativa de preview indisponível"**: o cenário 2 não gera
  `view` (nada foi visto) e esta fatia **não** cria uma nova ação de auditoria
  para a tentativa — se vier a ser exigido, é extensão futura do Épico 7.
- **UI/SPA da tela de visualização e da mensagem "pré-visualização indisponível"
  + botão de download** (`apps/web` segue esqueleto) — só o contrato de API
  entra aqui.
- **Miniaturas/thumbnails e visualização parcial** de formatos não suportados —
  fora do MVP.

## Capabilities

### New Capabilities
- `visualizacao`: emissão de visualização sem download com tratamento de formato
  **sem pré-visualização** — classificação de pré-visualizabilidade a partir do
  `content_type` e, para formato não suportado, resposta que informa a
  indisponibilidade e oferece o download respeitando a permissão `download` do
  solicitante, sem emitir URL de visualização nem auditar `view`. Cobre **US 9.2
  cenário 2** (lado de API).

### Modified Capabilities
- `controle-acesso`: o cenário "Detentor do verbo acessa e é auditado" passa a
  valer, para o verbo `view`, **apenas quando o formato é pré-visualizável** —
  para formato não pré-visualizável, deter `view` **não** produz URL nem
  auditoria; a resposta é governada pela nova capability `visualizacao`. O verbo
  `download` permanece inalterado (sempre emite URL + audita `download` quando
  autorizado).

## Impact

- **Código** (`apps/api/src`): `routes/files.ts` — o handler de
  `POST /files/:id/view-url` ramifica por `isPreviewable`; no ramo indisponível
  reusa a resolução de permissão `download` (`findAccessibleFile` com
  `Permission.DOWNLOAD`) para preencher `download.available`, sem emitir URL nem
  chamar `recordAudit`. Nenhuma mudança em `download-url`, `upload-url` ou nas
  rotas de busca/navegação.
- **Contratos** (`packages/shared`): novo `isPreviewable(contentType)` (e/ou
  conjunto de categorias pré-visualizáveis) em `dashboard.ts`/módulo de tipos,
  reusando `FileCategory`; nova união discriminada `ViewUrlResponse`
  (`previewAvailable: true | false`) em `storage.ts`, superset do
  `SignedUrlResponse` no ramo feliz. Rebuild de `packages/shared` (consumido
  compilado).
- **Banco** (`apps/api/src/db/migrations/`): **nenhuma** — sem tabela nova, sem
  coluna nova; a auditoria não muda de esquema, apenas deixa de ser gravada no
  ramo indisponível.
- **Infra / Ports / Paridade dev**: **nenhum** recurso de nuvem novo, nenhum
  port novo; o `PreviewConversionPort` permanece reservado e **intocado**
  (só será ligado na fase futura do cenário 1). SessionStart hook inalterado.
- **Testes** (`apps/api/src/__tests__`, padrão `seedTwoUnits` /
  `withSystemBypass`): formato pré-visualizável (PDF/imagem/…) mantém URL
  `inline` + auditoria `view`; formato não pré-visualizável (Office/outro)
  responde `previewAvailable:false` sem URL e **sem** linha de auditoria `view`;
  `download.available` reflete a permissão `download` (verdadeiro com posse/grant
  `download`/admin da unidade; falso só com `view`); solicitante sem `view` segue
  403 fail-closed antes da classificação (link direto, lixeira, outra unidade).
