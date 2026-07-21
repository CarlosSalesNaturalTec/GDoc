## Why

Com o explorador (`web-navegacao`, Fatia 2) já entregue, o usuário navega,
visualiza, baixa e envia arquivos — mas **não há como um administrador gerir
quem acessa o quê pela SPA**. Toda concessão granular hoje só existe via API. O
backend do **Épico 4 (US 4.1) já está pronto e arquivado**
(`apps/api/src/routes/grants.ts`, spec `permissoes-granulares`), expondo três
rotas **admin-only** sobre `grants` — **`POST /grants`** (conceder um ou mais
verbos a uma pessoa sobre um recurso, idempotente), **`GET /grants?resourceType=&resourceId=`**
(listar as concessões vigentes de **um** recurso) e **`DELETE /grants/:id`**
(revogar um verbo). Esta é a **Fatia 6**: o diálogo de gestão de permissões da
SPA, cobrindo o lado de frontend da **US 4.1** e dos **RF #7/#8**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (Épico 4 do PRD) sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Ação "Permissões" no explorador, só para admin (US 4.1)**: cada linha do
  explorador (pasta ou arquivo) ganha uma ação **"Permissões"** (ícone de
  cadeado) ao lado de renomear/excluir, renderizada **somente para
  `unit_admin`/`global_admin`** — mesmo padrão de guarda por papel das Fatias
  2–5 (`useSession().role`). O colaborador não vê a ação. Abrir a ação abre o
  `PermissoesModal` para aquele recurso (`resourceType` = `folder`/`file`,
  `resourceId` = id da linha).
- **Concessão por pessoa e verbos numa só operação (US 4.1 cenário 1 e 3)**:
  dentro do modal, um `Select` de **pessoa** (populado por **`GET /users`**,
  reusando o hook admin-only da Fatia 5) e um `Checkbox.Group` de **verbos**
  (`view`/`download`/`upload`/`rename`/`delete`, do enum `Permission` de
  `@gdoc/shared`, com rótulos pt-BR) disparam **uma** chamada a `POST /grants`
  com todos os verbos marcados. A operação é **idempotente** no servidor:
  reconceder um verbo já existente não duplica nem falha.
- **Visão das concessões vigentes (US 4.1)**: o modal lista as concessões
  atuais daquele recurso via `GET /grants?resourceType=&resourceId=`, agrupadas
  por pessoa, mostrando **pessoa · verbo** com o nome da pessoa resolvido pelo
  mesmo `GET /users`. Cada linha tem um botão **"Revogar"** que chama
  `DELETE /grants/:id` — remove **apenas aquele verbo**, preservando os demais.
- **Aviso de não-herança (invariante de segurança)**: o modal exibe um texto
  explícito de que conceder um verbo sobre uma **pasta** libera **só a pasta**,
  não o conteúdo interno (US 4.1 cenário 2). É reflexo de UI de uma regra de
  segurança forte do sistema (`access.ts`, sem herança) — para o admin não se
  enganar sobre o alcance da concessão.
- **Camada de dados**: novos schemas Zod `grantResponseSchema`/
  `grantListResponseSchema` espelhando `GrantResponse`/`GrantListResponse` de
  `@gdoc/shared`; hooks TanStack Query `useGrants(resourceType, resourceId)`
  (leitura) e mutations `useCreateGrant`/`useRevokeGrant` que **invalidam** a
  lista do recurso ao concluir, sobre o `apiClient`.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Prazo de expiração da concessão**: o roadmap antecipou "expiração opcional",
  mas o **backend não a suporta** — `CreateGrantRequest` não tem `expiresAt`, a
  tabela `grants` não tem coluna de expiração e a US 4.1 não a descreve nos
  cenários. Fica registrada como **lacuna conhecida**: precisa de uma change de
  backend futura (coluna `expires_at`, filtro na resolução de `access.ts`,
  aviso de expiração via Job) antes de existir controle de prazo na SPA. Mesmo
  espírito da lacuna de "renomear pasta" (Fatia 2).
- **Concessão em lote sobre múltiplos arquivos selecionados**: a US 4.1 cenário
  1 fala em "arquivos selecionados" (plural), mas `POST /grants` é por **um**
  `resourceId`. Esta fatia entrega a gestão **por-item** (um recurso por vez);
  a multi-seleção na tabela do explorador com N chamadas fica para uma fatia
  futura (o backend já é idempotente e a suporta quando chegarmos lá).
- **Concessão a grupo**: a spec `permissoes-granulares` já marca "por grupo" como
  fatia futura de backend (design.md D7 do Épico 4). A SPA concede **por pessoa**.
- **Gestão centralizada de permissões (todas as concessões da unidade)**:
  `GET /grants` é sempre **por recurso**; não há endpoint de "todas as
  concessões". A gestão é sempre a partir de um item do explorador.
- **Lixeira** (Fatia 7), **auditoria** (Fatia 8), **pessoas** (Fatia 9),
  **painel** (Fatia 10): cada uma é change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta fatia
  só os consome.

## Capabilities

### New Capabilities
- `web-permissoes`: o diálogo de gestão de permissões granulares da SPA —
  ação "Permissões" por item do explorador (só admin), concessão por pessoa de
  um ou mais verbos numa operação idempotente sobre `POST /grants`, visão das
  concessões vigentes do recurso via `GET /grants` com revogação por verbo
  (`DELETE /grants/:id`), e o aviso explícito de não-herança em pasta. Sem
  expiração (lacuna de backend) e por-item (multi-seleção futura). Cobre o lado
  de frontend da **US 4.1** e dos **RF #7/#8**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona a UI de gestão sobre endpoints já existentes. -->

## Impact

- **Novo código** (`apps/web`): `PermissoesModal` (`permissoes/PermissoesModal.tsx`)
  com o formulário de concessão e a lista de vigentes; hooks
  `useGrants`/`useCreateGrant`/`useRevokeGrant` (`permissoes/queries.ts`);
  integração da ação "Permissões" na coluna de ações do `ExplorerPage`
  (condicionada a admin), reusando o hook de lista de pessoas admin-only.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novos
  `grantResponseSchema`/`grantListResponseSchema` amarrados aos DTOs de
  `@gdoc/shared` (`z.ZodType<T>`); reuso do schema de lista de pessoas
  (`GET /users`) já introduzido na Fatia 5.
- **Reuso**: hook de opções de pessoa (`useAuthorOptions`/equivalente) e schema
  de `GET /users` da `busca/`, `useSession` da `auth/`, `apiClient`, `renderApp`
  + `mock-fetch` dos testes; rótulos pt-BR dos verbos.
- **Contratos** (`packages/shared`): **sem mudança** — `Permission`,
  `GrantResourceType`, `CreateGrantRequest`, `GrantResponse`,
  `GrantListResponse` consumidos como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome `POST /grants`,
  `GET /grants` e `DELETE /grants/:id` (e `GET /users` para nomes de pessoa),
  todos já arquivados.
- **Testes** (`apps/web`, Vitest + Testing Library): a ação "Permissões" aparece
  para admin e não para colaborador; conceder só `view` chama `POST /grants` com
  o verbo certo e recarrega os vigentes; reconceder não quebra (idempotência);
  conceder múltiplos verbos manda o conjunto; revogar chama `DELETE /grants/:id`
  e remove só aquele verbo; o aviso de não-herança está visível.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 6 como proposta/entregue,
  registrando as lacunas de expiração e multi-seleção.
