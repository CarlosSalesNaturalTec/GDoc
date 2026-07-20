## 1. Scaffold do workspace `apps/web`

- [x] 1.1 Criar `apps/web` como workspace (Vite + React 18 + TypeScript
  `strict`, herdando `tsconfig.base.json`); `package.json` com scripts
  `dev`/`build`/`lint`/`test` casando com `npm run <x> --workspaces`
- [x] 1.2 Instalar e configurar dependências: `antd` (v5), `@tanstack/react-query`,
  `react-router-dom`, `zod`; dev: `vitest`, `@testing-library/react`,
  `@testing-library/user-event`, `jsdom`
- [x] 1.3 Integrar ESLint/Prettier do root ao workspace (sem regras próprias
  divergentes); garantir que `@gdoc/shared` resolve pelo `dist` compilado

## 2. Mesma origem (dev + prod)

- [x] 2.1 `vite.config.ts`: `server.proxy` encaminhando os prefixos de API
  (`/auth`, `/files`, `/folders`, `/users`, `/grants`, `/trash`, `/audit`,
  `/dashboard`, `/search`, `/health`) para `http://localhost:8080`, com a lista
  centralizada e comentada
- [x] 2.2 `infra/terraform/frontend.tf`: adicionar `path_matcher` no url-map
  roteando os mesmos prefixos para um serverless NEG da Cloud Run e `/*` para o
  bucket (escrito, não aplicado); documentar no `infra/terraform/README.md` como
  pré-requisito de deploy

## 3. Fundação de app (tema, dados, roteamento)

- [x] 3.1 `ConfigProvider` do Ant Design com tokens de tema (cor primária, raio,
  tipografia) e `locale` pt-BR; envolver a árvore no wrapper `<App>` do AntD
- [x] 3.2 `QueryClientProvider` (TanStack Query) na raiz
- [x] 3.3 `apiClient` sobre `fetch` com `credentials: 'include'` e tratamento
  central de **401 → limpa sessão e redireciona a `/login`**; validação de
  fronteira com Zod espelhando os DTOs de `@gdoc/shared`
- [x] 3.4 Roteador (React Router) com layout raiz e rota-guarda

## 4. Autenticação (US 1.2)

- [x] 4.1 Contexto de sessão guardando a `AuthenticatedIdentity`; bootstrap por
  `GET /auth/me` ao montar a app
- [x] 4.2 Página de login (`Form` do AntD) → `POST /auth/login`; sucesso registra
  identidade e navega ao shell; erro **401** exibe mensagem **genérica** de
  credenciais inválidas; erro **403** exibe aviso **específico** de conta
  desativada (US 1.2 cenário 3), sem confundir as duas mensagens
- [x] 4.3 Ação de logout → `POST /auth/logout` + limpeza do estado de sessão
- [x] 4.4 Guarda de rota: sem sessão → `/login`; rotas de administração exigem
  `unit_admin`/`global_admin`

## 5. Shell de layout

- [x] 5.1 `Layout` do AntD (Sider/Header/Content) com `Menu` de navegação, itens
  condicionados ao papel, exibição da identidade/papel e ação de logout
- [x] 5.2 Área de conteúdo com `Outlet` para as fatias futuras montarem telas

## 6. Testes (`apps/web`, Vitest + Testing Library)

- [x] 6.1 Login com credenciais válidas navega ao shell
- [x] 6.2 Credenciais inválidas (401) exibem mensagem genérica e permanecem no
  login
- [x] 6.3 Conta desativada (403) exibe aviso específico, distinto da mensagem
  genérica, e permanece no login
- [x] 6.4 Rota protegida sem sessão redireciona a `/login`
- [x] 6.5 401 em chamada autenticada encerra a sessão no cliente e redireciona
- [x] 6.6 Item/rota de administração não é oferecido a `collaborator`

## 7. Verificação e fechamento

- [x] 7.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  passando
- [x] 7.2 `openspec verify --change web-shell-e-auth` antes de arquivar
