## Why

Com o shell + autenticação da SPA já entregues (change `web-shell-e-auth`,
Fatia 1 do `docs/frontend_roadmap.md`), o usuário autenticado chega ao layout
mas ainda não tem **nenhuma forma de ver seus arquivos e pastas**: o `/` é uma
`HomePage` de boas-vindas e não há tela de conteúdo. O backend do Épico 2 já
está completo e arquivado (`apps/api/src/routes/folders.ts`,
`routes/files.ts`), expondo listagem por pasta com trilha, criação/exclusão de
pasta e renomear/excluir arquivo — tudo checado no servidor com visibilidade
por dono-ou-grant e RLS por unidade. Esta é a **Fatia 2**: o explorador
estilo file-manager que consome esses endpoints e desbloqueia as fatias 3–8
(visualização, upload, busca, permissões, lixeira, auditoria), que abrem a
partir dele.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (Épico 2 / US 2.1, US 2.2, US 4.2 do PRD) sem tocar em `apps/api` nem
em `packages/shared`.

## What Changes

- **Nova rota de explorador** dentro do `AppShell` (mantendo a `HomePage`
  atual como landing): `/pastas` lista a raiz da unidade
  (`GET /folders/root/contents`) e `/pastas/:folderId` lista uma pasta com sua
  **trilha de navegação** (`GET /folders/:id/contents`). Novo item "Arquivos"
  no `Menu` do shell.
- **Explorador (US 2.1)**: `Breadcrumb` a partir de `FolderContentsResponse.breadcrumb`
  (clique volta a qualquer nível anterior), e uma `Table` unificando subpastas
  e arquivos (tipo, nome, tamanho, data). A listagem exibe **apenas o que é
  próprio ou liberado** — o backend já filtra por dono-ou-grant `view`, então o
  cliente só renderiza o que recebe (US 2.1 cenário 2).
- **Gestão por item (US 2.2)**: criar subpasta (`POST /folders`), excluir pasta
  (`DELETE /folders/:id`, cascata → lixeira), renomear arquivo
  (`PATCH /files/:id`) e excluir arquivo (`DELETE /files/:id`), via `Dropdown` +
  `Modal`/`Popconfirm`. Cada mutation **invalida** a query da pasta corrente.
- **Ações conforme permissão via fail-closed 403**: como o
  `FileSummaryResponse`/`FolderResponse` não carrega os verbos concedidos, o
  cliente oferece as ações e trata o **403** do servidor exibindo *"permissão
  insuficiente"* (US 2.2 cenário 2) — sem inferir permissão no cliente.
- **Deep-link bloqueado (US 4.2)**: abrir `/pastas/:folderId` de uma pasta sem
  permissão recebe **403** da API e mostra um `Result status="403"` — nenhum
  conteúdo é exibido.
- **Camada de dados**: novos schemas Zod espelhando `FolderContentsResponse`,
  `FolderResponse` e `FileSummaryResponse` de `@gdoc/shared`, e hooks TanStack
  Query (`useFolderContents` + mutations) sobre o `apiClient` existente.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` da
  Fatia 1, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Renomear pasta**: o backend **não expõe** `PATCH /folders/:id` (só
  `POST`/`GET contents`/`DELETE`/`restore` em `routes/folders.ts`). Renomear
  pasta fica **fora desta fatia** e depende de uma change de backend futura que
  adicione o endpoint (dono-ou-grant `rename` + auditoria), quando então o
  frontend ganha a ação correspondente.
- **Visualização/preview e download** de arquivo (Fatia 3), **upload** (Fatia
  4), **busca** (Fatia 5), **permissões** (Fatia 6), **lixeira/restauração**
  (Fatia 7) e **auditoria** (Fatia 8): cada uma é change própria no roadmap e
  abre a partir deste explorador.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta
  fatia só os consome.

## Capabilities

### New Capabilities
- `web-navegacao`: o explorador de pastas/arquivos da SPA — navegação por
  pastas aninhadas com trilha, listagem que respeita a visibilidade por
  dono-ou-grant, e as ações de gestão por item (criar/excluir pasta, renomear/
  excluir arquivo) conforme permissão, com deep-link a pasta sem acesso
  bloqueado. Cobre o lado de frontend das **US 2.1**, **US 2.2** (exceto
  renomear pasta) e **US 4.2** (bloqueio por link direto a pasta).

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona telas de frontend sobre endpoints já existentes. -->

## Impact

- **Novo código** (`apps/web`): rotas `/pastas` e `/pastas/:folderId` no
  roteador; página do explorador e componentes (breadcrumb, tabela, modal de
  nova pasta, modal de renomear arquivo); hooks TanStack Query; item "Arquivos"
  no `Menu` do `AppShell`.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novos schemas Zod
  amarrados aos DTOs de `@gdoc/shared` (`z.ZodType<T>`), sem alterar os
  contratos.
- **Contratos** (`packages/shared`): **sem mudança** — consumidos como estão
  (`FolderContentsResponse`, `FolderResponse`, `FileSummaryResponse`,
  `CreateFolderRequest`, `RenameFileRequest`).
- **API** (`apps/api`): **sem mudança** — a fatia só consome os endpoints do
  Épico 2 já arquivados.
- **Testes** (`apps/web`, Vitest + Testing Library): navegação e atualização da
  trilha; item sem permissão não aparece; criar pasta; renomear arquivo;
  excluir arquivo e pasta; 403 em ação sem permissão mostra aviso; deep-link a
  pasta sem acesso mostra bloqueio.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 2 como proposta/entregue
  e registrar a lacuna de renomear pasta.
