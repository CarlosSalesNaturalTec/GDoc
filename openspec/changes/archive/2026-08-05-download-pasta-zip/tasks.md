# Tasks — download-pasta-zip

## 1. DTOs compartilhados (packages/shared)

- [x] 1.1 Criar `FolderDownloadManifestEntry` (`relativePath`, `fileName`,
  `sizeBytes`, `url`, `expiresAt`) e `FolderDownloadManifestResponse`
  (`entries`, `totalFiles`, `allowedFiles`, `totalBytes`), exportados no
  `index.ts`.
- [x] 1.2 `npm run build --workspace packages/shared`.

## 2. Travessia da subárvore (lib)

- [x] 2.1 Em `apps/api/src/lib/folder-tree.ts`, adicionar travessia da subárvore
  **viva** de uma pasta (`deleted_at IS NULL`), produzindo, para cada arquivo, o
  **caminho relativo** à pasta pedida — inverso de `normalizeRelativePath`
  (design.md D7).
- [x] 2.2 A travessia SHALL podar subpastas sem acesso de `view` do solicitante,
  junto com toda a descendência (design.md D2).
- [x] 2.3 Não materializar entradas para pastas cujo conteúdo foi integralmente
  filtrado (design.md D7).
- [x] 2.4 Teste unitário da travessia isolado da rota (hierarquia, poda,
  caminhos relativos, exclusão de itens da lixeira).

## 3. API — rota de manifesto

- [x] 3.1 `apps/api/src/config.ts`: `DOWNLOAD_MANIFEST_MAX_BYTES` default
  **50 MB** e `DOWNLOAD_MANIFEST_MAX_FILES` default **100** (ambos definidos pelo
  cliente, design.md D5), configuráveis por ambiente.
- [x] 3.2 `apps/api/src/routes/folders.ts`: `POST /folders/:id/download-manifest`.
  Ordem obrigatória: **checar `view` na pasta → percorrer e filtrar por
  `download` item a item → validar limites → emitir URLs assinadas → auditar**
  (design.md D5 — nada assinado nem auditado em pedido recusado).
- [x] 3.3 Resolver `Permission.DOWNLOAD` por arquivo com `hasAccess` — **sem**
  atalho, sem herança, reusando a resolução existente sem alterá-la.
- [x] 3.4 Emitir URLs com `ports.storage.getDownloadUrl`, no **mesmo TTL** de
  download já praticado (design.md D6).
- [x] 3.5 Gravar um evento `download` por arquivo incluído, em lote na mesma
  transação (design.md D4).
- [x] 3.6 Devolver `totalFiles`/`allowedFiles` sempre, inclusive quando
  `allowedFiles === 0` (design.md D3).
- [x] 3.7 Recusa por limite: erro **específico** identificando **qual** teto foi
  atingido, com o valor encontrado e o permitido — contagem e bytes precisam
  produzir mensagens distinguíveis (design.md D5).
- [x] 3.8 Confirmar que nenhum prefixo de topo novo é criado — a rota fica sob
  `/folders`, já presente nas três listas.

## 4. Web — ação de baixar pasta

- [x] 4.1 Ação "Baixar pasta" na linha da pasta e no cabeçalho da pasta aberta
  (`apps/web/src/navegacao/`), oferecida **uniformemente**, inclusive na raiz da
  unidade — não esconder onde o pedido provavelmente será recusado (design.md D9).
- [x] 4.2 Módulo de compactação **em streaming** no cliente, sem reter todos os
  arquivos em memória simultaneamente.
- [x] 4.3 Progresso por arquivo e agregado, com **cancelamento**.
- [x] 4.4 Quando `allowedFiles < totalFiles`, exibir aviso de recorte parcial
  antes de iniciar ("N de M itens disponíveis para você").
- [x] 4.5 Quando `allowedFiles === 0`, exibir mensagem explícita e **não** gerar
  arquivo (design.md D3).
- [x] 4.6 Tratar a recusa por limite com a mensagem específica da API, orientando
  a baixar subpastas.
- [x] 4.7 Nome do arquivo gerado a partir do nome da pasta.

## 5. Testes (API)

- [x] 5.1 `download-pasta.test.ts`: hierarquia refletida nos caminhos relativos.
- [x] 5.2 Recorte por permissão item a item (US 3.3 cenário 2).
- [x] 5.3 **Sem herança**: grant apenas na pasta ⇒ `allowedFiles === 0`.
- [x] 5.4 Admin da unidade obtém a subárvore da própria unidade sem grant.
- [x] 5.5 `view` ausente na pasta de entrada ⇒ `403` sem vazar existência.
- [x] 5.6 Subpasta sem `view` é podada com a descendência.
- [x] 5.7 Auditoria: N arquivos incluídos ⇒ N eventos `download`; arquivo omitido
  ⇒ nenhum evento.
- [x] 5.8 Limite excedido ⇒ recusa, **zero** URLs assinadas e **zero** eventos.
  Um caso por teto (contagem e bytes), verificando que as mensagens são
  distinguíveis.
- [x] 5.9 Itens na lixeira nunca entram, inclusive para admin da unidade.
- [x] 5.10 Isolamento: pasta de outra unidade negada; `global_admin` não obtém
  conteúdo de outra unidade (trava do bypass).

## 6. Testes (Web)

- [x] 6.1 Aviso de recorte parcial aparece quando `allowedFiles < totalFiles`.
- [x] 6.2 `allowedFiles === 0` mostra mensagem e não gera arquivo.
- [x] 6.3 Cancelamento interrompe a operação.
- [x] 6.4 Recusa por limite exibe a orientação da API.

## 7. Infraestrutura e paridade

- [x] 7.1 **(infra/Terraform)** Confirmar que `cors_allowed_origins` do bucket já
  cobre o `GET` direto do navegador usado aqui — **nenhuma origem nova esperada**
  (design.md D6). Só ajustar se a compactação em streaming exigir header
  adicional.
- [x] 7.2 **(paridade de sandbox)** Confirmar que o `fake-gcs-server` responde às
  URLs assinadas de download em volume, sem ajuste no SessionStart hook.

## 8. Documentação

- [x] 8.1 `docs/manual_do_usuario.md`: **remover** o item "Download de uma pasta
  completa em arquivo compactado" da seção 10 e descrever o recurso na seção 5.5,
  incluindo o comportamento de recorte parcial e os limites.
- [x] 8.2 `docs/frontend_roadmap.md`: registrar a fatia.

## 9. Verificação

- [x] 9.1 `npm run lint && npm run build && npm run test` na raiz.
- [x] 9.2 Exercício manual: pasta com subpastas e permissões mistas entre duas
  pessoas, conferindo pacote, aviso de recorte e eventos de auditoria.
- [x] 9.3 Exercício manual do teto: pasta acima de 50 MB ⇒ recusa **acionável**
  (identifica o teto e orienta), com **zero** URLs assinadas e **zero** eventos de
  auditoria gravados.
