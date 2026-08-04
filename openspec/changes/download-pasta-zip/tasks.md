# Tasks — download-pasta-zip

## 1. DTOs compartilhados (packages/shared)

- [ ] 1.1 Criar `FolderDownloadManifestEntry` (`relativePath`, `fileName`,
  `sizeBytes`, `url`, `expiresAt`) e `FolderDownloadManifestResponse`
  (`entries`, `totalFiles`, `allowedFiles`, `totalBytes`), exportados no
  `index.ts`.
- [ ] 1.2 `npm run build --workspace packages/shared`.

## 2. Travessia da subárvore (lib)

- [ ] 2.1 Em `apps/api/src/lib/folder-tree.ts`, adicionar travessia da subárvore
  **viva** de uma pasta (`deleted_at IS NULL`), produzindo, para cada arquivo, o
  **caminho relativo** à pasta pedida — inverso de `normalizeRelativePath`
  (design.md D7).
- [ ] 2.2 A travessia SHALL podar subpastas sem acesso de `view` do solicitante,
  junto com toda a descendência (design.md D2).
- [ ] 2.3 Não materializar entradas para pastas cujo conteúdo foi integralmente
  filtrado (design.md D7).
- [ ] 2.4 Teste unitário da travessia isolado da rota (hierarquia, poda,
  caminhos relativos, exclusão de itens da lixeira).

## 3. API — rota de manifesto

- [ ] 3.1 `apps/api/src/config.ts`: limites `DOWNLOAD_MANIFEST_MAX_FILES` e
  `DOWNLOAD_MANIFEST_MAX_BYTES` (design.md D5), com defaults conservadores.
- [ ] 3.2 `apps/api/src/routes/folders.ts`: `POST /folders/:id/download-manifest`.
  Ordem obrigatória: **checar `view` na pasta → percorrer e filtrar por
  `download` item a item → validar limites → emitir URLs assinadas → auditar**
  (design.md D5 — nada assinado nem auditado em pedido recusado).
- [ ] 3.3 Resolver `Permission.DOWNLOAD` por arquivo com `hasAccess` — **sem**
  atalho, sem herança, reusando a resolução existente sem alterá-la.
- [ ] 3.4 Emitir URLs com `ports.storage.getDownloadUrl`, no **mesmo TTL** de
  download já praticado (design.md D6).
- [ ] 3.5 Gravar um evento `download` por arquivo incluído, em lote na mesma
  transação (design.md D4).
- [ ] 3.6 Devolver `totalFiles`/`allowedFiles` sempre, inclusive quando
  `allowedFiles === 0` (design.md D3).
- [ ] 3.7 Recusa por limite: erro **específico** identificando o teto atingido.
- [ ] 3.8 Confirmar que nenhum prefixo de topo novo é criado — a rota fica sob
  `/folders`, já presente nas três listas.

## 4. Web — ação de baixar pasta

- [ ] 4.1 Ação "Baixar pasta" na linha da pasta e no cabeçalho da pasta aberta
  (`apps/web/src/navegacao/`).
- [ ] 4.2 Módulo de compactação **em streaming** no cliente, sem reter todos os
  arquivos em memória simultaneamente.
- [ ] 4.3 Progresso por arquivo e agregado, com **cancelamento**.
- [ ] 4.4 Quando `allowedFiles < totalFiles`, exibir aviso de recorte parcial
  antes de iniciar ("N de M itens disponíveis para você").
- [ ] 4.5 Quando `allowedFiles === 0`, exibir mensagem explícita e **não** gerar
  arquivo (design.md D3).
- [ ] 4.6 Tratar a recusa por limite com a mensagem específica da API, orientando
  a baixar subpastas.
- [ ] 4.7 Nome do arquivo gerado a partir do nome da pasta.

## 5. Testes (API)

- [ ] 5.1 `download-pasta.test.ts`: hierarquia refletida nos caminhos relativos.
- [ ] 5.2 Recorte por permissão item a item (US 3.3 cenário 2).
- [ ] 5.3 **Sem herança**: grant apenas na pasta ⇒ `allowedFiles === 0`.
- [ ] 5.4 Admin da unidade obtém a subárvore da própria unidade sem grant.
- [ ] 5.5 `view` ausente na pasta de entrada ⇒ `403` sem vazar existência.
- [ ] 5.6 Subpasta sem `view` é podada com a descendência.
- [ ] 5.7 Auditoria: N arquivos incluídos ⇒ N eventos `download`; arquivo omitido
  ⇒ nenhum evento.
- [ ] 5.8 Limite excedido ⇒ recusa, **zero** URLs assinadas e **zero** eventos.
- [ ] 5.9 Itens na lixeira nunca entram, inclusive para admin da unidade.
- [ ] 5.10 Isolamento: pasta de outra unidade negada; `global_admin` não obtém
  conteúdo de outra unidade (trava do bypass).

## 6. Testes (Web)

- [ ] 6.1 Aviso de recorte parcial aparece quando `allowedFiles < totalFiles`.
- [ ] 6.2 `allowedFiles === 0` mostra mensagem e não gera arquivo.
- [ ] 6.3 Cancelamento interrompe a operação.
- [ ] 6.4 Recusa por limite exibe a orientação da API.

## 7. Infraestrutura e paridade

- [ ] 7.1 **(infra/Terraform)** Confirmar que `cors_allowed_origins` do bucket já
  cobre o `GET` direto do navegador usado aqui — **nenhuma origem nova esperada**
  (design.md D6). Só ajustar se a compactação em streaming exigir header
  adicional.
- [ ] 7.2 **(paridade de sandbox)** Confirmar que o `fake-gcs-server` responde às
  URLs assinadas de download em volume, sem ajuste no SessionStart hook.

## 8. Documentação

- [ ] 8.1 `docs/manual_do_usuario.md`: **remover** o item "Download de uma pasta
  completa em arquivo compactado" da seção 10 e descrever o recurso na seção 5.5,
  incluindo o comportamento de recorte parcial e os limites.
- [ ] 8.2 `docs/frontend_roadmap.md`: registrar a fatia.

## 9. Verificação

- [ ] 9.1 `npm run lint && npm run build && npm run test` na raiz.
- [ ] 9.2 Exercício manual: pasta com subpastas e permissões mistas entre duas
  pessoas, conferindo pacote, aviso de recorte e eventos de auditoria.
- [ ] 9.3 Revisar os valores default dos limites de D5 com o cliente antes do
  deploy (ver Open Questions do design).
