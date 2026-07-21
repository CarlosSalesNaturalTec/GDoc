## 1. Camada de dados (schemas + hooks)

- [ ] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `trashListResponseSchema`
  tipado como `z.ZodType<TrashListResponse>` contra `@gdoc/shared`, com o item
  usando o enum `GrantResourceType` para `type` — design.md D7
- [ ] 1.2 `apps/web/src/lib/schemas.ts`: adicionar `fileRestoreResponseSchema`
  validando os campos usados de `FileRestoreResponse` (reuso de
  `fileSummaryResponseSchema` + `redirectedToRoot`) — design.md D7
- [ ] 1.3 `apps/web/src/lixeira/queries.ts`: hook `useTrash()` como `useQuery`
  com `queryKey` `['trash']`, chamando `GET /trash` via `apiClient` e fazendo
  `.parse()` da resposta — design.md D7
- [ ] 1.4 `apps/web/src/lixeira/queries.ts`: hooks `useRestoreFile()` e
  `useRestoreFolder()` (mutations) chamando `POST /files/:id/restore` e
  `POST /folders/:id/restore`; ambos invalidam `['trash']` **e**
  `[FOLDER_CONTENTS_KEY]` (reuso de `navegacao/queries.ts`) no `onSuccess` —
  design.md D2/D5

## 2. Tela de lixeira (`LixeiraPage`)

- [ ] 2.1 `apps/web/src/lixeira/LixeiraPage.tsx`: `Table` de `useTrash()` com
  colunas **Nome · Tipo · Data de exclusão · Dias restantes · Ações**, reusando
  `formatDate` de `navegacao/format.ts`; `Empty` quando não há itens; `Spin` em
  carregamento — spec: tela de lixeira lista os itens; design.md D1
- [ ] 2.2 Coluna **Dias restantes**: `Tag` computado de `expiresAt`
  (`ceil((expiresAt - agora)/dia)`), cor por faixa — **≤3 vermelho**, ≤7
  laranja/aviso, senão neutro — spec: item próximo do vencimento em vermelho;
  design.md D4
- [ ] 2.3 Ação **"Restaurar"** por linha com `Popconfirm`, despachando por
  `entry.type` para `useRestoreFile`/`useRestoreFolder` — spec: restaurar item;
  design.md D2
- [ ] 2.4 Mensagens de sucesso: arquivo com `redirectedToRoot: false` →
  "restaurado ao local de origem"; `true` → aviso distinto de raiz da unidade;
  pasta → sempre "restaurado ao local de origem" — spec: aviso quando o arquivo
  volta à raiz; design.md D3
- [ ] 2.5 403 na restauração: `handlePermissionError` (`ApiError` status 403) →
  `message.error` de permissão insuficiente + `invalidateQueries(['trash'])` —
  spec: 403 na restauração; design.md D6

## 3. Rota e navegação

- [ ] 3.1 `apps/web/src/app/router.tsx`: nova rota `/lixeira` sob `RequireAuth`
  (qualquer papel), dentro do `AppShell` — design.md D1
- [ ] 3.2 `apps/web/src/shell/AppShell.tsx`: item de menu **"Lixeira"** (ícone de
  lixeira, ex.: `DeleteOutlined`) visível a qualquer papel; ajustar `selectedKey`
  para destacar em `/lixeira` — design.md D1

## 4. Testes (Vitest + Testing Library)

- [ ] 4.1 `apps/web/src/__tests__/lixeira.test.tsx`: reusar `renderApp` +
  `mock-fetch`; a lista mostra os itens de `GET /trash` com a Tag de dias
  restantes correta (incluindo o caso ≤3 dias em vermelho) — spec: tela de
  lixeira lista os itens
- [ ] 4.2 Restaurar arquivo despacha para `POST /files/:id/restore` e restaurar
  pasta para `POST /folders/:id/restore`; o item some da lista após sucesso —
  spec: restaurar item
- [ ] 4.3 `redirectedToRoot: true` exibe a mensagem distinta de raiz; `false` (e
  pasta) exibe "local de origem" — spec: aviso quando o arquivo volta à raiz
- [ ] 4.4 403 na restauração exibe aviso de permissão insuficiente e recarrega a
  lista; lixeira vazia exibe `Empty` — spec: 403 na restauração / lixeira vazia

## 5. Verificação e documentação

- [ ] 5.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  passando (a fatia não toca `apps/api`/`packages/shared`)
- [ ] 5.2 `docs/frontend_roadmap.md`: marcar a **Fatia 7** como entregue (✅) e
  registrar as lacunas conhecidas (sem exclusão permanente na UI, sem
  preview/download na lixeira, sem coluna "quem excluiu")
