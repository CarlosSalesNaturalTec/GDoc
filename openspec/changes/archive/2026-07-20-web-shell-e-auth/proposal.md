## Why

O backend do GDoc está completo (Épicos 1–9, US 9.2 inclusa) e autentica por
**sessão em cookie `HttpOnly` + `SameSite=Strict`, sem CORS** (ver
`apps/api/src/routes/auth.ts` e `middleware/tenant-context.ts`). Não existe
frontend: `apps/web` é apenas um lugar reservado (`workspaces: ["apps/*"]`,
script `dev:web` no root, bucket+CDN em `infra/terraform/frontend.tf`), sem
diretório criado. Esta fatia entrega a **fundação da SPA** — projeto Vite +
React + TypeScript com o **design system Ant Design** (em vez de Tailwind cru) —
e o **fluxo de autenticação + shell de layout + guarda de rota** (PRD US 1.2).
É a fatia que **desbloqueia todas as demais** (navegação, upload, busca,
permissões, lixeira, auditoria, pessoas, painel), catalogadas em
`docs/frontend_roadmap.md`.

A restrição de cookie `SameSite=Strict` sem CORS impõe que a SPA seja servida
**na mesma origem** da API. Esta change fixa essa decisão de arquitetura e a
realiza sem tocar na API: **proxy do Vite** em desenvolvimento e regra de
**roteamento por path no url-map** (Cloud Run) em produção.

## What Changes

- **Novo workspace `apps/web`**: Vite + React 18 + TypeScript `strict`
  (herdando `tsconfig.base.json`), ESLint/Prettier do root, Vitest + Testing
  Library, e consumo de `@gdoc/shared` como fonte única de DTOs
  (`AuthenticatedIdentity`, `LoginRequest`, etc.). Scripts
  `dev`/`build`/`lint`/`test` para casar com `npm run <x> --workspaces`.
- **Design system Ant Design v5**: `ConfigProvider` com tokens de tema (visual
  premium do NFR de usabilidade), `locale` pt-BR e wrapper `<App>` para as APIs
  de `message`/`notification`/`Modal`. Sem Tailwind.
- **Camada de dados**: `apiClient` fino sobre `fetch` com
  `credentials: 'include'`; **TanStack Query** para estado de servidor; um
  tratamento central de **401 → redireciona a `/login`**; validação de fronteira
  com **Zod** espelhando os DTOs.
- **Autenticação (US 1.2)**: página de **login** (`Form` do AntD) → `POST
  /auth/login`; **bootstrap de sessão** por `GET /auth/me` ao abrir a app;
  **logout** → `POST /auth/logout`; **contexto de sessão** e **guarda de rota**
  que redireciona a `/login` quando não autenticado e trata a expiração/conta
  desativada (401) encerrando a sessão no cliente.
- **App shell**: `Layout` do AntD (Sider/Header/Content) com `Menu` de
  navegação, exibição da identidade e do papel do usuário, e ação de logout —
  o casco onde as fatias seguintes montam suas telas.
- **Mesma origem (dev + prod)**: **proxy do Vite** encaminhando os prefixos de
  API (`/auth`, `/files`, `/folders`, `/users`, `/grants`, `/trash`, `/audit`,
  `/dashboard`, `/search`, `/health`) para a API local — o browser vê tudo como
  mesma origem, o cookie `Strict` flui e **nenhum CORS é necessário**; em
  produção, um `path_matcher` no url-map (`infra/terraform/frontend.tf`)
  roteando esses prefixos para um **serverless NEG** da Cloud Run, mantendo
  SPA+API na mesma origem sob o load balancer.

### Fora de escopo (fatias futuras — ver `docs/frontend_roadmap.md`)

- **Todas as demais telas de feature**: navegação/explorador, visualização +
  download, upload em lote/pasta, busca e filtros, permissões granulares,
  lixeira, auditoria, gestão de pessoas e painel gerencial — cada uma é uma
  fatia/change própria, listada no roadmap, e depende apenas deste shell.
- **Qualquer mudança na API** (`apps/api`) ou nos contratos (`packages/shared`):
  a API fica **intocada**; esta fatia só a consome.
- **Aplicação real do Terraform**: como todo o `infra/terraform` do repo, a
  regra de url-map é **escrita mas não aplicada** (nenhum projeto GCP vivo);
  entra como código de infra, não como deploy.
- **Pipeline de build/deploy do web no CI/CD**: o passo de publicar o `vite
  build` no bucket pode entrar aqui de forma mínima ou virar ajuste próprio de
  CI — não é requisito de comportamento desta fatia.

## Capabilities

### New Capabilities
- `web-shell-e-auth`: fundação da SPA (projeto Vite/React/TS + Ant Design) e o
  fluxo de autenticação de ponta a ponta no cliente — login, bootstrap e
  encerramento de sessão, guarda de rota por autenticação/papel e o shell de
  layout — servida na mesma origem da API para preservar o cookie de sessão
  `HttpOnly`/`SameSite=Strict` sem CORS. Cobre o lado de frontend da **US 1.2**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona o frontend e uma regra de roteamento de mesma origem
     na infra (código, não aplicado). -->

## Impact

- **Novo código** (`apps/web`): projeto Vite/React/TS com Ant Design, `apiClient`,
  provider do TanStack Query, roteador (React Router) com guarda, contexto de
  sessão, página de login e componentes de shell; `vite.config.ts` com o proxy
  dos prefixos de API.
- **Contratos** (`packages/shared`): **sem mudança** — consumidos como estão
  (`AuthenticatedIdentity`, `LoginRequest`, `UserRole`).
- **API** (`apps/api`): **sem mudança** — a decisão de mesma origem evita CORS e
  qualquer ajuste no backend.
- **Infra** (`infra/terraform/frontend.tf`): adiciona `path_matcher` no url-map
  roteando os prefixos de API para um serverless NEG da Cloud Run (escrito, não
  aplicado). Tarefa de infra, separada das de paridade dev.
- **Paridade dev**: proxy do Vite (`apps/web`) resolve a mesma origem localmente;
  o SessionStart hook **não muda** (segue só provisionando infra; a SPA roda sob
  demanda via `npm run dev:web`, como a API).
- **Docs**: novo `docs/frontend_roadmap.md` catalogando todas as fatias do
  frontend, para continuidade de implementação em partes.
- **Testes** (`apps/web`, Vitest + Testing Library): login com sucesso navega ao
  shell; credenciais inválidas mostram erro genérico; rota protegida sem sessão
  redireciona a `/login`; 401 em chamada autenticada encerra a sessão no cliente
  e redireciona; logout limpa a sessão.
