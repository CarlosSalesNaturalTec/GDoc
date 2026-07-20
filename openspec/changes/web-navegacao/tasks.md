## 1. Camada de dados (schemas + hooks)

- [ ] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `folderResponseSchema`,
  `fileSummaryResponseSchema` e `folderContentsResponseSchema`, cada um tipado
  como `z.ZodType<T>` contra o DTO de `@gdoc/shared` (padrão do
  `authenticatedIdentitySchema`) — design.md D8
- [ ] 1.2 Hook `useFolderContents(folderId: string | null)` (TanStack Query,
  chave `['folder-contents', folderId ?? 'root']`) que chama
  `GET /folders/root/contents` ou `GET /folders/:id/contents` via `apiClient` e
  faz `.parse()` da resposta — design.md D5
- [ ] 1.3 Mutations sobre `apiClient` (`createFolder`, `renameFile`,
  `deleteFile`, `deleteFolder`), cada uma invalidando `['folder-contents', ...]`
  da pasta corrente ao concluir — design.md D5

## 2. Rotas e navegação

- [ ] 2.1 `app/router.tsx`: adicionar `/pastas` e `/pastas/:folderId` dentro do
  `AppShell` (guarda de auth já herdada), apontando para a `ExplorerPage`;
  manter a `HomePage` no `/` — design.md D1
- [ ] 2.2 `shell/AppShell.tsx`: novo item "Arquivos" no `Menu` (ícone de pasta,
  `Link` para `/pastas`), com `selectedKeys` casando o prefixo `/pastas`

## 3. Explorador (US 2.1)

- [ ] 3.1 `navegacao/ExplorerPage.tsx`: lê `:folderId` (ou raiz), consome
  `useFolderContents`, exibe `Spin` no carregamento e trata erro de rede
- [ ] 3.2 `Breadcrumb`: nó "Arquivos" (→ `/pastas`) + itens de
  `FolderContentsResponse.breadcrumb` (→ `/pastas/:id`) + pasta corrente sem
  link — clique em nível anterior navega direto (US 2.1 cenário 1) — design.md D3
- [ ] 3.3 `Table` unificada: pastas antes de arquivos, colunas Tipo · Nome ·
  Tamanho · Data · Ações; linha de pasta navega via `Link` para `/pastas/:id`;
  exibe `status` do arquivo como `Tag` quando não-`active` — design.md D2
- [ ] 3.4 Renderizar apenas os itens retornados pela API (já filtrados por
  dono-ou-grant `view` no backend) — US 2.1 cenário 2

## 4. Gestão por item (US 2.2)

- [ ] 4.1 `navegacao/NewFolderModal.tsx`: `Modal` + `Form` (nome) → `createFolder`
  com o `parentId` da pasta corrente; botão "Nova pasta" no topo do explorador
- [ ] 4.2 `navegacao/RenameFileModal.tsx`: `Modal` + `Form` (novo nome) →
  `renameFile`; ação disponível **apenas para arquivos** (renomear pasta fora de
  escopo — design.md D7)
- [ ] 4.3 Ações de exclusão via `Dropdown` por item com `Popconfirm`: `deleteFile`
  (arquivo) e `deleteFolder` (pasta); ao excluir a pasta corrente de dentro dela,
  navegar ao pai (ou `/pastas`) antes de invalidar — design.md D5
- [ ] 4.4 Tratamento de **403** em qualquer mutation → `message.error` de
  **permissão insuficiente**, sem aplicar a mudança (US 2.2 cenário 2) —
  design.md D4

## 5. Deep-link bloqueado (US 4.2)

- [ ] 5.1 `ExplorerPage`: distinguir `ApiError.status === 403` do
  `GET /folders/:id/contents` e renderizar `Result status="403"` (sem conteúdo);
  401 permanece no tratamento central da Fatia 1 → `/login` — design.md D6

## 6. Testes (Vitest + Testing Library)

- [ ] 6.1 Reusar `renderApp(['/pastas'])` + `mock-fetch`; helpers de resposta
  para `folder contents` (raiz e pasta com breadcrumb)
- [ ] 6.2 Navegação em subpasta atualiza conteúdo e trilha; clique em nível
  anterior da trilha volta (US 2.1 cenário 1)
- [ ] 6.3 Item sem permissão não aparece (a API não o retorna) — US 2.1 cenário 2
- [ ] 6.4 Criar pasta (`POST /folders` com `parentId` correto) e renomear
  arquivo (`PATCH /files/:id`) refletem na listagem — US 2.2 cenário 1
- [ ] 6.5 Excluir arquivo e excluir pasta (com confirmação) removem o item da
  listagem
- [ ] 6.6 403 em ação de gestão exibe aviso de permissão insuficiente — US 2.2
  cenário 2
- [ ] 6.7 Deep-link a pasta que responde 403 mostra bloqueio, sem conteúdo —
  US 4.2 cenário 1

## 7. Documentação e verificação

- [ ] 7.1 `docs/frontend_roadmap.md`: marcar Fatia 2 (`web-navegacao`) como
  proposta/entregue e registrar a **lacuna de renomear pasta** (depende de
  `PATCH /folders/:id` — change de backend futura) — design.md D7
- [ ] 7.2 Rodar `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  verdes; `openspec validate web-navegacao`
