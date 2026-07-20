## ADDED Requirements

### Requirement: Visualização informa indisponibilidade e oferta de download para formato sem pré-visualização

A emissão de visualização de um arquivo (`POST /files/:id/view-url`) SHALL,
**após** autorizar o verbo `view` (dono OU grant `view` OU admin da unidade;
fail-closed conforme a capability `controle-acesso`), classificar o formato pelo
`content_type` do arquivo e ramificar o comportamento:

- Quando o formato é **pré-visualizável** — os formatos que o navegador
  renderiza nativamente: **PDF, imagem, vídeo, áudio e texto** — a rota SHALL
  manter o comportamento de visualização: gravar a auditoria `view` e emitir a
  URL assinada `inline` de TTL curto, indicando `previewAvailable: true`.
- Quando o formato **não é pré-visualizável** — nesta fase, **documentos Office**
  (Word/Excel/PowerPoint) e **qualquer outro** tipo, incluindo `content_type`
  ausente — a rota NÃO SHALL emitir URL de visualização e NÃO SHALL gravar
  auditoria `view` (nada foi visualizado). A resposta SHALL indicar
  `previewAvailable: false` (pré-visualização indisponível) e SHALL oferecer o
  download **respeitando a permissão** do solicitante: a oferta SHALL sinalizar
  disponível somente quando o solicitante detém o verbo `download` sobre o
  arquivo (dono OU grant `download` OU admin da unidade), e indisponível caso
  contrário.

A oferta de download SHALL ser apenas um sinal — o download efetivo SHALL
continuar pela rota `POST /files/:id/download-url`, que faz sua própria checagem
de permissão e grava a auditoria `download`. A classificação de
pré-visualizabilidade SHALL vir de uma fonte única compartilhada em
`packages/shared`, derivada da taxonomia `FileCategory`, de modo que API e
frontend concordem sobre o que é pré-visualizável.

Referência: PRD US 9.2 (cenário 2), RF #16. O cenário 1 da US 9.2 (renderização
de formatos suportados e conversão de documentos Office para PDF via
`PreviewConversionPort`) fica **fora desta fatia**, para fase futura do MVP;
quando existir, o Office passa a pré-visualizável na mesma fonte compartilhada.

#### Scenario: Formato pré-visualizável emite URL inline e audita view

- **WHEN** uma pessoa com o verbo `view` sobre um arquivo de PDF, imagem, vídeo,
  áudio ou texto solicita `POST /files/:id/view-url`
- **THEN** a resposta traz `previewAvailable: true` com a URL assinada `inline`
  de TTL curto e a ação `view`, e um registro de auditoria `view` é gravado

#### Scenario: Formato Office responde indisponível e oferece download conforme permissão

- **WHEN** uma pessoa com o verbo `view` (e também com o verbo `download`) sobre
  um documento Word, Excel ou PowerPoint solicita `POST /files/:id/view-url`
- **THEN** a resposta traz `previewAvailable: false` informando que a
  pré-visualização não está disponível, nenhuma URL de visualização é emitida,
  nenhuma auditoria `view` é gravada, e a oferta de download é sinalizada
  **disponível** porque o solicitante detém o verbo `download`

#### Scenario: Formato não pré-visualizável sem permissão de download não oferece o download

- **WHEN** uma pessoa que detém apenas o verbo `view` (sem `download`) sobre um
  arquivo de formato não pré-visualizável solicita `POST /files/:id/view-url`
- **THEN** a resposta traz `previewAvailable: false` e a oferta de download é
  sinalizada **indisponível**, respeitando a ausência da permissão `download`, e
  nenhuma URL nem auditoria é gerada

#### Scenario: content_type ausente ou desconhecido cai no ramo indisponível

- **WHEN** uma pessoa com o verbo `view` solicita a visualização de um arquivo
  cujo `content_type` está ausente ou não se enquadra em nenhuma categoria
  pré-visualizável
- **THEN** a resposta traz `previewAvailable: false` (com a oferta de download
  conforme a permissão `download`), nunca uma URL `inline` para conteúdo
  irreconhecível

#### Scenario: Sem o verbo view, a classificação de formato nunca é alcançada

- **WHEN** uma pessoa sem o verbo `view` sobre o arquivo (incluindo item de outra
  unidade, item na lixeira ou link direto sem permissão) solicita
  `POST /files/:id/view-url`
- **THEN** a resposta é 403 fail-closed antes de qualquer classificação de
  formato, sem URL, sem auditoria e sem revelar a existência ou o formato do item
