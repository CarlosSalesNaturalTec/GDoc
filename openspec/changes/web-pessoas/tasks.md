## 1. Camada de dados (schema + hooks)

- [ ] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `personResponseSchema` tipado
  como `z.ZodType<PersonResponse>` contra `@gdoc/shared` — `id`, `unitId`,
  `fullName: z.string().nullable()`, `email`, `phone|jobTitle|workArea|notes`
  todos `z.string().nullable()`, `role` como `z.enum` de `UserRole`, `status`
  como `z.enum` de `PersonStatus`, `createdAt` string — e `personListSchema =
  z.array(personResponseSchema)` — design.md D7
- [ ] 1.2 `apps/web/src/pessoas/queries.ts`: `useUsers()` como `useQuery`,
  `queryKey` `['users']`, chamando `GET /users` via `apiClient` e fazendo
  `.parse()` com `personListSchema` — design.md D7
- [ ] 1.3 No mesmo arquivo: `useCreatePerson()` (`useMutation` → `POST /users`
  com `CreatePersonRequest`) e `useUpdatePerson()` (`useMutation` → `PATCH
  /users/:id` com `UpdatePersonRequest`), ambos com `onSuccess`
  `invalidateQueries({ queryKey: ['users'] })`, espelhando
  `permissoes/queries.ts` — design.md D7

## 2. Formulário de criar/editar (`PessoaFormModal`)

- [ ] 2.1 `apps/web/src/pessoas/PessoaFormModal.tsx`: `Modal` + `Form` que recebe
  uma `PersonResponse` alvo opcional — `undefined` ⇒ modo **criar**, presente ⇒
  modo **editar** (pré-preenchido); título e rótulo do botão conforme o modo;
  `destroyOnClose` — design.md D3
- [ ] 2.2 Campos de perfil: nome (obrigatório), e-mail (obrigatório e **somente-
  leitura no modo editar**), telefone, função/cargo, área de trabalho, observação;
  **sem** campo de unidade (Opção A — não enviar `unitId`) — design.md D2/D3
- [ ] 2.3 Campo **senha**: presente e **obrigatório apenas no modo criar**;
  ausente no modo editar (o `PATCH` não aceita `password`) — spec: senha é exigida
  no cadastro / edição não expõe troca de senha; design.md D3
- [ ] 2.4 `Select` de **papel**: opções `collaborator`/`unit_admin` para todos e
  `global_admin` **só** quando `identity.role === 'global_admin'` (via
  `useSession`) — spec: unit_admin não vê a opção global_admin / global_admin vê;
  design.md D4
- [ ] 2.5 Submit despacha para `useCreatePerson` (criar) ou `useUpdatePerson`
  (editar); em sucesso fecha o modal e a listagem se atualiza pela invalidação —
  spec: cadastro válido / edição altera os dados; design.md D3/D7
- [ ] 2.6 Erro **409** no criar: exibir "e-mail já está em uso" associado ao campo
  de e-mail (`Form.setFields`/status de erro) **sem fechar** o modal nem limpar os
  demais campos — spec: e-mail duplicado; design.md D6
- [ ] 2.7 Erro **403**: aviso neutro de permissão insuficiente via
  `handlePermissionError`, sem distinguir subcasos nem expor dados — spec: 403
  fail-closed neutro; design.md D6

## 3. Página de pessoas (`PessoasPage`)

- [ ] 3.1 `apps/web/src/pessoas/PessoasPage.tsx`: consumir `useUsers()`; `Spin` em
  carregamento; `Table` com colunas **Nome** (`fullName ?? email`) · **E-mail** ·
  **Função** · **Papel** (`Tag`) · **Status** (`Tag` ativa/inativa) — spec:
  administrador lista as pessoas / pessoa sem nome cai no e-mail; design.md D1
- [ ] 3.2 Botão **"Nova pessoa"** que abre o `PessoaFormModal` em modo criar;
  estado local do modal (pessoa em edição / criar) na página — design.md D1/D3
- [ ] 3.3 Ações por-linha: **Editar** (abre o modal pré-preenchido) e
  **Desativar/Ativar** via `useUpdatePerson({ status })` com `Popconfirm` ao
  desativar; **sem** ação de exclusão — spec: edição / ativar-desativar sem
  exclusão; design.md D5
- [ ] 3.4 Guarda de auto-tiro-no-pé: na linha do próprio admin (`row.id ===
  identity.id`), **não** renderizar a ação de desativar nem permitir rebaixar o
  próprio papel — spec: administrador não desativa nem rebaixa a si mesmo;
  design.md D5

## 4. Roteamento

- [ ] 4.1 `apps/web/src/app/router.tsx`: trocar o `element` da rota
  `/admin/pessoas` de `<PlaceholderPage title="Gestão de pessoas" />` para
  `<PessoasPage />` — **sem** alterar a guarda `[unit_admin, global_admin]` já
  existente — spec: página restrita à administração; design.md D1

## 5. Testes (Vitest + Testing Library)

- [ ] 5.1 `apps/web/src/__tests__/pessoas.test.tsx`: reusar `renderApp` +
  `mock-fetch`; admin abre `/admin/pessoas`, a página chama `GET /users` e exibe
  as pessoas (nome/e-mail/função/papel/status); pessoa com `fullName` nulo mostra
  o e-mail — spec: administrador lista / pessoa sem nome cai no e-mail
- [ ] 5.2 Cadastro válido: preencher e confirmar chama `POST /users`, fecha o
  modal e a nova pessoa aparece (invalidação); confirmar sem senha é bloqueado —
  spec: cadastro válido / senha é exigida
- [ ] 5.3 E-mail duplicado: `POST /users` retornando 409 exibe "e-mail já está em
  uso" e mantém o modal aberto com os campos preenchidos — spec: e-mail duplicado
- [ ] 5.4 Edição: alterar dados e confirmar chama `PATCH /users/:id` e reflete na
  listagem; o formulário de edição não tem campo de senha e o e-mail é somente-
  leitura — spec: edição altera os dados / não expõe senha nem e-mail
- [ ] 5.5 Ativar/desativar: desativar chama `PATCH` com `status: 'disabled'` (após
  confirmação) e a linha vira inativa; reativar chama com `status: 'active'`; não
  há ação de exclusão — spec: desativar / reativar / não há exclusão permanente
- [ ] 5.6 Travas de UX: `unit_admin` não vê `global_admin` no seletor de papel e
  `global_admin` vê; na própria linha o admin não vê desativar/rebaixar; um 403
  exibe aviso neutro — spec: travas de papel / 403 fail-closed neutro

## 6. Verificação e documentação

- [ ] 6.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  passando (a fatia não toca `apps/api`/`packages/shared`)
- [ ] 6.2 `docs/frontend_roadmap.md`: marcar a **Fatia 9** como entregue (✅) e
  registrar as lacunas conhecidas (sem criação cross-unit / falta `GET /units`,
  sem redefinição de senha pela UI, sem paginação/filtro server-side, sem coluna
  de unidade legível, sem exclusão permanente)
