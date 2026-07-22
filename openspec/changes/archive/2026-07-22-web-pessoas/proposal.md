## Why

O backend de gestão de pessoas (**Épico 1, US 1.1**) já está pronto e arquivado
(`apps/api/src/routes/users.ts`), expondo **`POST /users`**, **`GET /users`** e
**`PATCH /users/:id`** — todos admin-only e escopados por RLS (`unit_admin` só
enxerga/altera a própria unidade; `global_admin` tem bypass para agregados, mas as
travas de papel valem para todos). Mas **não há como administrar pessoas pela
SPA**: a rota `/admin/pessoas` existe apenas como `PlaceholderPage`, e sem ela um
administrador não consegue cadastrar quem vai acessar o sistema (não há
autocadastro — contas nascem só pela administração, RF #1/#2/#3). Esta é a **Fatia
9** do roadmap de frontend: o CRUD de pessoas na SPA, cobrindo o lado de frontend
da **US 1.1**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já pronto
sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Página `/admin/pessoas` real (US 1.1)**: substitui o `PlaceholderPage` por uma
  `PessoasPage` com a **`Table`** de pessoas (`GET /users`) — nome, e-mail, função,
  área, papel e status — e um botão **"Nova pessoa"**. A rota **já existe** no
  router sob a guarda `[unit_admin, global_admin]` (design.md D6 da Fatia 1) e o
  item de menu "Pessoas" **já aparece** no shell só para admins; esta fatia só
  troca o conteúdo da rota. Colaborador nunca chega aqui (guarda de papel).
- **Cadastro de pessoa (US 1.1 cenário 1)**: `PessoaFormModal` em modo criar chama
  **`POST /users`** com nome, e-mail, **senha inicial**, telefone, função, área,
  observação e papel. A pessoa passa a poder fazer login com as credenciais
  definidas. **E-mail duplicado (US 1.1 cenário 2)**: um `409` do servidor vira
  aviso claro **"e-mail já está em uso"** no formulário, sem perder o preenchido.
- **Edição de pessoa**: o mesmo modal em modo editar chama **`PATCH /users/:id`**
  com os campos de perfil + papel + status. **Não** troca senha (o endpoint não
  aceita `password`).
- **Ativar/Desativar** (não excluir): a ativação/desativação é um
  **`PATCH status`** (`active`/`disabled`), com `Popconfirm`. Desativar preserva
  arquivos e auditoria e apenas bloqueia o login — corta o acesso na hora, já que
  `attachTenantContext` relê o status a cada requisição (US 1.2 cenário 3). **Não
  há `DELETE /users`.**
- **Espelhar as travas de papel do servidor (UX, não defesa)**: `unit_admin` não
  vê a opção `global_admin` no seletor de papel (o servidor recusa com 403 de
  qualquer forma); a criação é **sempre na unidade do próprio admin** — sem
  seletor de unidade (ver "Fora de escopo"). E **guarda de auto-tiro-no-pé**: o
  administrador não vê as ações de rebaixar o próprio papel nem de se desativar na
  própria linha.
- **Camada de dados**: novo schema Zod **`personResponseSchema`** espelhando
  `PersonResponse` de `@gdoc/shared` (hoje só existe o mínimo `authorPersonSchema`
  da Fatia 5), e hooks TanStack Query **`useUsers` / `useCreatePerson` /
  `useUpdatePerson`** em `pessoas/queries.ts`, sobre o `apiClient`, com
  invalidação da listagem no sucesso.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Sem criação cross-unit pelo `global_admin`**: o `POST /users` aceita `unitId`,
  mas **não existe `GET /units`** para popular um seletor de unidade (unidades só
  nascem por migration/seed). Decisão (Opção A, design.md D2): a criação é sempre
  na unidade do admin logado. A criação de pessoa em outra unidade pelo
  `global_admin` fica para uma change de backend futura que adicione `GET /units` +
  o seletor correspondente.
- **Sem redefinição de senha pela UI**: `PATCH /users/:id` não aceita `password`;
  só a **senha inicial** (no cadastro) é definida pela SPA. Redefinir senha entra
  quando o backend expuser um endpoint próprio.
- **Sem paginação/filtro server-side**: `GET /users` devolve todas as pessoas do
  alcance sem query params — a `Table` pagina/ordena/filtra no cliente, como a
  lixeira e a auditoria. Paginação de servidor entra quando o backend a expuser.
- **Sem coluna de unidade legível**: `global_admin` vê pessoas de várias unidades,
  mas sem `GET /units` só haveria o UUID cru — a coluna de unidade fica de fora até
  existir o endpoint de unidades.
- **Painel gerencial** (Fatia 10): change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta fatia
  só os consome.

## Capabilities

### New Capabilities
- `web-pessoas`: a gestão de pessoas pela administração na SPA — página
  `/admin/pessoas` (só `unit_admin`/`global_admin`) com a `Table` de pessoas
  (`GET /users`), cadastro (`POST /users`) com senha inicial e aviso de e-mail
  duplicado, edição de perfil/papel/status (`PATCH /users/:id`), ativar/desativar
  via `PATCH status` (sem exclusão), espelhando as travas de papel do servidor
  (`unit_admin` não cria/eleva `global_admin`; sem auto-rebaixamento/auto-
  desativação) e criando sempre na unidade do admin (Opção A). Cobre o lado de
  frontend da **US 1.1** e do **RF #1/#2/#3**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona a administração de frontend sobre endpoints já
     existentes. -->

## Impact

- **Novo código** (`apps/web`): `pessoas/PessoasPage.tsx` (a `Table` de pessoas +
  botão "Nova pessoa" + ações por-linha), `pessoas/PessoaFormModal.tsx` (o `Form`
  de criar/editar) e `pessoas/queries.ts` (`useUsers`/`useCreatePerson`/
  `useUpdatePerson`).
- **Router** (`apps/web/src/app/router.tsx`): a rota `/admin/pessoas` troca o
  `PlaceholderPage` pela `PessoasPage` — **sem** mudança de guarda (já é
  `[unit_admin, global_admin]`).
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novo `personResponseSchema`
  (e `personListSchema`) amarrado a `PersonResponse` de `@gdoc/shared`
  (`z.ZodType<T>`).
- **Reuso**: o `useSession` (para `identity.id`/`identity.role` das travas de UX),
  o `apiClient`, o padrão de mutation com invalidação de `permissoes/queries.ts`,
  o `handlePermissionError`/`message` das fatias anteriores, `renderApp` +
  `mock-fetch` dos testes.
- **Contratos** (`packages/shared`): **sem mudança** — `PersonResponse`,
  `CreatePersonRequest`, `UpdatePersonRequest`, `PersonStatus`, `UserRole`
  consumidos como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome `POST /users`,
  `GET /users`, `PATCH /users/:id`, já arquivados.
- **Testes** (`apps/web`, Vitest + Testing Library): admin lista as pessoas do seu
  alcance; cadastro válido cria e some o modal; e-mail duplicado (409) exibe aviso
  sem fechar o modal; edição altera perfil/papel/status; desativar/ativar via
  `PATCH status`; `unit_admin` não vê a opção `global_admin`; o admin não vê
  rebaixar/desativar na própria linha; 403 fail-closed neutro.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 9 como proposta/entregue.
