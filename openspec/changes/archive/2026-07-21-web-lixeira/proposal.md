## Why

Com o explorador (`web-navegacao`, Fatia 2) já entregue, o usuário **exclui**
arquivos e pastas — e cada exclusão manda o item para a lixeira (o backend nunca
apaga na hora). Mas **não há como ver o que foi excluído nem restaurá-lo** pela
SPA: se a pessoa se arrepende, o item fica invisível até ser expurgado pela
rotina diária das 3h. O backend do **Épico 6 (US 6.1) já está pronto e
arquivado** (`apps/api/src/routes/trash.ts`, `POST /files/:id/restore` e
`POST /folders/:id/restore`), expondo **`GET /trash`** (raízes de exclusão no
alcance do requisitante) e as duas rotas de restauração. Esta é a **Fatia 7**: a
tela de Lixeira da SPA, cobrindo o lado de frontend da **US 6.1** e do **RF #12**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (Épico 6 do PRD) sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Tela de Lixeira listando os itens excluídos (US 6.1 cenário 1)**: nova rota
  `/lixeira` (sob `RequireAuth`, **qualquer papel** — a persona da US 6.1 é o
  Colaborador) com item **"Lixeira"** no menu do shell. Uma `Table` chama
  `GET /trash` e exibe **apenas os itens retornados pelo servidor** — as raízes
  de exclusão no alcance do requisitante (próprias, com grant `delete`, ou toda
  a unidade se admin). Colunas: **nome, tipo** (arquivo/pasta), **data de
  exclusão** e **dias restantes**. A SPA NÃO infere alcance nem calcula quem
  pode restaurar.
- **Tag de dias restantes por urgência**: computada no cliente a partir de
  `expiresAt` — **≤3 dias vermelho**, ≤7 dias laranja/aviso, senão neutro. Só
  formatação; o vencimento em si é do servidor.
- **Restaurar por linha (US 6.1 cenário 1)**: ação **"Restaurar"** com
  `Popconfirm` que **despacha por `type`** — `POST /files/:id/restore` ou
  `POST /folders/:id/restore`. Sucesso remove o item da lixeira e o faz reaparecer
  no explorador.
- **Aviso de redirecionamento à raiz (só arquivo)**: quando a restauração de um
  **arquivo** retorna `redirectedToRoot: true` (a pasta de origem não existe
  mais), a SPA exibe mensagem distinta — "a pasta de origem não existe mais;
  restaurado na raiz" — em vez de "restaurado ao local de origem". Pasta **nunca**
  muda de local, então sempre exibe "restaurado ao local de origem".
- **Invalidação cruzada**: restaurar invalida a query da lixeira **e** as
  listagens de `web-navegacao` (`folder-contents`), para o item reaparecer no
  explorador sem recarregar a página — o mesmo padrão de invalidação que o upload
  já usa.
- **403 fail-closed**: se a restauração retorna 403 (item já expurgado, deixou de
  ser raiz, ou permissão perdida entre listar e clicar), a SPA exibe **aviso de
  permissão insuficiente** e recarrega a lista — herda o `handlePermissionError`
  já provado nas fatias anteriores.
- **Estado vazio**: `Empty` quando a lixeira não tem item algum.
- **Camada de dados**: novo schema Zod `trashListResponseSchema` espelhando
  `TrashListResponse` de `@gdoc/shared`, e hooks TanStack Query `useTrash()`,
  `useRestoreFile()`, `useRestoreFolder()` em `lixeira/queries.ts`, sobre o
  `apiClient`.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Esvaziar lixeira / exclusão permanente pela UI**: o expurgo é **só** a rotina
  diária de servidor (Cloud Run Job às 3h, retenção 30 dias, US 6.1 cenário 2);
  não há endpoint de exclusão permanente sob demanda e esta fatia **não** cria um.
  A UI oferece só restaurar — o vencimento acontece sozinho.
- **Preview/download de item na lixeira**: itens excluídos não são visualizáveis
  nem baixáveis (o backend só os expõe como raízes de exclusão restauráveis); a
  tela mostra metadados + restaurar, sem reusar `PreviewModal`/`useDownloadFile`.
- **Coluna "quem excluiu"**: `TrashEntryResponse` **não** carrega `deleted_by`;
  a tela mostra nome, tipo, data de exclusão e dias restantes. Entra se um campo
  de autor da exclusão for adicionado ao DTO no futuro — paralelo à lacuna de
  nome de dono da Fatia 5.
- **Auditoria** (Fatia 8), **pessoas** (Fatia 9), **painel** (Fatia 10): cada uma
  é change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta fatia
  só os consome.

## Capabilities

### New Capabilities
- `web-lixeira`: a tela de Lixeira da SPA — lista os itens excluídos no alcance
  do requisitante via `GET /trash` (nome, tipo, data de exclusão e Tag de dias
  restantes por urgência), com restauração por linha que despacha por tipo para
  `POST /files/:id/restore` ou `POST /folders/:id/restore`, aviso distinto quando
  um arquivo volta à raiz (`redirectedToRoot`), invalidação cruzada com o
  explorador, 403 fail-closed e estado vazio. Cobre o lado de frontend da
  **US 6.1** (cenário 1) e do **RF #12**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona uma tela de frontend sobre endpoints já existentes. -->

## Impact

- **Novo código** (`apps/web`): tela de lixeira (`lixeira/LixeiraPage.tsx`) com a
  `Table` e a ação de restaurar; hooks TanStack Query `useTrash`,
  `useRestoreFile`, `useRestoreFolder` (`lixeira/queries.ts`); nova rota `/lixeira`
  em `app/router.tsx` e novo item de menu em `shell/AppShell.tsx`.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novo
  `trashListResponseSchema` amarrado a `TrashListResponse` de `@gdoc/shared`
  (`z.ZodType<T>`); `fileRestoreResponseSchema` mínimo para ler `redirectedToRoot`.
- **Reuso**: `formatDate` de `navegacao/format.ts`, a chave `FOLDER_CONTENTS_KEY`
  de `navegacao/queries.ts` (invalidação cruzada), o padrão
  `handlePermissionError`, `apiClient`, `renderApp` + `mock-fetch` dos testes.
- **Contratos** (`packages/shared`): **sem mudança** — `TrashListResponse`,
  `TrashEntryResponse`, `FileRestoreResponse`, `GrantResourceType` consumidos
  como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome `GET /trash`,
  `POST /files/:id/restore` e `POST /folders/:id/restore`, já arquivados.
- **Testes** (`apps/web`, Vitest + Testing Library): a lista mostra os itens de
  `GET /trash` com a Tag de dias restantes correta; restaurar arquivo despacha
  para `/files/:id/restore` e restaurar pasta para `/folders/:id/restore`;
  `redirectedToRoot` exibe a mensagem distinta; 403 exibe aviso e recarrega;
  lixeira vazia exibe `Empty`.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 7 como proposta/entregue.
