## Context

O `POST /files/:id/view-url` (`apps/api/src/routes/files.ts`) já é o guardião
da visualização: checa o verbo `view` (fail-closed, cobrindo link direto,
lixeira e cross-unidade), grava auditoria `view` e assina uma URL `inline` de
TTL curto (~5 min). Hoje ele faz isso para **qualquer** `content_type`. Para os
formatos que o navegador renderiza nativamente (PDF, imagem, vídeo, áudio,
texto) isso já entrega o cenário 1 da US 9.2; para documentos Office e binários
desconhecidos, porém, o navegador não pré-visualiza — o usuário não vê o
conteúdo e ainda assim um acesso `view` é auditado.

Esta fatia entrega **somente o cenário 2** da US 9.2 (`docs/prd_final.md`,
RF #16): quando o formato não tem pré-visualização, informar a indisponibilidade
e oferecer o download respeitando a permissão. O **cenário 1** — em especial a
conversão Office → PDF via `PreviewConversionPort` (reservado, ver
`apps/api/src/ports/preview-conversion-port.ts`) — fica para uma fase futura do
MVP e **não** é construído aqui.

Já existe a base de classificação: `packages/shared/src/dashboard.ts` expõe
`FileCategory` (`image`/`video`/`audio`/`pdf`/`office`/`text`/`other`) e
`fileCategory(contentType)`, hoje usados pelo painel (Épico 8) e pela busca
(US 9.1).

## Goals / Non-Goals

**Goals:**
- Distinguir formato **pré-visualizável** de **não pré-visualizável** por uma
  fonte única compartilhada, reusando `FileCategory`.
- Para formato não pré-visualizável: responder "pré-visualização indisponível" +
  oferta de download sujeita à permissão `download`, **sem** emitir URL de
  visualização e **sem** auditar `view`.
- Preservar 100% o comportamento atual para formatos pré-visualizáveis (URL
  `inline` + auditoria `view`) e a fronteira de permissão fail-closed.

**Non-Goals:**
- Renderização/preview de formatos suportados (cenário 1) — já existe para os
  nativos e não é reconstruída; não é adicionada para Office.
- Conversão de documentos Office para PDF e qualquer uso do
  `PreviewConversionPort` — fase futura.
- Qualquer mudança em `download-url`, upload, busca, navegação, esquema de
  banco, ports ou infraestrutura.
- UI da tela de visualização / mensagem de indisponibilidade / botão de
  download (`apps/web` segue esqueleto).

## Decisions

### D1 — Classificação em `packages/shared`, reusando `FileCategory`
Novo predicado `isPreviewable(contentType)` (e/ou um conjunto
`PREVIEWABLE_CATEGORIES`) em `packages/shared`, derivado de
`fileCategory(contentType)`. Fonte única para api e web concordarem sobre o que
é pré-visualizável — a futura UI precisa da mesma verdade para decidir entre
render inline e "indisponível + download".
_Alternativa rejeitada_: classificar por MIME solto dentro da rota da API —
duplicaria a taxonomia que já vive em `shared` e divergiria da UI.

### D2 — Conjunto pré-visualizável desta fase = nativos do navegador
Pré-visualizáveis: **PDF, imagem, vídeo, áudio, texto**. **Office** e **outros**
são **não** pré-visualizáveis nesta fase. Racional: sem a conversão do cenário 1,
o navegador não renderiza `.docx/.xlsx/.pptx`; classificá-los como
indisponíveis é o comportamento honesto do cenário 2. O predicado documenta o
**ponto de virada**: quando a conversão Office (fase futura) existir, `office`
passa a pré-visualizável — mudança localizada em `shared`.
_Alternativa rejeitada_: já marcar Office como pré-visualizável e retornar erro
na hora de assinar — vazaria uma promessa que a API ainda não cumpre.

### D3 — Um endpoint, resposta em união discriminada por `previewAvailable`
Mantém-se `POST /files/:id/view-url`; a resposta passa a ser:
- pré-visualizável → `{ previewAvailable: true, url, expiresAt, action: 'view' }`
  (superset aditivo do `SignedUrlResponse` atual);
- não pré-visualizável → `{ previewAvailable: false, reason: 'unsupported_format',
  download: { available: boolean } }`.
Uma chamada só; o cliente ramifica pelo discriminador.
_Alternativa rejeitada_: endpoint separado `/preview-info` — exigiria duas
chamadas e duplicaria a checagem de permissão.

### D4 — Ramo indisponível não emite URL nem audita `view`
Coerente com o princípio de auditoria do MVP ("ponto de auditoria = emissão da
URL", não transferência de bytes): se nenhuma URL de visualização é emitida,
nada foi visualizado e nenhuma linha `view` é gravada. Evita poluir a auditoria
(e o painel/consulta do Épico 7/8) com "visualizações" que não ocorreram.

### D5 — `download.available` reflete o verbo `download`, sem emitir a URL
No ramo indisponível, resolve-se a permissão de download via
`findAccessibleFile(ports, ctx, id, Permission.DOWNLOAD)` para preencher
`download.available` — "oferece o download, **respeitando minhas permissões**".
A oferta é só um **sinal**: o download em si continua pela rota existente
`POST /files/:id/download-url`, que faz sua própria checagem e audita
`download`. Assim não há emissão nem auditoria de download só por consultar a
visualização.

### D6 — Ordem: permissão `view` antes de classificar
O handler mantém a checagem `view` fail-closed no início; só quem já pode ver o
item chega à classificação. Garante que o ramo "indisponível" nunca revele a
existência de arquivo de outra unidade ou da lixeira (esses continuam 403 antes
de qualquer sinal de formato).

## Risks / Trade-offs

- **Mudança do contrato de resposta do `view-url`** → o ramo feliz é um
  **superset aditivo** (`previewAvailable: true` + os mesmos campos), e `apps/web`
  é esqueleto sem consumidor real; risco de quebra é baixo e o novo campo
  discriminador é documentado no DTO compartilhado.
- **`content_type` ausente ou incorreto no upload** → `fileCategory(null)` já
  resolve para `other`, logo não pré-visualizável: cai no cenário 2 com oferta de
  download — degradação segura, nunca uma URL `inline` para algo irreconhecível.
- **Usuário espera "ver" um Word e recebe indisponível** → é exatamente o
  cenário 2 do PRD até o cenário 1 existir; mitigado por mensagem clara + oferta
  de download, e o ponto de virada (Office → pré-visualizável) está documentado
  para a fase futura.

## Migration Plan

- Sem migração de banco (nenhuma tabela/coluna nova; esquema de auditoria
  intacto). Deploy é só de código (`apps/api`) + `packages/shared` (rebuild do
  `dist`, consumido compilado).
- **Rollback**: reverter o commit — nenhum estado persistente muda; a única
  diferença observável é a forma da resposta do `view-url` e a ausência de linhas
  `view` para formatos não pré-visualizáveis.

## Open Questions

- Nenhuma bloqueante. A implementação do cenário 1 (conversão Office e wiring do
  `PreviewConversionPort`) será desenhada na fase futura do MVP; quando chegar,
  bastará mover `office` para o conjunto pré-visualizável em `shared` e ligar a
  conversão ao ramo de assinatura.
