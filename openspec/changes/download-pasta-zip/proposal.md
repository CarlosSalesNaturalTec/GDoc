# Proposal — download-pasta-zip

## Why

O download hoje é **arquivo a arquivo**: `POST /files/:id/download-url` emite uma
URL assinada por vez. A **US 3.3** do PRD (`docs/prd_final.md`) prevê baixar uma
**pasta completa em um único arquivo compactado**, e o
`docs/manual_do_usuario.md` seção 10 já anuncia isso ao usuário como recurso
previsto e ainda indisponível.

A US 3.3 foi adiada duas vezes por dependência: o Épico 3 a deixou para depois do
motor de permissão, e o `epico-4-permissoes-granulares` a registrou explicitamente
como fora de escopo ("destravada por esta fatia, mas o motor de compactação em si
permanece fora"). O motor de permissão existe desde então — `hasAccess` resolve
dono/admin/grant por item —, então a dependência está satisfeita e o corte pode
ser fechado.

O problema real não é comprimir: é **onde comprimir sem violar o invariante de
que bytes nunca passam pela API**, e como honrar o cenário 2 da US 3.3, que exige
que o pacote contenha **apenas os itens permitidos ao solicitante**.

## What Changes

- **Manifesto de download de pasta** — novo `POST /folders/:id/download-manifest`.
  A API percorre a subárvore da pasta, resolve `download` **item a item** com o
  motor existente, e devolve a lista dos arquivos permitidos com **caminho
  relativo**, nome, tamanho e **URL assinada de download** para cada um. A
  compactação em si acontece **no cliente**, que baixa direto do bucket e monta o
  `.zip` — bytes continuam sem tocar a API.
- **Resposta informa o recorte aplicado** — além dos itens, o manifesto devolve
  quantos arquivos existem na subárvore e quantos foram liberados ao solicitante,
  para que a interface possa dizer "47 de 120 itens disponíveis para você" em vez
  de entregar silenciosamente um pacote incompleto (US 3.3, cenário 2).
- **Auditoria por arquivo** — cada arquivo incluído no manifesto grava um evento
  `download`, exatamente como `POST /files/:id/download-url` já faz na emissão da
  URL. Baixar uma pasta com 47 arquivos permitidos produz 47 eventos.
- **Limite de tamanho do pedido** — manifesto acima do limite configurado (número
  de arquivos ou soma de bytes) é recusado com erro explícito orientando a baixar
  subpastas separadamente, em vez de estourar a memória do navegador.
- **Interface** — ação "Baixar pasta" na página de Arquivos, com progresso,
  aviso de recorte parcial, mensagem própria para "nenhum item disponível" e
  cancelamento.
- **Manual do usuário** — a seção 10 perde o item de download compactado, e a
  seção 5.5 ganha a descrição do recurso.

Fora de escopo (registrado em design.md):

- **Compactação no servidor / job assíncrono.** Descartada nesta fatia por custo
  de infraestrutura (estado de pedido, TTL e limpeza do artefato, cota); ver D1,
  que também descreve o caminho de migração caso os limites de D5 se mostrem
  apertados na prática.
- **Retomada e download em segundo plano.** Cancelar e refazer é o comportamento
  desta fatia.
- **Escolher formato de compactação** (tar, 7z) ou nível de compressão.
- **Baixar seleção múltipla de arquivos avulsos** em um pacote — o recorte é
  "uma pasta e sua subárvore". Extensão natural, fatia futura.
- **Compactar itens da lixeira.**

## Capabilities

### New Capabilities

- `download-pasta`: download de uma pasta e sua subárvore como um único arquivo
  compactado, com o conteúdo **filtrado pela permissão de baixar do solicitante,
  item a item**, preservando a hierarquia de subpastas nos caminhos internos,
  auditando cada arquivo incluído e informando explicitamente quando o pacote é
  um recorte parcial do conteúdo da pasta. Cobre US 3.3.

### Modified Capabilities

<!-- Nenhum requisito verificável já publicado é reescrito. `controle-acesso`
     ("Acesso a conteúdo exige posse ou permissão do verbo correspondente")
     continua sendo a regra aplicada — esta capability a **consome** item a item,
     sem afrouxá-la nem introduzir herança de pasta para conteúdo. `auditoria`
     também segue intacta: o evento gravado é o mesmo `download` já normatizado,
     no mesmo momento (emissão da URL assinada), apenas emitido N vezes numa só
     operação. `visualizacao` não é afetada — não há preview de pasta. -->

## Impact

- **API (`apps/api/src`):** novo `routes/folders.ts::POST /:id/download-manifest`;
  novo helper em `lib/folder-tree.ts` para percorrer a subárvore viva de uma pasta
  e produzir caminhos relativos (inverso de `normalizeRelativePath`, já usado no
  upload de pasta); reuso de `hasAccess`/`visibleResourceClause` sem alteração;
  reuso de `ports.storage.getDownloadUrl` e de `recordAudit` sem alteração.
  `config.ts` ganha os limites de D5.
- **Shared (`packages/shared/src`):** DTOs `FolderDownloadManifestResponse` e
  `FolderDownloadManifestEntry` (`relativePath`, `fileName`, `sizeBytes`, `url`,
  `expiresAt`); rebuild de `dist`.
- **Web (`apps/web/src`):** ação "Baixar pasta" em `navegacao/`; módulo de
  compactação em streaming no cliente; estado de progresso, recorte parcial e
  cancelamento.
- **Testes (`apps/api/src/__tests__`):** novo `download-pasta.test.ts` — recorte
  por permissão item a item, ausência de herança (grant só na pasta ⇒ manifesto
  vazio), auditoria de N eventos, hierarquia refletida nos caminhos relativos,
  itens da lixeira excluídos, isolamento entre unidades, limite excedido.
  Testes de web para recorte parcial, pacote vazio e cancelamento.
- **Sem migração de banco.** Nenhuma tabela nova; nada tenant-scoped é criado.
- **Sem mudança de infraestrutura** na fatia escolhida (D1) — não há job, fila
  nem bucket temporário. **Depende** da configuração de CORS do bucket já prevista
  em `platform-infrastructure` para `GET` direto do navegador; ver D6.
